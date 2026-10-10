import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  ErrorCode,
  fetchProducts as readProducts,
  getAvailablePurchases as readAvailablePurchases,
  useIAP,
} from "react-native-iap";
import {
  GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS,
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS,
  diagnoseGooglePlaySubscriptionOffers,
  normalizeGooglePlaySubscriptionOffers,
} from "./subscriptions";

const GOOGLE_PLAY_CONNECTION_HELP = "Google Play is not ready. Open Play Store, sign in, then return and retry.";
const GOOGLE_PLAY_PRODUCT_TIMEOUT_MS = 12_000;
const GOOGLE_PLAY_BILLING_DIAGNOSTICS_ENABLED = Boolean(
  __DEV__ || process.env.EXPO_PUBLIC_GOOGLE_PLAY_BILLING_DIAGNOSTICS === "1",
);

const UNAVAILABLE_GOOGLE_PLAY_SUBSCRIPTION = {
  connected: false,
  entitlement: null,
  error: "",
  introductoryOffer: null,
  introductoryOfferEligibility: "unavailable",
  introductoryOfferEligible: false,
  localizedPrice: "",
  managementUrl: "https://play.google.com/store/account/subscriptions",
  notice: "",
  period: "month",
  product: null,
  productLoadStatus: "idle",
  purchase: async () => {},
  purchaseReady: false,
  refresh: async () => null,
  restore: async () => {},
  retryProductLoad: async () => {},
  working: false,
};

export function useGooglePlaySubscriptions({ session, user, onEntitlementChanged }) {
  if (Platform.OS !== "android") return UNAVAILABLE_GOOGLE_PLAY_SUBSCRIPTION;

  const [configuration, setConfiguration] = useState(null);
  const [configurationOwner, setConfigurationOwner] = useState(null);
  const [workingContext, setWorkingContext] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [billingDiagnostics, setBillingDiagnostics] = useState(null);
  const [productLoadStatus, setProductLoadStatus] = useState("loading");
  const [loadedProduct, setLoadedProduct] = useState(null);
  const handled = useRef(new Set());
  const productFetchAttemptedFor = useRef("");
  const productRequestVersion = useRef(0);
  const purchaseInProgress = useRef(null);
  const reloadProduct = useRef(null);
  const userId = user?._id || user?.id || null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const configuredProductId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
  const configuredIntroductoryOfferId = configuration?.introductoryOfferId
    || GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory;
  const checkoutContext = JSON.stringify([userId, configuredProductId, configuredIntroductoryOfferId,
    configurationOwner, configuration?.obfuscatedAccountId || null]);
  const currentCheckoutContext = useRef(checkoutContext);
  currentCheckoutContext.current = checkoutContext;
  // Work for an old account/configuration must neither block a new checkout
  // nor clear its busy state when an older asynchronous operation completes.
  const working = workingContext === checkoutContext;
  const setWorking = useCallback(active => {
    setWorkingContext(current => active ? checkoutContext : (current === checkoutContext ? null : current));
  }, [checkoutContext]);
  const clearPurchaseLock = useCallback(() => {
    if (purchaseInProgress.current?.context === checkoutContext) purchaseInProgress.current = null;
  }, [checkoutContext]);

  const verifyAndFinish = useCallback(async purchase => {
    if (Platform.OS !== "android" || !userId || currentCheckoutContext.current !== checkoutContext) return null;
    if (purchase?.purchaseState === "pending") {
      clearPurchaseLock();
      setWorking(false);
      setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
      return null;
    }
    const expectedProductId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
    if (purchase?.productId !== expectedProductId || !purchase?.purchaseToken) {
      clearPurchaseLock();
      setWorking(false);
      setError("Google Play did not return a valid Skillomate subscription purchase.");
      return null;
    }
    const callbackKey = purchase.transactionId || purchase.id || purchase.purchaseToken.slice(-48);
    if (handled.current.has(callbackKey)) return null;
    handled.current.add(callbackKey);
    setWorking(true);
    setError("");
    try {
      const entitlement = await session.requestJson("/api/google-play-iap/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseToken: purchase.purchaseToken }),
      });
      if (!entitlement?.entitlementState) throw new Error("Google Play verification returned an incomplete response.");
      // New backends acknowledge after verified ownership is persisted. Keep
      // client acknowledgement as a recovery path for a verified active payment,
      // while never acknowledging a pending/inactive backend snapshot.
      if (entitlement.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
        && entitlement.entitlementActive === true) {
        await iapRef.current.finishTransaction({ purchase, isConsumable: false });
      }
      if (currentUserId.current === userId && currentCheckoutContext.current === checkoutContext) {
        setConfiguration(current => ({ ...current, ...entitlement }));
        setConfigurationOwner(userId);
        setNotice(entitlement.entitlementActive
          ? "Your Google Play subscription is active."
          : "This Google Play purchase has no active access period.");
        await onEntitlementChanged?.(entitlement);
      }
      if (!entitlement.entitlementActive
        && entitlement.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
        // Pending payment can later complete under the same transaction key.
        handled.current.delete(callbackKey);
      }
      return entitlement;
    } catch (verificationError) {
      handled.current.delete(callbackKey);
      if (currentCheckoutContext.current === checkoutContext) {
        setError(verificationError?.message || "Could not verify this Google Play purchase. Please retry.");
      }
      return null;
    } finally {
      clearPurchaseLock();
      setWorking(false);
    }
  }, [checkoutContext, clearPurchaseLock, configuration?.productId, onEntitlementChanged, session, setWorking, userId]);

  const iap = useIAP({
    onPurchaseSuccess: purchase => { verifyAndFinish(purchase); },
    onPurchaseError: async purchaseError => {
      if (currentCheckoutContext.current !== checkoutContext) return;
      clearPurchaseLock();
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) {
        setNotice("Purchase cancelled. No charge was made.");
        setError("");
      } else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) {
        setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
        setError("");
      } else {
        // Eligibility can change between the preflight query and Google's
        // purchase sheet. Refresh terms, but never start a replacement purchase.
        const failedContext = currentCheckoutContext.current;
        const next = await reloadProduct.current?.();
        if (next && currentCheckoutContext.current === failedContext) {
          setError("The Google Play purchase could not be completed. Review the current price and try again.");
        }
      }
    },
    onError: connectionError => {
      const message = String(connectionError?.message || "");
      const disconnected = connectionError?.responseCode === -1
        || connectionError?.code === "init-connection"
        || /initialize (?:iap|billing) connection|service.disconnected/i.test(message);
      setError(disconnected
        ? GOOGLE_PLAY_CONNECTION_HELP
        : "Google Play is temporarily unavailable. Please try again.");
    },
  });
  const iapRef = useRef(iap);
  iapRef.current = iap;

  useEffect(() => {
    if (!userId || iap.connected) return undefined;
    let stopped = false;
    let timer;
    const delays = [1200, 3500, 8000];
    const reconnectAt = index => {
      if (index >= delays.length) return;
      timer = setTimeout(async () => {
        if (stopped || iapRef.current.connected) return;
        const connected = await iapRef.current.reconnect().catch(() => false);
        if (!connected && !stopped) reconnectAt(index + 1);
      }, delays[index]);
    };
    reconnectAt(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [iap.connected, userId]);

  const refresh = useCallback(async () => {
    if (Platform.OS !== "android" || !userId) return null;
    setError("");
    const next = await session.requestJson("/api/google-play-iap/config");
    if (currentUserId.current !== userId) return null;
    setConfiguration(next);
    setConfigurationOwner(userId);
    if (next?.entitlementState && next.entitlementState !== "NONE") {
      await onEntitlementChanged?.(next);
    }
    return next;
  }, [onEntitlementChanged, session, userId]);

  useEffect(() => {
    setConfiguration(null);
    setConfigurationOwner(null);
    setLoadedProduct(null);
    handled.current.clear();
    purchaseInProgress.current = null;
    productFetchAttemptedFor.current = "";
    if (!userId) return;
    refresh().catch(() => setError("Could not refresh Google Play subscription status."));
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const refreshQuietly = () => refresh().catch(() => {});
    const interval = setInterval(refreshQuietly, 15 * 60 * 1000);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refreshQuietly();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId || !configuration?.expiresAt) return undefined;
    const expiresAt = new Date(configuration.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;
    const delay = Math.min(Math.max(expiresAt - Date.now() + 5000, 1000), 2_147_000_000);
    const timer = setTimeout(() => refresh().catch(() => {}), delay);
    return () => clearTimeout(timer);
  }, [configuration?.expiresAt, refresh, userId]);

  const loadProduct = useCallback(async (retry = false) => {
    const productId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
    const requestContext = checkoutContext;
    if (productFetchAttemptedFor.current === requestContext && !retry) return null;
    const requestVersion = ++productRequestVersion.current;
    const isCurrentRequest = () => currentCheckoutContext.current === requestContext
      && productRequestVersion.current === requestVersion;
    let timeout;
    try {
      if (!iapRef.current.connected) {
        if (!retry || typeof iapRef.current.reconnect !== "function" || !await iapRef.current.reconnect()) {
          if (isCurrentRequest()) {
            setProductLoadStatus("error");
            setError(GOOGLE_PLAY_CONNECTION_HELP);
          }
          return null;
        }
      }
      if (!isCurrentRequest()) return null;
      productFetchAttemptedFor.current = requestContext;
      setProductLoadStatus("loading");
      setError("");
      // useIAP.fetchProducts merges its cache and returns void. Use the direct
      // API result so an unavailable offer cannot survive in cached products.
      const products = await Promise.race([
        readProducts({ skus: [productId], type: "subs" }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Google Play product query timed out.")), GOOGLE_PLAY_PRODUCT_TIMEOUT_MS);
        }),
      ]);
      if (!isCurrentRequest()) return null;
      const next = (Array.isArray(products) ? products : [])
        .find(item => item.id === productId || item.productId === productId) || null;
      setLoadedProduct(next);
      const offers = normalizeGooglePlaySubscriptionOffers(next, configuredIntroductoryOfferId);
      const diagnostics = GOOGLE_PLAY_BILLING_DIAGNOSTICS_ENABLED
        ? diagnoseGooglePlaySubscriptionOffers(next, configuredIntroductoryOfferId)
        : null;
      setBillingDiagnostics(diagnostics);
      if (diagnostics) {
        // Non-sensitive Internal Testing diagnostics only: never log purchase
        // tokens, account identifiers, credentials, or raw offer tokens.
        console.info("[SkillomateGooglePlayBillingDiagnostics]", diagnostics);
      }
      if (!offers.purchaseOffer) {
        setProductLoadStatus("error");
        setError("No available Skillomate subscription offer was returned by Google Play. Please retry.");
        return null;
      }
      setProductLoadStatus("ready");
      return next;
    } catch (_) {
      if (isCurrentRequest()) {
        setLoadedProduct(null);
        setBillingDiagnostics(null);
        setProductLoadStatus("error");
        setError("Could not load the Skillomate subscription from Google Play. Please retry.");
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, [checkoutContext, configuration?.productId, configuredIntroductoryOfferId]);
  reloadProduct.current = () => loadProduct(true);

  useEffect(() => {
    if (!userId) return undefined;
    if (iap.connected) loadProduct();
    else {
      productFetchAttemptedFor.current = "";
      const timer = setTimeout(() => {
        setProductLoadStatus("error");
        setError(GOOGLE_PLAY_CONNECTION_HELP);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [iap.connected, loadProduct, userId]);

  useEffect(() => () => {
    currentCheckoutContext.current = null;
    productRequestVersion.current += 1;
  }, []);

  const product = loadedProduct && (loadedProduct.id === configuredProductId
    || loadedProduct.productId === configuredProductId) ? loadedProduct : null;
  const offerDetails = useMemo(
    () => normalizeGooglePlaySubscriptionOffers(product, configuredIntroductoryOfferId),
    [configuredIntroductoryOfferId, product],
  );

  const purchase = useCallback(async () => {
    const productId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
    if (currentCheckoutContext.current !== checkoutContext
      || working || purchaseInProgress.current?.context === checkoutContext) return;
    if (!userId || configurationOwner !== userId || !configuration?.obfuscatedAccountId || !product || !offerDetails.purchaseOffer
      || productLoadStatus !== "ready") {
      setError("The Google Play subscription is not ready. Refresh and try again.");
      return;
    }
    const purchaseAttempt = { context: checkoutContext };
    purchaseInProgress.current = purchaseAttempt;
    setWorking(true);
    setError("");
    setNotice("");
    let purchaseStarted = false;
    try {
      const freshProduct = await loadProduct(true);
      if (currentCheckoutContext.current !== checkoutContext) return;
      const freshOffers = normalizeGooglePlaySubscriptionOffers(freshProduct, configuredIntroductoryOfferId);
      if (!freshOffers.purchaseOffer) return;
      if (freshOffers.purchaseOffer.termsKey !== offerDetails.purchaseOffer.termsKey) {
        setNotice("Google Play's available terms have changed. Review the updated price and tap Subscribe again to confirm.");
        return;
      }
      const offerToken = freshOffers.purchaseOffer.offerToken;
      purchaseStarted = true;
      await iapRef.current.requestPurchase({
        request: {
          google: {
            skus: [productId],
            subscriptionOffers: [{ sku: productId, offerToken }],
            obfuscatedAccountId: configuration.obfuscatedAccountId,
          },
        },
        type: "subs",
      });
    } catch (purchaseError) {
      purchaseStarted = false;
      if (currentCheckoutContext.current !== checkoutContext) return;
      if (purchaseError?.code === ErrorCode.UserCancelled) setNotice("Purchase cancelled. No charge was made.");
      else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
      else {
        await loadProduct(true);
        if (currentCheckoutContext.current === checkoutContext) {
          setError("The Google Play purchase could not be started. Review the current price and try again.");
        }
      }
    } finally {
      if (!purchaseStarted && purchaseInProgress.current === purchaseAttempt) {
        purchaseInProgress.current = null;
        setWorking(false);
      }
    }
  }, [checkoutContext, configuration?.obfuscatedAccountId, configuration?.productId,
    configurationOwner, configuredIntroductoryOfferId, loadProduct, offerDetails.purchaseOffer,
    product, productLoadStatus, setWorking, userId, working]);

  const restore = useCallback(async () => {
    if (currentCheckoutContext.current !== checkoutContext) return;
    if (!iap.connected) {
      setError("Google Play is not connected yet. Please retry.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const purchases = await readAvailablePurchases();
      const productId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
      const matching = (purchases || []).filter(item => item.productId === productId);
      if (!matching.length) {
        setNotice("No previous Skillomate subscription was found for this Google Play account.");
        return;
      }
      let restored = false;
      for (const restoredPurchase of matching) {
        if ((await verifyAndFinish(restoredPurchase))?.entitlementActive) restored = true;
      }
      const current = await refresh();
      setNotice(restored || current?.entitlementActive ? "Purchases restored." : "No currently active purchase could be restored.");
    } catch (_) {
      setError("Purchases could not be restored. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }, [checkoutContext, configuration?.productId, iap.connected, refresh, setWorking, verifyAndFinish]);

  const recurring = offerDetails.recurring;
  return {
    connected: iap.connected,
    billingDiagnostics,
    entitlement: configuration,
    error,
    introductoryOffer: offerDetails.introductoryOffer,
    introductoryOfferEligibility: offerDetails.introductoryOffer ? "eligible" : (product ? "ineligible" : "unknown"),
    introductoryOfferEligible: Boolean(offerDetails.introductoryOffer),
    localizedPrice: recurring?.localizedPrice || "",
    managementUrl: configuration?.managementUrl || "https://play.google.com/store/account/subscriptions",
    notice,
    period: recurring?.period || "month",
    product,
    productLoadStatus,
    purchase,
    purchaseReady: Boolean(productLoadStatus === "ready" && product && offerDetails.purchaseOffer?.offerToken
      && configuration?.obfuscatedAccountId && userId && configurationOwner === userId),
    refresh,
    restore,
    retryProductLoad: () => loadProduct(true),
    working,
  };
}
