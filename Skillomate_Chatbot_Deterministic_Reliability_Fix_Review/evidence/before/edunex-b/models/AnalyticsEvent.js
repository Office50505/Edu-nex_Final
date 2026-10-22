const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'analytics',
  }
);

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
