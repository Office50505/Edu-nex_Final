const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL friendly'],
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    thumbnail: {
      data: { type: String, default: null },
      mimeType: { type: String, enum: ['image/jpeg', 'image/png', null], default: null },
      originalName: { type: String, default: null, trim: true },
      size: { type: Number, default: null },
    },
    thumbnailHorizontal: {
      data: { type: String, default: null },
      mimeType: { type: String, enum: ['image/jpeg', 'image/png', null], default: null },
      originalName: { type: String, default: null, trim: true },
      size: { type: Number, default: null },
    },
    thumbnailVertical: {
      data: { type: String, default: null },
      mimeType: { type: String, enum: ['image/jpeg', 'image/png', null], default: null },
      originalName: { type: String, default: null, trim: true },
      size: { type: Number, default: null },
    },
    thumbnailUrl: {
      type: String,
      default: null,
      trim: true,
    },
    thumbnailVerticalUrl: {
      type: String,
      default: null,
      trim: true,
    },
videos: [
       {
         title: { type: String, required: true, trim: true, maxlength: 200 },
         topic: { type: String, trim: true, maxlength: 80, default: '' },
         description: { type: String, trim: true, maxlength: 2000, default: '' },
         sourceType: {
           type: String,
           enum: ['bunny_stream', 'youtube'],
         },
         videoUrl: { type: String, trim: true, default: null },
         embedUrl: { type: String, trim: true, default: null },
         bunnyVideoId: { type: String, trim: true, default: null },
         bunnyLibraryId: { type: String, trim: true, default: null },
         youtubeId: { type: String, trim: true, default: null },
         thumbnail: {
           data: { type: String, default: null },
           mimeType: { type: String, enum: ['image/jpeg', 'image/png', null], default: null },
           originalName: { type: String, default: null, trim: true },
           size: { type: Number, default: null },
         },
         thumbnailUrl: { type: String, trim: true, default: null },
         thumbnailVerticalUrl: { type: String, trim: true, default: null },
         transcriptUrl: { type: String, trim: true, default: null },
         examplePrompt: { type: String, trim: true, maxlength: 4000, default: '' },
         duration: { type: Number, default: 0 },
         order: { type: Number, required: true },
       },
     ],
     notesUrl: {
       type: String,
       default: null,
       trim: true,
     },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalStarted: {
      type: Number,
      default: 0,
    },
    totalCompleted: {
      type: Number,
      default: 0,
    },
    completionRate: {
      type: Number,
      default: 0,
    },
    totalWatchMinutes: {
      type: Number,
      default: 0,
    },
    averageProgress: {
      type: Number,
      default: 0,
    },
    totalWishlisted: {
      type: Number,
      default: 0,
    },
    lastCalculatedAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

courseSchema.pre('validate', function setPublishedAt() {
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  if (this.status === 'draft') {
    this.publishedAt = null;
  }
});

courseSchema.pre('save', function autoFillThumbnail() {
  if (!this.thumbnailUrl && this.videos?.length) {
    const first = this.videos[0];
    if (first.youtubeId) {
      this.thumbnailUrl = `https://img.youtube.com/vi/${first.youtubeId}/hqdefault.jpg`;
    }
  }
});

courseSchema.pre('validate', function validateVideoSources() {
  if (Array.isArray(this.videos)) {
    this.videos.forEach((video) => {
      if (!video.sourceType) {
        video.sourceType = video.youtubeId ? 'youtube' : 'bunny_stream';
      }
    });

    const missingSource = this.videos.some((video) => !video.youtubeId && !video.embedUrl && !video.videoUrl);
    if (missingSource) {
      throw new Error('Every video must include a valid video source');
    }
  }
});

courseSchema.pre('save', function autoVideoOrder() {
  if (Array.isArray(this.videos)) {
    this.videos.forEach((v, i) => { v.order = i + 1; });
  }
});

courseSchema.index({ status: 1, publishedAt: -1, createdAt: -1 });
courseSchema.index({ status: 1, category: 1, publishedAt: -1 });
courseSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);
