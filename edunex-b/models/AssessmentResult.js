const mongoose = require('mongoose');
module.exports = mongoose.model('AssessmentResult', new mongoose.Schema({
  _id: String, userId: { type: String, index: true }, courseId: String, version: String,
  score: Number, passed: { type: Boolean, default: false }, lastAttemptAt: Date,
}, { timestamps: true }));
