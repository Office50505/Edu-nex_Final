const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  watchedSeconds: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  lastWatchedAt: { type: Date, default: Date.now },
  dropOffPoint: { type: Number, default: null },
});

progressSchema.index({ user: 1, lesson: 1 }, { unique: true });
progressSchema.index({ user: 1, course: 1 });

module.exports = mongoose.model('Progress', progressSchema);
