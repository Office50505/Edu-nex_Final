const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  event: { type: String, required: true },
  state: { type: String, default: null },
  requestId: { type: String, default: null },
  rawPayload: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
}, { _id: false });

const debitSchema = new mongoose.Schema({
  merchantOrderId: { type: String, default: null },
  requestId: { type: String, default: null },
  amountPaise: { type: Number, min: 100, max: 100, default: null },
  notifyState: { type: String, default: null },
  redeemState: { type: String, default: null },
  phonePeTransactionId: { type: String, default: null },
  validAfter: { type: Date, default: null },
  notifiedAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
}, { _id: false });

const providerErrorSchema = new mongoose.Schema({
  httpStatus: { type: Number, default: null },
  code: { type: String, default: null, maxlength: 120 },
  detailedCode: { type: String, default: null, maxlength: 120 },
  message: { type: String, default: null, maxlength: 300 },
  recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const phonePeAutoPayTestSchema = new mongoose.Schema({
  testId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  adminId: { type: String, required: true },
  executionMode: { type: String, enum: ['mock', 'sandbox', 'live'], required: true },
  merchantId: { type: String, required: true },
  requestId: { type: String, required: true },
  merchantOrderId: { type: String, required: true, unique: true },
  merchantSubscriptionId: { type: String, required: true, unique: true, index: true },
  phonePeMandateId: { type: String, default: null, index: true },
  phonePeOrderId: { type: String, default: null },
  amountPaise: { type: Number, required: true, min: 100, max: 100 },
  status: { type: String, required: true, default: 'SETUP_REQUESTED', index: true },
  approvalUrl: { type: String, default: null },
  providerError: { type: providerErrorSchema, default: null },
  lastStatusCheckedAt: { type: Date, default: null },
  lastWebhookAt: { type: Date, default: null },
  debit: { type: debitSchema, default: () => ({}) },
  webhookEvents: { type: [webhookEventSchema], default: [] },
}, { timestamps: true });

phonePeAutoPayTestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PhonePeAutoPayTest', phonePeAutoPayTestSchema);
