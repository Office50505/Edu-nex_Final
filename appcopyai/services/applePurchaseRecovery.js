function isAppleSignedTransaction(value) {
  // Shape check only. Apple's signature and ownership are verified by the server.
  return typeof value === "string" && value.length >= 100 && value.length <= 100000
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

async function resolveAppleSignedPurchase(purchase, readAvailable) {
  if (isAppleSignedTransaction(purchase.purchaseToken)) return purchase;
  const id = String(purchase.transactionId || purchase.id || "");
  if (id) {
    const history = await readAvailable({ onlyIncludeActiveItemsIOS: false, alsoPublishToEventListenerIOS: false });
    const signed = (history || []).find(item => item.productId === purchase.productId
      && String(item.transactionId || item.id || "") === id
      && isAppleSignedTransaction(item.purchaseToken));
    if (signed) return { ...purchase, purchaseToken: signed.purchaseToken };
  }
  // Never substitute the latest transaction for a different unfinished one or
  // finish the original based on another transaction's successful verification.
  throw new Error("Apple did not return signed data for this transaction. Please try Restore Purchases.");
}

function createAppleTransactionVerifier() {
  const attempts = new Map();
  return function verifyOnce(purchase, verify) {
    const key = purchase.transactionId || purchase.id || purchase.purchaseToken;
    if (attempts.has(key)) return attempts.get(key);
    const attempt = Promise.resolve().then(() => verify(purchase));
    attempts.set(key, attempt);
    // Failed verification/finishing stays retryable. Successful duplicate events
    // share the result instead of starting another finish or clearing UI state.
    attempt.catch(() => { if (attempts.get(key) === attempt) attempts.delete(key); });
    return attempt;
  };
}

async function recoverApplePurchases({ productId, readPending, readAvailable, includeAvailable = false, verify, refresh }) {
  const pending = await readPending();
  // OpenIAP 1.3.15 returns a transaction ID instead of JWS in pending snapshots.
  // Transaction history retains the original JWS, including for expired items.
  const needsSignedHistory = (pending || []).some(purchase => purchase.productId === productId
    && purchase.purchaseState !== "pending" && !isAppleSignedTransaction(purchase.purchaseToken));
  const available = includeAvailable || needsSignedHistory
    ? await readAvailable({ onlyIncludeActiveItemsIOS: false, alsoPublishToEventListenerIOS: false })
    : [];
  const matching = [...(pending || []), ...(available || [])].filter(purchase => purchase.productId === productId);
  let awaitingApproval = false;
  const seen = new Set();
  for (const purchase of matching) {
    const key = purchase.transactionId || purchase.id || purchase.purchaseToken;
    if (seen.has(key)) continue;
    seen.add(key);
    if (purchase.purchaseState === "pending") {
      awaitingApproval = true;
      continue;
    }
    // Do not discard expired or foreign transactions locally. The server must
    // verify both authenticity and ownership before a transaction can be finished.
    await verify(await resolveAppleSignedPurchase(purchase, async () => available));
  }
  const entitlement = await refresh();
  return { entitlement, awaitingApproval, found: matching.length > 0 };
}

function applePurchaseErrorMessage(error) {
  switch (error?.code) {
    case "network-error":
    case "service-disconnected":
      return "Could not reach the App Store. Check your connection and try again.";
    case "item-unavailable":
    case "sku-not-found":
      return "This subscription is unavailable for your App Store account or region. Please contact support.";
    case "billing-unavailable":
    case "iap-not-available":
    case "user-error":
      return "Purchases are unavailable for this Apple account. Check your App Store payment settings and purchase restrictions.";
    default:
      return "The App Store purchase could not be completed. Please try again.";
  }
}

module.exports = { isAppleSignedTransaction, resolveAppleSignedPurchase, createAppleTransactionVerifier, recoverApplePurchases, applePurchaseErrorMessage };
