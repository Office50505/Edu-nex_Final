const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  videoId: { type: mongoose.Schema.Types.ObjectId, default: null },
  videoIndex: { type: Number, required: true, min: 0 },
});

lessonSchema.index({ course: 1, videoIndex: 1 }, { unique: true });

module.exports = mongoose.model('Lesson', lessonSchema);
