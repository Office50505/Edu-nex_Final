// Prepared operation only. No writes without explicit confirmation; never reads .env.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Course = require('../../../models/Course');
const Category = require('../../../models/Category');

async function main() {
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'operation.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(__dirname, plan.metadata_file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== plan.metadata_sha256) throw Error('Metadata snapshot changed; review the operation again.');
  const source = JSON.parse(bytes);
  if (String(source.course._id) !== plan.actual_course_id || source.course.slug !== plan.actual_slug || source.course.videos.length !== 10) throw Error('Source course identity or lesson coverage changed.');
  // Existing schema hooks validate all ten real sources before any connection.
  const course = new Course(source.course);
  const category = new Category(source.category);
  await course.validate();
  await category.validate();
  if (!process.argv.includes('--apply-confirmed')) {
    console.log('PREPARED ONLY: real metadata validated; no database connection or write performed.');
    return;
  }
  const index = process.argv.indexOf('--uri');
  const uri = index >= 0 ? process.argv[index + 1] : '';
  if (uri !== plan.isolated_target) throw Error('Only the reviewed isolated localhost target is allowed.');
  const target = new URL(uri);
  if (target.protocol !== 'mongodb:' || target.hostname !== '127.0.0.1' || target.port !== '27017'
    || target.username || target.password || target.search || target.hash
    || !/^\/skillomate_mvp_eval_lba_real_[a-z0-9_]+$/.test(target.pathname)) throw Error('Refusing a non-isolated target.');
  const client = new mongoose.mongo.MongoClient(uri, {serverSelectionTimeoutMS: 5000, directConnection: true});
  try {
    await client.connect();
    const hello = await client.db('admin').command({hello:1});
    if (hello.msg === 'isdbgrid' || hello.setName) throw Error('Expected standalone localhost MongoDB; refusing writes.');
    const db = client.db();
    if ((await db.listCollections({}, {nameOnly:true}).toArray()).length) throw Error('Target is not empty; refusing to modify or duplicate existing records.');
    await db.collection(Category.collection.name).insertOne(category.toObject());
    await db.collection(Course.collection.name).insertOne(course.toObject());
    console.log(JSON.stringify({isolatedDatabase:db.databaseName,courseId:String(course._id),lessons:course.videos.length,productionWrites:false}));
  } finally {
    await client.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
