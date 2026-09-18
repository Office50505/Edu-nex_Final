const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  attempt: String,
  mode: { type: String, enum: ['test', 'live'] },
  phase: { type: String, enum: ['creating', 'ready', 'closed', 'uncertain'], required: true },
  subscriptionId: String,
  paymentType: { type: String, enum: ['trial', 'monthly', 'annual'] },
  trialAmount: Number,
  monthlyAmount: Number,
  annualAmount: Number,
  recurringAmount: Number,
  planId: String,
  trialEnd: Date,
  lease: String,
  leaseUntil: Date,
}, { timestamps: true });
schema.index({ subscriptionId: 1 }, { unique: true, partialFilterExpression: { subscriptionId: { $type: 'string' } } });
module.exports = mongoose.model('RazorpayBilling', schema);
