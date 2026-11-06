// Local evaluator adapter only. No dotenv, remote catalog or production binding.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Types } = require('mongoose');
const root = path.resolve(__dirname, '../..');
const fixtureSlug = 'local-fixture-ai-cartoon-series';
const placeholderVideoId = 'MVPTEST0001'; // Existing synthetic evaluator convention; never playback evidence.
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function prepareCartoonFixture({ packKey, registrationPath, report, casesPath }) {
  if (packKey !== 'ai-cartoon-series' || registrationPath) throw Error('Cartoon fixture mode cannot use production/registered metadata.');
  const productionPacks = require('../../services/courseKnowledgePacks').COURSE_PACKS;
  if (productionPacks.some(p => p.dir === packKey)) throw Error('Expected the unbound staged Cartoon pack.');
  const dir = path.join(root, 'knowledge', packKey);
  const staged = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
  if (staged.actualCourseId || staged.slugs.length || staged.domain !== 'cartoon-series') throw Error('Refusing to override a published course binding.');
  for (const source of staged.sources) {
    if (path.basename(source.file) !== source.file || hash(fs.readFileSync(path.join(dir, source.file))) !== source.sha256) throw Error('Fixture source integrity failure.');
  }
  const ids = new Set();
  for (const r of staged.records) {
    if (ids.has(r.chunkId) || !r.chunkId.startsWith(packKey+':') || !r.content || hash(r.content) !== r.contentHash) throw Error('Fixture knowledge integrity failure.');
    ids.add(r.chunkId);
  }
  const lessons = staged.records.filter(r => r.contentType === 'lesson-summary').sort((a,b) => a.lessonNumber-b.lessonNumber);
  if (lessons.length !== 8 || lessons.some((r,i) => r.lessonNumber !== i+1)) throw Error('Expected exactly eight real knowledge lessons.');
  const cases = JSON.parse(fs.readFileSync(casesPath));
  const questions = cases.cases.reduce((sum,c) => sum+(c.turns?.length || 1),0);
  if (questions !== 15 || cases.cases.length !== 13) throw Error('Expected the frozen 15-question Cartoon evaluation.');
  const frozen = fs.readFileSync(path.join(report, 'test_cases_frozen.sha256'), 'utf8').trim().split(/\s+/)[0];
  if (hash(fs.readFileSync(casesPath)) !== frozen) throw Error('Frozen Cartoon questions changed.');
  const owner = String(new Types.ObjectId());
  const pack = { ...staged, actualCourseId: owner, slugs: [fixtureSlug], dir: packKey };
  // Only this evaluator process sees the synthetic owner/alias. No registry file
  // or main application process is changed.
  productionPacks.push(pack);
  const videos = lessons.map(r => ({ _id: new Types.ObjectId(), title: r.heading,
    order: r.lessonNumber, notes: r.content, provider: 'youtube', youtubeId: placeholderVideoId }));
  const fixture = { kind: 'synthetic-local-course-fixture', production_course_id: null,
    production_published_slug: null, course_id: owner, course_slug: fixtureSlug,
    fixture_only: true, playback_verified: false, video_reference_kind: 'fixed-test-placeholder',
    placeholder_video_id: placeholderVideoId, course_pack: packKey,
    lessons: lessons.map((r,i) => ({ lesson_id: String(videos[i]._id), lesson_number: r.lessonNumber,
      title: r.heading, knowledge_id: r.chunkId, content_hash: r.contentHash })) };
  return { pack, videos, fixture };
}

module.exports = { prepareCartoonFixture, fixtureSlug, placeholderVideoId };
