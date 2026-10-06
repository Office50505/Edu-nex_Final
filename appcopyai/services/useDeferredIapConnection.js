import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  endConnection,
  fetchProducts as fetchStoreProducts,
  finishTransaction as finishStoreTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase as requestStorePurchase,
} from "react-native-iap";

const EMPTY_LIST = [];

export function useDeferredIapConnection({ enabled = true, onPurchaseSuccess, onPurchaseError, onError } = {}) {
  const [connected, setConnected] = useState(false);
  const [subscriptions, setSubscriptions] = useState(EMPTY_LIST);
  const mountedRef = useRef(false);
  const listenersRef = useRef({ purchaseUpdate: null, purchaseError: null });
  const callbacksRef = useRef({ onPurchaseSuccess, onPurchaseError, onError });

  useEffect(() => {
    callbacksRef.current = { onPurchaseSuccess, onPurchaseError, onError };
  }, [onPurchaseSuccess, onPurchaseError, onError]);

  const cleanupListeners = useCallback(() => {
    listenersRef.current.purchaseUpdate?.remove?.();
    listenersRef.current.purchaseError?.remove?.();
    listenersRef.current = { purchaseUpdate: null, purchaseError: null };
  }, []);

  const registerListeners = useCallback(() => {
    if (!listenersRef.current.purchaseUpdate) {
      listenersRef.current.purchaseUpdate = purchaseUpdatedListener(purchase => {
        callbacksRef.current.onPurchaseSuccess?.(purchase);
      });
    }
    if (!listenersRef.current.purchaseError) {
      listenersRef.current.purchaseError = purchaseErrorListener(error => {
        callbacksRef.current.onPurchaseError?.(error);
      });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled) return false;
    try {
      const ok = await initConnection();
      if (!mountedRef.current) return false;
      if (ok) {
        registerListeners();
        setConnected(true);
        return true;
      }
      setConnected(false);
      return false;
    } catch (error) {
      cleanupListeners();
      if (mountedRef.current) setConnected(false);
      callbacksRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }, [cleanupListeners, enabled, registerListeners]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      cleanupListeners();
      setConnected(false);
      setSubscriptions(EMPTY_LIST);
      return () => { mountedRef.current = false; };
    }

    connect();
    return () => {
      mountedRef.current = false;
      cleanupListeners();
      setConnected(false);
      setSubscriptions(EMPTY_LIST);
      endConnection().catch(() => {});
    };
  }, [cleanupListeners, connect, enabled]);

  const fetchProducts = useCallback(async ({ skus, type = "in-app" }) => {
    if (!connected) return;
    try {
      const items = await fetchStoreProducts({ skus, type });
      if (type === "subs" && mountedRef.current) setSubscriptions(Array.isArray(items) ? items : EMPTY_LIST);
    } catch (error) {
      callbacksRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [connected]);

  const requestPurchase = useCallback(async params => {
    await requestStorePurchase(params);
  }, []);

  const finishTransaction = useCallback(async args => {
    await finishStoreTransaction(args);
  }, []);

  return useMemo(() => ({
    connected,
    subscriptions,
    fetchProducts,
    finishTransaction,
    requestPurchase,
    reconnect: connect,
  }), [connect, connected, fetchProducts, finishTransaction, requestPurchase, subscriptions]);
}
