function hasStoreBillingEvidence(provider, record) {
  if (!record) return false;
  const entitlementState = String(record.entitlementState || '').toUpperCase();
  const meaningfulState = entitlementState && !['NONE', 'UNKNOWN'].includes(entitlementState);
  if (provider === 'app_store') {
    return Boolean(record.entitlementActive
      || record.productId
      || record.originalTransactionId
      || record.latestTransactionId
      || record.purchasedAt
      || record.expiresAt
      || record.lastVerifiedAt
      || record.revokedAt
      || meaningfulState);
  }
  return Boolean(record.entitlementActive
    || record.productId
    || record.latestOrderId
    || record.expiresAt
    || record.lastVerifiedAt
    || meaningfulState);
}

module.exports = { hasStoreBillingEvidence };
