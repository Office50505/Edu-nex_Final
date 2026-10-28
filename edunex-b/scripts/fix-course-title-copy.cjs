require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');

const apply = process.argv.includes('--apply');
const fixes = [
  { id: '6ad9fe8ed0076b8d5e3b4f6d', from: 'AI Local Buisness ADS', to: 'AI Local Business Ads' },
  { id: '6abe5bb2bced21d7211be185', from: 'AI FilmMaking Course', to: 'AI Filmmaking Course' },
];
const lessonFix = {
  courseId: '6acf6a0c0fbf30bb42142d68',
  lessonId: '6acf6a0c0fbf30bb42142d61',
  from: 'Phone Photos to Studio Photos and',
  to: 'Phone Photos to Studio Photos',
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined });
  const results = [];
  for (const fix of fixes) {
    const filter = { _id: fix.id, title: fix.from };
    const matched = await Course.countDocuments(filter);
    const modified = apply && matched ? (await Course.updateOne(filter, { $set: { title: fix.to } })).modifiedCount : 0;
    results.push({ type: 'course', ...fix, matched, modified });
  }
  const lessonFilter = {
    _id: lessonFix.courseId,
    videos: { $elemMatch: { _id: lessonFix.lessonId, title: lessonFix.from } },
  };
  const lessonMatched = await Course.countDocuments(lessonFilter);
  const lessonModified = apply && lessonMatched
    ? (await Course.updateOne(lessonFilter, { $set: { 'videos.$[lesson].title': lessonFix.to } }, {
        arrayFilters: [{ 'lesson._id': lessonFix.lessonId, 'lesson.title': lessonFix.from }],
      })).modifiedCount
    : 0;
  results.push({ type: 'lesson', ...lessonFix, matched: lessonMatched, modified: lessonModified });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', results }, null, 2));
  await mongoose.disconnect();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
