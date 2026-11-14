require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { prepareCartoonFixture } = require('../scripts/eval/cartoon-local-fixture.cjs');
const Course = require('../models/Course');

test('versioned CS-11 cases bind to the existing eight-lesson fixture without a DB/provider', async t => {
  const root = path.resolve(__dirname, '..');
  // Historical runs may legitimately retain provider approvals. This offline
  // test owns a fresh report and copies only the frozen case manifest it needs.
  const report = fs.mkdtempSync(path.join(os.tmpdir(), 'cartoon-cs11-v2-fixture-'));
  t.after(() => fs.rmSync(report, { recursive: true, force: true }));
  fs.copyFileSync(path.join(root, 'reports/cartoon-series-cs11-v2/test_cases_frozen.sha256'),
    path.join(report, 'test_cases_frozen.sha256'));
  const approval = path.join(root, 'reports/cartoon-series-cs11-v2/provider_approval.json');
  const approvalBefore = fs.existsSync(approval) ? fs.readFileSync(approval, 'utf8') : null;
  const packs = require('../services/courseKnowledgePacks').COURSE_PACKS;
  const publishedBefore = JSON.stringify(packs.filter(p => p.dir === 'ai-cartoon-series'));
  const f = prepareCartoonFixture({ packKey: 'ai-cartoon-series',
    report,
    casesPath: path.join(root, 'scripts/eval/cartoon-series-fast15-cases-v2.json') });
  t.after(() => {
    const packs = require('../services/courseKnowledgePacks').COURSE_PACKS;
    const index = packs.indexOf(f.pack);
    if (index !== -1) packs.splice(index, 1);
  });
  const course = new Course({ _id: f.fixture.course_id, title: f.pack.title,
    slug: f.fixture.course_slug, description: 'Versioned local CS-11 fixture; no playback claims.',
    category: '6f0000000000000000000803', status: 'published', videos: f.videos });
  await course.validate();
  assert.equal(course.videos.length, 8);
  assert.equal(f.fixture.production_course_id, null);
  assert.equal(f.fixture.playback_verified, false);
  assert.equal(fs.existsSync(path.join(report, 'provider_approval.json')), false);
  assert.equal(fs.existsSync(approval) ? fs.readFileSync(approval, 'utf8') : null, approvalBefore);
  assert.equal(JSON.stringify(packs.filter(p => p.dir === 'ai-cartoon-series' && p !== f.pack)), publishedBefore);
});
