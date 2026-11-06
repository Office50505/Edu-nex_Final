const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareCartoonFixture, placeholderVideoId } = require('../scripts/eval/cartoon-local-fixture.cjs');
const Course = require('../models/Course');
const root = path.resolve(__dirname, '..');
const args = { packKey: 'ai-cartoon-series', report: path.join(root, 'reports/cartoon-series-local-fixture'),
  casesPath: path.join(root, 'scripts/eval/cartoon-series-fast15-cases.json') };

test('fixture adapter refuses foreign courses or registered metadata', () => {
  assert.throws(() => prepareCartoonFixture({ ...args, packKey: 'ai-local-business-ads' }), /cannot use/);
  assert.throws(() => prepareCartoonFixture({ ...args, registrationPath: 'anything.json' }), /cannot use/);
});

test('eight real lesson titles and knowledge IDs validate through unchanged Course hooks', async () => {
  const registry = fs.readFileSync(path.join(root, 'knowledge/course-packs.json'));
  const index = fs.readFileSync(path.join(root, 'knowledge/ai-cartoon-series/index.json'));
  const f = prepareCartoonFixture(args);
  assert.equal(f.fixture.production_course_id, null);
  assert.equal(f.fixture.production_published_slug, null);
  assert.equal(f.fixture.playback_verified, false);
  assert.equal(f.fixture.lessons.length, 8);
  assert.equal(f.fixture.lessons[7].title, 'Lesson 08 — Edit, Thumbnail, Publish + Final Project');
  for (const [i, r] of f.fixture.lessons.entries()) {
    assert.equal(r.lesson_number, i+1);
    assert.match(r.knowledge_id, /^ai-cartoon-series:lesson-summary:/);
    assert.equal(r.title, f.videos[i].title);
    assert.equal(f.videos[i].youtubeId, placeholderVideoId);
    assert.equal(f.videos[i].videoUrl, undefined);
  }
  const course = new Course({ _id: f.fixture.course_id, title: f.pack.title, slug: f.fixture.course_slug,
    description: 'Synthetic local fixture. No verified video playback.', category: '6f0000000000000000000803',
    status: 'published', videos: f.videos });
  await course.validate();
  assert.equal(course.videos.length, 8);
  for (const v of course.videos) assert.equal(v.sourceType, 'youtube');
  assert.deepEqual(fs.readFileSync(path.join(root, 'knowledge/course-packs.json')), registry);
  assert.deepEqual(fs.readFileSync(path.join(root, 'knowledge/ai-cartoon-series/index.json')), index);
  const K = require('../services/tutorKnowledge');
  assert.equal(K.packFor({ _id: f.fixture.course_id, slug: f.fixture.course_slug }).dir, 'ai-cartoon-series');
  assert.equal(K.packFor({ _id: '6f0000000000000000000899', slug: f.fixture.course_slug }), undefined);
  assert.throws(() => prepareCartoonFixture(args), /unbound staged/);
});

test('the unchanged schema still rejects source-free lessons', async () => {
  const course = new Course({ title: 'Invalid source-free fixture', slug: 'invalid-source-free-fixture',
    description: 'Never stored.', category: '6f0000000000000000000803', videos: [{ title: 'Lesson 01', order: 1 }] });
  await assert.rejects(course.validate(), /HTTPS URL/);
});
