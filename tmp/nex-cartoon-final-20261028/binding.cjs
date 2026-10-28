// Isolated process registration, pinned to a read-only published catalog
// snapshot. Never edits the staged knowledge registry or approved assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backendRoot = path.resolve(__dirname, '../../edunex-b');
const backendRequire = createRequire(path.join(backendRoot, 'server.js'));
function bindCartoon() {
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'course-metadata.json')));
  const course = metadata.course;
  if (!metadata.readOnlyCatalogLookup || metadata.productionWrites !== false || course._id !== '6ae09ebee4ac0b60c08276bc'
    || course.slug !== 'ai-cartoon-series' || course.status !== 'published' || course.videos.length !== 8) throw Error('Verified published Cartoon identity is required');
  const dir = path.join(backendRoot, 'knowledge/ai-cartoon-series');
  const staged = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
  for (const source of staged.sources) {
    if (path.basename(source.file) !== source.file || crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, source.file))).digest('hex') !== source.sha256) throw Error('Cartoon source integrity failed');
  }
  for (const record of staged.records) if (crypto.createHash('sha256').update(record.content).digest('hex') !== record.contentHash) throw Error('Cartoon record integrity failed');
  const lessons = staged.records.filter(r => r.contentType === 'lesson-summary').sort((a,b) => a.lessonNumber-b.lessonNumber);
  const videos = [...course.videos].sort((a,b) => a.order-b.order);
  if (lessons.length !== 8 || lessons.some((r,i) => r.lessonNumber !== i+1) || videos.some((v,i) => v.order !== i+1 || !/^[\da-f]{24}$/u.test(v._id))) throw Error('Eight ordered verified lessons are required');
  const packs = backendRequire('./services/courseKnowledgePacks').COURSE_PACKS;
  const previous = packs.find(p => p.dir === 'ai-cartoon-series');
  if (previous) throw Error('Cartoon binding already exists; refuse to overwrite it');
  const pack = { ...staged, dir: 'ai-cartoon-series', actualCourseId: course._id, slugs: [course.slug],
    lessonBindings: Object.fromEntries(videos.map(v => [v._id, v.order])) };
  packs.push(pack);
  return { course, pack };
}
module.exports = { bindCartoon, backendRequire, backendRoot };
