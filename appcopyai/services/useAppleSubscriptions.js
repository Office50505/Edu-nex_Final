import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { ErrorCode, getAvailablePurchases as readAvailablePurchases, getPendingTransactionsIOS } from "react-native-iap";
import { useDeferredIapConnection } from "./useDeferredIapConnection";
import { APPLE_SUBSCRIPTION_PRODUCT_IDS } from "./subscriptions";
import { recordApplePurchaseError } from "./applePurchaseDiagnostics";
import { resolveAppleSignedPurchase, createAppleTransactionVerifier, recoverApplePurchases, applePurchaseErrorMessage } from "./applePurchaseRecovery";

const UNAVAILABLE_APPLE_SUBSCRIPTION = {
  connected: false,
  entitlement: null,
  error: "",
  localizedPrice: "",
  notice: "",
  product: null,
  purchase: async () => {},
  refresh: async () => null,
  restore: async () => {},
  working: false,
};

export function useAppleSubscriptions({ session, user, onEntitlementChanged }) {
  if (Platform.OS !== "ios") return UNAVAILABLE_APPLE_SUBSCRIPTION;

  const [configuration, setConfiguration] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [productLoadStatus, setProductLoadStatus] = useState(Platform.OS === "ios" ? "loading" : "idle");
  const verifier = useRef(null);
  const recovery = useRef(null);
  const recoverRef = useRef(null);
  const purchaseInProgress = useRef(false);
  const productFetchAttempted = useRef(false);
  const productLoadTimer = useRef(null);
  const userId = user?._id || user?.id || null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  if (verifier.current?.userId !== userId) {
    verifier.current = { userId, verify: createAppleTransactionVerifier() };
    purchaseInProgress.current = false;
    recovery.current = null;
  }

  const verifyAndFinish = useCallback(async (purchase) => {
    if (Platform.OS !== "ios" || !userId || currentUserId.current !== userId) return null;
    if (purchase?.purchaseState === "pending") {
      setWorking(false);
      setNotice("Purchase is pending approval. Premium will activate after Apple confirms it.");
      return null;
    }
    if (purchase?.productId !== APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly) {
      setWorking(false);
      setError("The App Store did not return a valid Skillomate subscription transaction.");
      throw new Error("The App Store did not return a valid Skillomate subscription transaction.");
    }
    return verifier.current.verify(purchase, async () => {
      setWorking(true);
      setError("");
      try {
        const signedPurchase = await resolveAppleSignedPurchase(purchase, readAvailablePurchases);
        const entitlement = await session.requestJson("/api/apple-iap/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTransaction: signedPurchase.purchaseToken }),
        });
        if (!entitlement?.entitlementState) throw new Error("The App Store verification response was incomplete.");
        if (currentUserId.current !== userId) throw new Error("Your account changed. Please retry from your current account.");
        // Finish only after the server verifies ownership and authenticity. A verified
        // expired transaction must also be finished so StoreKit does not redeliver it
        // forever; premium access still remains fail-closed.
        await iapRef.current.finishTransaction({ purchase, isConsumable: false });
        if (currentUserId.current === userId) {
          setConfiguration(current => ({ ...current, ...entitlement }));
          setNotice(entitlement.entitlementActive
            ? "Your App Store subscription is active."
            : "This App Store transaction has no active access period.");
          await onEntitlementChanged?.(entitlement);
        }
        return entitlement;
      } catch (verificationError) {
        recordApplePurchaseError("verify_or_finish", verificationError);
        // The transaction intentionally remains unfinished so StoreKit can redeliver it.
        if (currentUserId.current === userId) setError(verificationError?.message || "Could not verify this App Store purchase. Please retry.");
        throw verificationError;
      } finally {
        if (currentUserId.current === userId && !purchaseInProgress.current && !recovery.current) setWorking(false);
      }
    });
  }, [onEntitlementChanged, session, userId]);

  const iap = useDeferredIapConnection({
    enabled: Boolean(userId),
    onPurchaseSuccess: purchase => {
      verifyAndFinish(purchase).catch(() => {}).finally(() => {
        if (currentUserId.current === userId) {
          purchaseInProgress.current = false;
          if (!recovery.current) setWorking(false);
        }
      });
    },
    onPurchaseError: purchaseError => {
      recordApplePurchaseError("purchase_listener", purchaseError);
      if (purchaseError?.code === "duplicate-purchase" || purchaseError?.code === ErrorCode.AlreadyOwned) {
        purchaseInProgress.current = false;
        recoverRef.current?.(true).catch(() => {});
        return;
      }
      purchaseInProgress.current = false;
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) {
        setNotice("Purchase cancelled. No charge was made.");
        setError("");
      } else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) {
        setNotice("Purchase is pending approval. Premium will activate after Apple confirms it.");
        setError("");
      } else {
        setError(applePurchaseErrorMessage(purchaseError));
      }
    },
    onError: storeError => {
      recordApplePurchaseError("store_connection", storeError);
      setError("The App Store is temporarily unavailable. Please try again.");
    },
  });
  const iapRef = useRef(iap);
  iapRef.current = iap;

  const refresh = useCallback(async () => {
    if (Platform.OS !== "ios" || !userId) return null;
    setError("");
    const next = await session.requestJson("/api/apple-iap/config");
    if (currentUserId.current !== userId) return null;
    setConfiguration(next);
    if (next?.entitlementState && next.entitlementState !== "NONE") {
      await onEntitlementChanged?.(next);
    }
    return next;
  }, [onEntitlementChanged, session, userId]);

  const recoverPurchases = useCallback((includeAvailable = false) => {
    if (recovery.current?.userId === userId) return recovery.current.promise;
    const operation = { userId, promise: null };
    recovery.current = operation;
    setWorking(true);
    setError("");
    operation.promise = recoverApplePurchases({
      productId: APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly,
      readPending: getPendingTransactionsIOS,
      readAvailable: readAvailablePurchases,
      includeAvailable,
      verify: verifyAndFinish,
      refresh,
    }).then(result => {
      if (currentUserId.current === userId) {
        setNotice(result.awaitingApproval
          ? "Purchase is pending approval. Premium will activate after Apple confirms it."
          : result.entitlement?.entitlementActive ? "Your App Store subscription is active."
          : result.found ? "Previous purchases checked. No active subscription was found. You can subscribe again." : "");
      }
      return result;
    }).catch(error => {
      recordApplePurchaseError("transaction_recovery", error);
      if (currentUserId.current === userId) setError(error?.message || "Could not recover your previous App Store purchase. Please try Restore Purchases.");
      throw error;
    }).finally(() => {
      if (recovery.current === operation) recovery.current = null;
      if (currentUserId.current === userId && !purchaseInProgress.current) setWorking(false);
    });
    return operation.promise;
  }, [refresh, userId, verifyAndFinish]);
  recoverRef.current = recoverPurchases;

  useEffect(() => {
    setConfiguration(null);
    if (Platform.OS !== "ios" || !userId) return;
    refresh().catch(() => setError("Could not refresh App Store subscription status."));
  }, [refresh, userId]);

  useEffect(() => {
    if (iap.connected && userId) recoverRef.current(false).catch(() => {});
  }, [iap.connected, userId]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !userId) return undefined;
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

  const loadProduct = useCallback(async (retry = false) => {
    if (Platform.OS !== "ios") return;
    if (!iapRef.current.connected) {
      if (!retry || typeof iapRef.current.reconnect !== "function" || !await iapRef.current.reconnect()) {
        setProductLoadStatus("error");
        setError("Could not connect to the App Store. Please retry.");
        return;
      }
    }
    if (productFetchAttempted.current && !retry) return;
    productFetchAttempted.current = true;
    clearTimeout(productLoadTimer.current);
    setProductLoadStatus("loading");
    setError("");
    try {
      await iapRef.current.fetchProducts({ skus: [APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly], type: "subs" });
      productLoadTimer.current = setTimeout(() => {
        const found = iapRef.current.subscriptions.some(item => item.id === APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly || item.productId === APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly);
        if (!found) {
          setProductLoadStatus("error");
          setError("Could not load the Skillomate subscription from the App Store. Please retry.");
        }
      }, 4000);
    } catch (_) {
      setProductLoadStatus("error");
      setError("Could not load the Skillomate subscription from the App Store. Please retry.");
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (iap.connected) loadProduct();
    else {
      productFetchAttempted.current = false;
      const timer = setTimeout(() => {
        setProductLoadStatus("error");
        setError("Could not connect to the App Store. Please retry.");
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [iap.connected, loadProduct]);

  useEffect(() => () => clearTimeout(productLoadTimer.current), []);

  const product = useMemo(() => {
    return iap.subscriptions.find(item => item.id === APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly || item.productId === APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly) || null;
  }, [iap.subscriptions]);

  useEffect(() => {
    if (!product) return;
    clearTimeout(productLoadTimer.current);
    setProductLoadStatus("ready");
    setError(current => current.includes("load the Skillomate subscription") ? "" : current);
  }, [product]);

  const purchase = useCallback(async () => {
    if (purchaseInProgress.current || recovery.current) return;
    if (Platform.OS !== "ios" || working || !configuration?.appAccountToken || !product) {
      setError("The App Store subscription is not ready. Refresh and try again.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      purchaseInProgress.current = true;
      const previous = await recoverPurchases(false);
      if (previous.awaitingApproval || previous.entitlement?.entitlementActive || currentUserId.current !== userId) {
        purchaseInProgress.current = false;
        setWorking(false);
        return;
      }
      await iap.requestPurchase({
        request: {
          apple: {
            sku: APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly,
            appAccountToken: configuration.appAccountToken,
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
        type: "subs",
      });
    } catch (purchaseError) {
      recordApplePurchaseError("purchase_request", purchaseError);
      purchaseInProgress.current = false;
      if (purchaseError?.code === "duplicate-purchase" || purchaseError?.code === ErrorCode.AlreadyOwned) {
        await recoverPurchases(true).catch(() => {});
        return;
      }
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) setNotice("Purchase cancelled. No charge was made.");
      else if ([ErrorCode.Pending, ErrorCode.DeferredPayment].includes(purchaseError?.code)) setNotice("Purchase is pending approval. Premium will activate after Apple confirms it.");
      else setError(purchaseError?.message || applePurchaseErrorMessage(purchaseError));
    }
  }, [configuration?.appAccountToken, product, working, recoverPurchases, userId]);

  const restore = useCallback(async () => {
    if (Platform.OS !== "ios" || !iap.connected) {
      setError("The App Store is not connected yet. Please retry.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await recoverPurchases(true);
      if (!result.found) {
        setNotice("No previous Skillomate subscription was found for this Apple ID.");
        return;
      }
      if (!result.awaitingApproval) setNotice(result.entitlement?.entitlementActive ? "Purchases restored." : "No currently active purchase could be restored.");
    } catch (restoreError) {
      setError(restoreError?.message || "Purchases could not be restored. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }, [iap.connected, recoverPurchases]);

  return {
    connected: iap.connected,
    entitlement: configuration,
    error,
    localizedPrice: product?.displayPrice || product?.localizedPriceIOS || "",
    period: product?.subscriptionPeriodNumberIOS && product?.subscriptionPeriodUnitIOS
      ? `${Number(product.subscriptionPeriodNumberIOS) === 1 ? "" : `${product.subscriptionPeriodNumberIOS} `}${String(product.subscriptionPeriodUnitIOS).toLowerCase()}${Number(product.subscriptionPeriodNumberIOS) === 1 ? "" : "s"}`
      : "month",
    notice,
    product,
    productLoadStatus,
    purchase,
    refresh,
    restore,
    retryProductLoad: () => loadProduct(true),
    working,
  };
}
