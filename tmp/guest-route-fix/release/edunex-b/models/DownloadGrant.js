const mongoose = require('mongoose');

const downloadGrantSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  guid: { type: String, required: true, index: true },
  libraryId: { type: String, default: null },
  courseId: { type: String, default: null },
  courseTitle: { type: String, default: null },
  videoTitle: { type: String, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

downloadGrantSchema.index({ tokenHash: 1, guid: 1, usedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('DownloadGrant', downloadGrantSchema);
