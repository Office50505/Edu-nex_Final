const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  totalAmount: { type: Number, required: true },
  gateway: { type: String, default: 'phonepe' },
  phonePeMerchantTransactionId: { type: String, required: true, unique: true },
  phonePeTransactionId: { type: String, default: null },
  phonePeCustomerId: { type: String, default: null },
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
