require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const { getMongoConnectionOptions } = require('../config/mongodb');
const publicSource = process.argv.includes('--public-source');
if (publicSource) process.env.CLOUDFRONT_ACCESS_MODE = 'public';
const { inspectVideo } = require('../services/videoMetadata');

const apply = process.argv.includes('--apply');
const courseIdFlag = process.argv.indexOf('--course-id');
const courseId = courseIdFlag >= 0 ? String(process.argv[courseIdFlag + 1] || '').trim() : '';

async function inspectMissingLessons(videos) {
  const missing = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => !Number.isFinite(Number(video.duration)) || Number(video.duration) <= 0);
  let cursor = 0;
  const results = [];
  async function worker() {
    while (cursor < missing.length) {
      const { video, index } = missing[cursor++];
      try {
        const metadata = await inspectVideo(video.toObject ? video.toObject() : video);
        results.push({ index, lessonId: String(video._id), title: video.title, duration: Number(metadata.duration), error: '' });
      } catch (error) {
        results.push({ index, lessonId: String(video._id), title: video.title, duration: 0, error: error.message || 'Duration detection failed.' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker));
  return results.sort((left, right) => left.index - right.index);
}

async function main() {
  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error('Pass one exact course with --course-id <Mongo ObjectId>. Add --public-source only for publicly readable CloudFront playlists, and add --apply only after reviewing the dry-run output.');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  await mongoose.connect(process.env.MONGODB_URI, {
    ...getMongoConnectionOptions(),
    dbName: process.env.MONGODB_DB || undefined,
  });
  try {
    const course = await Course.findById(courseId).select('_id title videos');
    if (!course) throw new Error('Course not found.');
    const results = await inspectMissingLessons(course.videos || []);
    const detected = results.filter((result) => !result.error && result.duration > 0);
    const failed = results.filter((result) => result.error);

    if (apply && detected.length) {
      const operations = detected.map((result) => ({
        updateOne: {
          filter: {
            _id: course._id,
            videos: {
              $elemMatch: {
                _id: result.lessonId,
                $or: [{ duration: { $lte: 0 } }, { duration: { $exists: false } }],
              },
            },
          },
          update: { $set: { 'videos.$.duration': result.duration } },
        },
      }));
      await Course.bulkWrite(operations, { ordered: false });
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      sourceMode: publicSource ? 'public' : 'configured',
      courseId: String(course._id),
      courseTitle: course.title,
      missingLessons: results.length,
      detectedLessons: detected.length,
      failedLessons: failed.length,
      results: results.map(({ index, lessonId, title, duration, error }) => ({ lesson: index + 1, lessonId, title, duration, error })),
    }, null, 2));

    if (failed.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
