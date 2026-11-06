const mongoose = require('mongoose');

const courseProgressSchema = new mongoose.Schema(
  {
    courseId: { type: String, index: true },
    userId: { type: String, index: true },
    courseTitle: { type: String, trim: true, index: true },
    completedCount: { type: Number, default: 0 },
    completedVideoIds: [{ type: String }],
    lastWatchedVideoId: { type: String, default: null },
    lastCompletedVideoId: { type: String, default: null },
    progressPercent: { type: Number, default: 0 },
    totalVideos: { type: Number, default: 0 },
    userEmail: { type: String, trim: true, lowercase: true },
    userMobileNumber: { type: String, trim: true },
    userName: { type: String, trim: true },
    videoProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'courseProgress' }
);

courseProgressSchema.index({ courseTitle: 1, updatedAt: -1 });
courseProgressSchema.index({ courseId: 1, userId: 1 });

module.exports = mongoose.model('CourseProgress', courseProgressSchema);
