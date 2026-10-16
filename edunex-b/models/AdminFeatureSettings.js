const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, default: 'features' },
  certificationEnabled: { type: Boolean, default: true },
  progressBarEnabled: { type: Boolean, default: true },
  screenCaptureAllowed: { type: Boolean, default: false },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AdminFeatureSettings', schema);
