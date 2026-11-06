const test = require('node:test');
const assert = require('node:assert/strict');
const { auditPaymentOrder, duplicatePaymentReferences } = require('../services/paymentAuditService');

const now = new Date('2026-09-19T10:00:00.000Z');

function validOrder(overrides = {}) {
  return {
    user: { _id: 'learner' },
    subscription: { _id: 'subscription' },
    totalAmount: 299,
    refundedAmount: 0,
    gateway: 'phonepe',
    phonePeTransactionId: 'provider-1',
    phonePeMerchantTransactionId: 'order-1',
    orderType: 'subscription_charge',
    status: 'paid',
    paidAt: new Date('2026-09-19T09:00:00.000Z'),
    createdAt: new Date('2026-09-19T08:59:00.000Z'),
    ...overrides,
  };
}

test('payment audit leaves a consistent paid payment clear', () => {
  const result = auditPaymentOrder(validOrder(), { now });
  assert.equal(result.risk, 'clear');
  assert.deepEqual(result.issues, []);
});

test('payment audit flags missing provider data and subscription links', () => {
  const result = auditPaymentOrder(validOrder({ phonePeTransactionId: null, paidAt: null, subscription: null }), { now });
  assert.equal(result.risk, 'critical');
  assert.ok(result.issues.some((issue) => issue.code === 'missing_provider_reference'));
  assert.ok(result.issues.some((issue) => issue.code === 'missing_paid_at'));
  assert.ok(result.issues.some((issue) => issue.code === 'missing_subscription'));
});

test('payment audit detects stale pending and duplicate provider references', () => {
  const orders = [validOrder(), validOrder({ phonePeMerchantTransactionId: 'order-2' })];
  const duplicates = duplicatePaymentReferences(orders);
  assert.ok(duplicates.has('provider-1'));
  const result = auditPaymentOrder(validOrder({ status: 'pending', paidAt: null, createdAt: new Date('2026-09-19T08:00:00.000Z') }), { now, duplicateReferences: duplicates });
  assert.equal(result.risk, 'critical');
  assert.ok(result.issues.some((issue) => issue.code === 'stale_pending'));
  assert.ok(result.issues.some((issue) => issue.code === 'duplicate_provider_reference'));
});

test('payment audit treats an excessive refund as critical', () => {
  const result = auditPaymentOrder(validOrder({ totalAmount: 299, refundedAmount: 300 }), { now });
  assert.equal(result.risk, 'critical');
  assert.ok(result.issues.some((issue) => issue.code === 'refund_mismatch'));
});
