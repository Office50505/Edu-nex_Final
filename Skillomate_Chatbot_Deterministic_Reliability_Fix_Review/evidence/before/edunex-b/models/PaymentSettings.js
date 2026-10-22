const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, default: 'gateway' },
  provider: { type: String, enum: ['razorpay', 'phonepe'], default: 'razorpay', required: true },
  mode: { type: String, enum: ['test', 'live'], required: true },
  updatedBy: String,
}, { timestamps: true });
module.exports = mongoose.model('PaymentSettings', schema);
