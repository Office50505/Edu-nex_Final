const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  retainedAccountHash: { type: String, default: null, index: true },
  accountDeletedAt: { type: Date, default: null },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  totalAmount: { type: Number, required: true },
  gateway: { type: String, default: 'phonepe' },
  phonePeMerchantTransactionId: { type: String, required: true, unique: true },
  razorpayPaymentId: String,
  razorpayMode: { type: String, enum: ['test', 'live'] },
  razorpaySubscriptionId: String,
  refundedAmount: { type: Number, default: 0 },
  phonePeTransactionId: { type: String, default: null },
  phonePeCustomerId: { type: String, default: null },
  phonePeMerchantSubscriptionId: { type: String, default: null, index: true },
  checkoutReturnUrl: { type: String, default: null },
  phonePePaymentInstrument: {
    type: String,
    enum: ['UPI', 'CARD', 'NETBANKING', 'WALLET', null],
    default: null,
  },
  orderType: {
    type: String,
    enum: ['trial_charge', 'mandate_setup', 'subscription_charge', 'refund'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
  },
  paidAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderType: 1 });

module.exports = mongoose.model('Order', orderSchema);
