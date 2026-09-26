import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { ErrorCode, getAvailablePurchases as readAvailablePurchases, useIAP } from "react-native-iap";
import { APPLE_SUBSCRIPTION_PRODUCT_IDS } from "./subscriptions";

export function useAppleSubscriptions({ session, user, onEntitlementChanged }) {
  const [configuration, setConfiguration] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const handled = useRef(new Set());
  const userId = user?._id || user?.id || null;

  const verifyAndFinish = useCallback(async (purchase) => {
    if (Platform.OS !== "ios" || !userId || !purchase?.purchaseToken) return null;
    const callbackKey = purchase.transactionId || purchase.id || purchase.purchaseToken.slice(-48);
    if (handled.current.has(callbackKey)) return null;
    handled.current.add(callbackKey);
    setWorking(true);
    setError("");
    try {
      const entitlement = await session.requestJson("/api/apple-iap/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTransaction: purchase.purchaseToken }),
      });
      if (!entitlement?.entitlementState) throw new Error("The App Store verification response was incomplete.");
      // Finish only after the server verifies ownership and authenticity. A verified
      // expired transaction must also be finished so StoreKit does not redeliver it
      // forever; premium access still remains fail-closed.
      await iapRef.current.finishTransaction({ purchase, isConsumable: false });
      setConfiguration(current => ({ ...current, ...entitlement }));
      setNotice(entitlement.entitlementActive
        ? "Your App Store subscription is active."
        : "This App Store transaction has no active access period.");
      await onEntitlementChanged?.(entitlement);
      return entitlement;
    } catch (verificationError) {
      // The transaction intentionally remains unfinished so StoreKit can redeliver it.
      handled.current.delete(callbackKey);
      setError(verificationError?.message || "Could not verify this App Store purchase. Please retry.");
      return null;
    } finally {
      setWorking(false);
    }
  }, [onEntitlementChanged, session, userId]);

  const iap = useIAP({
    onPurchaseSuccess: purchase => { verifyAndFinish(purchase); },
    onPurchaseError: purchaseError => {
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) {
        setNotice("Purchase cancelled. No charge was made.");
        setError("");
      } else {
        setError("The App Store purchase could not be completed. Please try again.");
      }
    },
    onError: () => setError("The App Store is temporarily unavailable. Please try again."),
  });
  const iapRef = useRef(iap);
  iapRef.current = iap;

  const refresh = useCallback(async () => {
    if (Platform.OS !== "ios" || !userId) return null;
    setError("");
    const next = await session.requestJson("/api/apple-iap/config");
    setConfiguration(next);
    if (next?.entitlementState && next.entitlementState !== "NONE") {
      await onEntitlementChanged?.(next);
    }
    return next;
  }, [onEntitlementChanged, session, userId]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !userId) {
      setConfiguration(null);
      handled.current.clear();
      return;
    }
    refresh().catch(() => setError("Could not refresh App Store subscription status."));
  }, [refresh, userId]);

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

  useEffect(() => {
    if (Platform.OS !== "ios" || !iap.connected) return;
    iap.fetchProducts({
      skus: [configuration?.productId || APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly],
      type: "subs",
    }).catch(() => setError("Could not load the App Store subscription."));
  }, [configuration?.productId, iap.connected]);

  const product = useMemo(() => {
    const productId = configuration?.productId || APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly;
    return iap.subscriptions.find(item => item.id === productId || item.productId === productId) || null;
  }, [configuration?.productId, iap.subscriptions]);

  const purchase = useCallback(async () => {
    if (Platform.OS !== "ios" || !configuration?.appAccountToken || !product) {
      setError("The App Store subscription is not ready. Refresh and try again.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await iap.requestPurchase({
        request: {
          apple: {
            sku: configuration.productId || APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly,
            appAccountToken: configuration.appAccountToken,
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
        type: "subs",
      });
    } catch (purchaseError) {
      setWorking(false);
      if (purchaseError?.code === ErrorCode.UserCancelled) setNotice("Purchase cancelled. No charge was made.");
      else setError("The App Store purchase could not be started. Please try again.");
    }
  }, [configuration, iap, product]);

  const restore = useCallback(async () => {
    if (Platform.OS !== "ios" || !iap.connected) {
      setError("The App Store is not connected yet. Please retry.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const purchases = await readAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
      const matching = (purchases || []).filter(item => item.productId === (configuration?.productId || APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly));
      if (!matching.length) {
        setNotice("No previous Skillomate subscription was found for this Apple ID.");
        return;
      }
      let restored = false;
      for (const restoredPurchase of matching) {
        if ((await verifyAndFinish(restoredPurchase))?.entitlementActive) restored = true;
      }
      setNotice(restored ? "Purchases restored." : "No currently active purchase could be restored.");
    } catch (_) {
      setError("Purchases could not be restored. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }, [configuration?.productId, iap.connected, verifyAndFinish]);

  return {
    connected: iap.connected,
    entitlement: configuration,
    error,
    localizedPrice: product?.displayPrice || product?.localizedPriceIOS || "",
    notice,
    product,
    purchase,
    refresh,
    restore,
    working,
  };
}
