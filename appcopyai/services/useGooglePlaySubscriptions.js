import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  ErrorCode,
  getAvailablePurchases as readAvailablePurchases,
  useIAP,
} from "react-native-iap";
import {
  GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS,
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS,
  normalizeGooglePlaySubscriptionOffers,
} from "./subscriptions";

const GOOGLE_PLAY_CONNECTION_HELP = "Google Play is not ready. Open Play Store, sign in, then return and retry.";

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
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [productLoadStatus, setProductLoadStatus] = useState("loading");
  const handled = useRef(new Set());
  const productFetchAttemptedFor = useRef("");
  const productLoadTimer = useRef(null);
  const userId = user?._id || user?.id || null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const configuredProductId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
  const configuredIntroductoryOfferId = configuration?.introductoryOfferId
    || GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory24Hour;

  const verifyAndFinish = useCallback(async purchase => {
    if (Platform.OS !== "android" || !userId) return null;
    if (purchase?.purchaseState === "pending") {
      setWorking(false);
      setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
      return null;
    }
    const expectedProductId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
    if (purchase?.productId !== expectedProductId || !purchase?.purchaseToken) {
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
      // Acknowledge only after the backend has verified the token with Google Play
      // and persisted ownership for this Skillomate account.
      await iapRef.current.finishTransaction({ purchase, isConsumable: false });
      if (currentUserId.current === userId) {
        setConfiguration(current => ({ ...current, ...entitlement }));
        setNotice(entitlement.entitlementActive
          ? "Your Google Play subscription is active."
          : "This Google Play purchase has no active access period.");
        await onEntitlementChanged?.(entitlement);
      }
      return entitlement;
    } catch (verificationError) {
      handled.current.delete(callbackKey);
      setError(verificationError?.message || "Could not verify this Google Play purchase. Please retry.");
      return null;
    } finally {
      setWorking(false);
    }
  }, [configuration?.productId, onEntitlementChanged, session, userId]);

  const iap = useIAP({
    onPurchaseSuccess: purchase => { verifyAndFinish(purchase); },
    onPurchaseError: purchaseError => {
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) {
        setNotice("Purchase cancelled. No charge was made.");
        setError("");
      } else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) {
        setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
        setError("");
      } else {
        setError("The Google Play purchase could not be completed. Please try again.");
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
    if (next?.entitlementState && next.entitlementState !== "NONE") {
      await onEntitlementChanged?.(next);
    }
    return next;
  }, [onEntitlementChanged, session, userId]);

  useEffect(() => {
    setConfiguration(null);
    handled.current.clear();
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
    if (!iapRef.current.connected) {
      if (!retry || typeof iapRef.current.reconnect !== "function" || !await iapRef.current.reconnect()) {
        setProductLoadStatus("error");
        setError(GOOGLE_PLAY_CONNECTION_HELP);
        return;
      }
    }
    if (productFetchAttemptedFor.current === productId && !retry) return;
    productFetchAttemptedFor.current = productId;
    clearTimeout(productLoadTimer.current);
    setProductLoadStatus("loading");
    setError("");
    try {
      await iapRef.current.fetchProducts({ skus: [productId], type: "subs" });
      productLoadTimer.current = setTimeout(() => {
        const found = iapRef.current.subscriptions.some(item => item.id === productId || item.productId === productId);
        if (!found) {
          setProductLoadStatus("error");
          setError("Could not load the Skillomate subscription from Google Play. Please retry.");
        }
      }, 4000);
    } catch (_) {
      setProductLoadStatus("error");
      setError("Could not load the Skillomate subscription from Google Play. Please retry.");
    }
  }, [configuration?.productId]);

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

  useEffect(() => () => clearTimeout(productLoadTimer.current), []);

  const product = useMemo(() => iap.subscriptions.find(
    item => item.id === configuredProductId || item.productId === configuredProductId
  ) || null, [configuredProductId, iap.subscriptions]);
  const offerDetails = useMemo(
    () => normalizeGooglePlaySubscriptionOffers(product, configuredIntroductoryOfferId),
    [configuredIntroductoryOfferId, product],
  );

  useEffect(() => {
    if (!product) return;
    clearTimeout(productLoadTimer.current);
    setProductLoadStatus("ready");
    setError(current => current.includes("load the Skillomate subscription") ? "" : current);
  }, [product]);

  const purchase = useCallback(async () => {
    const productId = configuration?.productId || GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
    const offerToken = offerDetails.purchaseOffer?.offerToken;
    if (working || !configuration?.obfuscatedAccountId || !product || !offerToken) {
      setError("The Google Play subscription is not ready. Refresh and try again.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await iap.requestPurchase({
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
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) setNotice("Purchase cancelled. No charge was made.");
      else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) setNotice("Purchase is pending. Premium will activate after Google Play confirms payment.");
      else setError("The Google Play purchase could not be started. Please try again.");
    }
  }, [configuration?.obfuscatedAccountId, configuration?.productId, iap, offerDetails.purchaseOffer?.offerToken, product, working]);

  const restore = useCallback(async () => {
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
  }, [configuration?.productId, iap.connected, refresh, verifyAndFinish]);

  const recurring = offerDetails.recurring;
  return {
    connected: iap.connected,
    entitlement: configuration,
    error,
    introductoryOffer: offerDetails.introductoryOffer,
    introductoryOfferEligibility: offerDetails.introductoryOffer ? "eligible" : (product ? "ineligible" : "unknown"),
    introductoryOfferEligible: Boolean(offerDetails.introductoryOffer),
    localizedPrice: recurring?.localizedPrice || product?.displayPrice || "",
    managementUrl: configuration?.managementUrl || "https://play.google.com/store/account/subscriptions",
    notice,
    period: recurring?.period || "month",
    product,
    productLoadStatus,
    purchase,
    purchaseReady: Boolean(product && offerDetails.purchaseOffer?.offerToken && configuration?.obfuscatedAccountId),
    refresh,
    restore,
    retryProductLoad: () => loadProduct(true),
    working,
  };
}
