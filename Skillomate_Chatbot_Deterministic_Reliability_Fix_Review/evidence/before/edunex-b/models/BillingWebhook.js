const mongoose = require('mongoose');
module.exports = mongoose.model('BillingWebhook', new mongoose.Schema({
  _id: String,
  event: String,
  processedAt: Date,
}, { timestamps: true }));
