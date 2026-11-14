require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const K = require('../services/tutorKnowledge');
const { build } = require('../scripts/prepare-ecommerce-knowledge.cjs');

const root = path.resolve(__dirname, '../knowledge/ai-ecommerce-no-shopify');
const source = path.join(root, 'sources/Skillomate_Ecommerce_Nex_AI_Knowledge_Base.txt');
const pack = require('../knowledge/ai-ecommerce-no-shopify/index.json');
const preparation = require('../knowledge/ai-ecommerce-no-shopify/preparation.json');
const registry = require('../knowledge/course-packs.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

test('original preparation preserves its unverified identity before later verified registration', () => {
  assert.equal(preparation.result, 'FAIL_UNVERIFIED_PUBLISHED_OWNER');
  assert.equal(preparation.publishedCatalogCoursesChecked, 8);
  assert.equal(preparation.matchingPublishedCourses, 0);
  assert.equal(preparation.courseId, null);
  assert.equal(preparation.mappedLessonIds, 0);
  assert.equal(pack.status, 'awaiting_published_identity');
  assert.equal(pack.actualCourseId, null);
  assert.deepEqual(pack.lessonBindings, {});
  assert.ok(pack.records.every(record => record.lessonId === ''));
});

test('all source-grounded chunks are unique and source-attributed', () => {
  assert.equal(pack.records.length, 47);
  assert.equal(preparation.chunks, 47);
  assert.equal(preparation.lessonNotes, 13);
  assert.equal(preparation.lessonWorkflows, 13);
  assert.equal(preparation.exactTemplates, 14);
  assert.equal(new Set(pack.records.map(record => record.chunkId)).size, 47);
  assert.equal(new Set(pack.records.map(record => record.contentHash)).size, 47);
  assert.equal(sha(fs.readFileSync(source)), preparation.sourceTxtHash);
  for (const record of pack.records) {
    assert.equal(sha(record.content), record.contentHash);
    assert.ok(record.sourceDocument);
    assert.equal(record.sourceHash, preparation.sourceTxtHash);
    if (record.lessonNumber) assert.ok(record.lessonNumber >= 1 && record.lessonNumber <= 13);
  }
});

test('all 14 recorded prompts remain byte-identical to the supplied source', () => {
  const raw = fs.readFileSync(source);
  const templates = pack.records.filter(record => record.contentType === 'exact-template');
  assert.equal(templates.length, 14);
  for (const template of templates) {
    assert.equal(raw.subarray(template.sourceStartByte, template.sourceEndByte).toString(), template.content);
    assert.match(template.usage, /Verified Course Prompt.*unchanged/u);
    assert.ok(template.lessonNumber >= 2 && template.lessonNumber <= 12);
  }
});

test('ingestion is byte-idempotent and performs no paid calls or database writes', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ecommerce-ingestion-'));
  try {
    const catalog = path.join(temporary, 'catalog.json');
    fs.writeFileSync(catalog, JSON.stringify({ courses: [
      { _id: '6ae1b4694e1af14d4adc9e2b', title: 'Viral Hook Formula', slug: 'viral-hook-formula', status: 'published', videos: [] },
      { _id: '6aeb1d5f2497c8173516e257', title: 'AI Se Landing Page Banao', slug: 'ai-se-landing-page-banao', status: 'published', videos: [] },
      { _id: '6ae346f4152646ad4d6b98b7', title: 'AI Real Estate Videos', slug: 'ai-real-estate-videos', status: 'published', videos: [] },
      { _id: '6ae09ebee4ac0b60c08276bc', title: 'AI Cartoon Series', slug: 'ai-cartoon-series', status: 'published', videos: [] },
      { _id: '6ad9fe8ed0076b8d5e3b4f6d', title: 'AI Local Business Ads', slug: 'ai-local-buisness-ads', status: 'published', videos: [] },
      { _id: '6acf6a0c0fbf30bb42142d68', title: 'AI Product Photoshoot & Ads', slug: 'ai-product-photoshoot-ads', status: 'published', videos: [] },
      { _id: '6abe5bb2bced21d7211be185', title: 'AI Filmmaking Course', slug: 'ai-filmmaking-course', status: 'published', videos: [] },
      { _id: '6aa51e9769c836f66ddd3be7', title: 'AI Influencer Course', slug: 'ai-influencer-course', status: 'published', videos: [] },
    ] }));
    const first = build({ sourcePath: source, catalogPath: catalog, outRoot: temporary });
    const before = ['index.json', 'preparation.json', 'sources/Skillomate_Ecommerce_Nex_AI_Knowledge_Base.txt']
      .map(file => fs.readFileSync(path.join(temporary, file)));
    const second = build({ sourcePath: source, catalogPath: catalog, outRoot: temporary });
    const after = ['index.json', 'preparation.json', 'sources/Skillomate_Ecommerce_Nex_AI_Knowledge_Base.txt']
      .map(file => fs.readFileSync(path.join(temporary, file)));
    assert.deepEqual(second, first);
    assert.deepEqual(after, before);
    assert.equal(second.paidCalls, 0);
    assert.equal(second.databaseWrites, 0);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('verified registration binds the existing pack only to the real published owner and all 13 lessons', () => {
  const entry = registry.find(item => item.dir === 'ai-ecommerce-no-shopify');
  assert.equal(entry.enabled, true);
  assert.equal(entry.binding.courseId, '6af7f53ff9112a360fa5a8b0');
  assert.equal(Object.keys(entry.binding.lessonBindings).length, 13);
  assert.deepEqual(Object.values(entry.binding.lessonBindings), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.ok(!K.STAGED_COURSES.some(course => course.title === pack.title));
  const verified = K.packFor({ _id: entry.binding.courseId, slug: entry.binding.slug, status: 'published' });
  assert.ok(verified);
  assert.equal(verified.actualCourseId, entry.binding.courseId);
  assert.equal(K.isIntegratedCourse({ _id: entry.binding.courseId, slug: entry.binding.slug, status: 'published' }), true);
  assert.equal(K.isIntegratedCourse({ _id: '000000000000000000000001', slug: entry.binding.slug, status: 'published' }), false);
  assert.equal(K.isIntegratedCourse({ _id: entry.binding.courseId, slug: entry.binding.slug, status: 'draft' }), false);
  assert.equal(K.packFor({ _id: '000000000000000000000001', slug: pack.slugs[0], status: 'published' }), undefined);
  const enabled = registry.filter(item => item.enabled !== false).map(item => item.dir).sort();
  assert.deepEqual(K.COURSE_PACKS.map(item => item.dir).sort(), enabled);
  assert.ok(K.COURSE_PACKS.every(existing => existing.records.length > 0));
});
