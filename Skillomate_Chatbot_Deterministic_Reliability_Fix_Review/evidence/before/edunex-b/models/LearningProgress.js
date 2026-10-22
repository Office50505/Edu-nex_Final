const mongoose = require('mongoose');
module.exports = mongoose.model('LearningProgress', new mongoose.Schema({
  _id: String, userId: { type: String, index: true }, courseId: { type: String, index: true }, version: String,
  videoId: String, intervals: { type: [[Number]], default: [] }, position: { type: Number, default: 0 },
  lastSeenAt: Date, sessionId: String, revision: { type: Number, default: 0 },
}, { timestamps: true }));
