const mongoose = require('mongoose');

const courseAnalyticsSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  uniqueViewers: {
    type: Number,
    default: 0,
  },
  lessonsWatched: {
    type: Number,
    default: 0,
  },
  watchMinutes: {
    type: Number,
    default: 0,
  },
  newStarts: {
    type: Number,
    default: 0,
  },
  newCompletions: {
    type: Number,
    default: 0,
  },
  aiTutorQueries: {
    type: Number,
    default: 0,
  },
  lessonDropOff: [
    {
      lesson: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
        required: true,
      },
      viewCount: {
        type: Number,
        default: 0,
      },
      dropCount: {
        type: Number,
        default: 0,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

courseAnalyticsSchema.index({ course: 1, date: 1 }, { unique: true });
courseAnalyticsSchema.index({ date: -1 });
courseAnalyticsSchema.index({ course: 1 });

module.exports = mongoose.model('CourseAnalytics', courseAnalyticsSchema);
