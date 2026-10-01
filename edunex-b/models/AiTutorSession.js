const mongoose = require('mongoose');

const aiTutorSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  messages: { type: Array, default: [] },
  lastUpdatedAt: { type: Date, default: Date.now },
});

aiTutorSessionSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('AiTutorSession', aiTutorSessionSchema);
