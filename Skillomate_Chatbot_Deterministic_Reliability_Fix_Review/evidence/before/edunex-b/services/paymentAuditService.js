const STALE_PENDING_MS = 30 * 60 * 1000;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function paymentReference(order) {
  return order.razorpayPaymentId || order.phonePeTransactionId || '';
}

function auditPaymentOrder(order, { now = new Date(), duplicateReferences = new Set() } = {}) {
  const issues = [];
  const createdAt = new Date(order.createdAt || 0);
  const amount = Number(order.totalAmount);
  const refundedAmount = Number(order.refundedAmount || 0);
  const reference = paymentReference(order);
  const gateway = String(order.gateway || 'phonepe').toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) issues.push({ code: 'invalid_amount', severity: 'critical', label: 'Invalid payment amount' });
  if (!Number.isFinite(refundedAmount) || refundedAmount < 0 || refundedAmount > Math.max(amount, 0)) {
    issues.push({ code: 'refund_mismatch', severity: 'critical', label: 'Refund exceeds captured amount' });
  }
  if (order.status === 'paid' && !order.paidAt) issues.push({ code: 'missing_paid_at', severity: 'warning', label: 'Paid date is missing' });
  if (order.status !== 'paid' && order.paidAt) issues.push({ code: 'unexpected_paid_at', severity: 'critical', label: 'Unpaid record has a paid date' });
  if (order.status === 'paid' && !hasText(reference)) issues.push({ code: 'missing_provider_reference', severity: 'critical', label: 'Provider payment ID is missing' });
  if (reference && duplicateReferences.has(reference)) issues.push({ code: 'duplicate_provider_reference', severity: 'critical', label: 'Provider payment ID is duplicated' });
  if (order.status === 'pending' && Number.isFinite(createdAt.getTime()) && now.getTime() - createdAt.getTime() > STALE_PENDING_MS) {
    issues.push({ code: 'stale_pending', severity: 'warning', label: 'Pending for more than 30 minutes' });
  }
  if (!order.user) issues.push({ code: 'missing_learner', severity: 'critical', label: 'Learner record is missing' });
  if (order.status === 'paid' && ['trial_charge', 'subscription_charge'].includes(order.orderType) && !order.subscription) {
    issues.push({ code: 'missing_subscription', severity: 'warning', label: 'Paid order is not linked to a subscription' });
  }
  if (gateway === 'razorpay' && order.status === 'paid' && !hasText(order.razorpayPaymentId)) {
    issues.push({ code: 'gateway_reference_mismatch', severity: 'critical', label: 'Razorpay order lacks a Razorpay payment ID' });
  }

  const risk = issues.some((issue) => issue.severity === 'critical') ? 'critical' : issues.length ? 'warning' : 'clear';
  return { issues, risk };
}

function duplicatePaymentReferences(orders) {
  const counts = new Map();
  for (const order of orders) {
    const reference = paymentReference(order);
    if (reference) counts.set(reference, (counts.get(reference) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([reference]) => reference));
}

module.exports = { STALE_PENDING_MS, auditPaymentOrder, duplicatePaymentReferences, paymentReference };
