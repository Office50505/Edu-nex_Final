import { useState } from "react";
import { Alert } from "react-native";
import { mockPaymentResult } from "./mockPayments";

const INITIAL_NOTICE = "TEST PAYMENT · Sample price only. No charge, renewal, or premium access.";

export function useMockPayments() {
  const [result, setResult] = useState({ error: "", notice: INITIAL_NOTICE });
  const [working, setWorking] = useState(false);
  const finish = outcome => {
    setResult(mockPaymentResult(outcome));
    setWorking(false);
  };
  const purchase = () => {
    if (working) return;
    setWorking(true);
    setResult({ error: "", notice: INITIAL_NOTICE });
    Alert.alert("Test payment", "Sample: ₹199 per month. Choose a simulated result. No money will be charged.", [
      { text: "Cancel", style: "cancel", onPress: () => finish("cancel") },
      { text: "Decline", onPress: () => finish("failure") },
      { text: "Success", onPress: () => finish("success") },
    ], { cancelable: true, onDismiss: () => finish("cancel") });
  };
  return {
    isMock: true,
    connected: false,
    entitlement: null,
    product: null,
    productLoadStatus: "ready",
    localizedPrice: "₹199 (test)",
    period: "month",
    introductoryOfferEligible: false,
    purchaseReady: !working,
    working,
    ...result,
    purchase,
    restore: () => setResult({ error: "", notice: "Test restore complete. No real purchases were queried or restored." }),
    retryProductLoad: () => setResult({ error: "", notice: INITIAL_NOTICE }),
    refresh: async () => null,
  };
}
