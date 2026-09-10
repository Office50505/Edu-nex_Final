const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  nextSendAt: Date,
  expiresAt: Date,
  attempts: { type: Number, default: 0 },
  generation: String,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('OtpAttempt', schema);
