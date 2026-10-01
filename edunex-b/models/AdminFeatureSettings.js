const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, default: 'features' },
  certificationEnabled: { type: Boolean, default: true },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AdminFeatureSettings', schema);
