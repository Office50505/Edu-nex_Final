const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, default: 'marketing' },
  metaPixelEnabled: { type: Boolean, default: false },
  metaPixelId: { type: String, default: '' },
  updatedBy: String,
}, { timestamps: true });

module.exports = mongoose.model('MarketingSettings', schema);
