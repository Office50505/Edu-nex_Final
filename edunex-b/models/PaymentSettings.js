const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, default: 'razorpay' },
  mode: { type: String, enum: ['test', 'live'], required: true },
  updatedBy: String,
}, { timestamps: true });
module.exports = mongoose.model('PaymentSettings', schema);
