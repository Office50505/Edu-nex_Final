// Writes only the existing isolated QA MongoDB. No dotenv, remote URI or
// production configuration is read by this script.
const fs = require('node:fs');
const path = require('node:path');
const { backendRequire } = require('../nex-cartoon-safety-live-20261028/binding.cjs');
const mongoose = backendRequire('mongoose');
const Course = backendRequire('./models/Course');
async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'course-metadata.json')));
  const source = snapshot.course;
  if (source._id !== '6ae1b4694e1af14d4adc9e2b' || source.slug !== 'viral-hook-formula' || source.status !== 'published' || source.videos.length !== 10) throw Error('Unexpected catalog snapshot');
  const checked = new Course(source);
  await checked.validate();
  const conn = await mongoose.createConnection('mongodb://127.0.0.1:27028/skillomate_lba_final_qa_20261027', { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const users = conn.db.collection('users'), courses = conn.db.collection('courses');
    const userId = new mongoose.Types.ObjectId('6addcefc5d47d548973c29b9');
    const user = await users.findOne({ _id: userId });
    if (!user || user.fullName !== 'Local Chatbot Retest' || !String(user.mobileNumber).endsWith('9000000002')) throw Error('Expected existing synthetic QA account is missing');
    const doc = checked.toObject();
    const existing = await courses.findOne({ _id: doc._id });
    if (existing && existing.slug !== source.slug) throw Error('Refusing a conflicting local identity');
    await courses.replaceOne({ _id: doc._id }, doc, { upsert: true });
    await conn.db.collection('categories').updateOne({ _id: doc.category }, { $setOnInsert: { name: 'Viral Hook QA catalog', slug: 'viral-hook-qa-catalog', isActive: true } }, { upsert: true });
    const hasEntitlement = (user.courseEntitlements || []).some(e => String(e.course) === source._id && e.accessType === 'permanent');
    if (!hasEntitlement) await users.updateOne({ _id: userId, mobileNumber: user.mobileNumber }, { $push: { courseEntitlements: {
      course: doc._id, accessType: 'permanent', grantedAt: new Date(), expiresAt: null,
    } } });
    const result = { localDatabase: conn.name, courseId: String(doc._id), slug: source.slug, lessons: doc.videos.length,
      realLessonIdsPreserved: doc.videos.every((v,i) => String(v._id) === source.videos[i]._id), syntheticUserId: String(userId), localPermanentEntitlement: true,
      productionWrites: false, approvedKnowledgeChanged: false };
    fs.writeFileSync(path.join(__dirname, 'local-registration.json'), JSON.stringify(result, null, 2)+'\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await conn.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
