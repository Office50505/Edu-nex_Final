const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareCartoonFixture } = require('../scripts/eval/cartoon-local-fixture.cjs');
const Course = require('../models/Course');

test('versioned CS-11 cases bind to the existing eight-lesson fixture without a DB/provider', async () => {
  const root = path.resolve(__dirname, '..');
  const f = prepareCartoonFixture({ packKey: 'ai-cartoon-series',
    report: path.join(root, 'reports/cartoon-series-cs11-v2'),
    casesPath: path.join(root, 'scripts/eval/cartoon-series-fast15-cases-v2.json') });
  const course = new Course({ _id: f.fixture.course_id, title: f.pack.title,
    slug: f.fixture.course_slug, description: 'Versioned local CS-11 fixture; no playback claims.',
    category: '6f0000000000000000000803', status: 'published', videos: f.videos });
  await course.validate();
  assert.equal(course.videos.length, 8);
  assert.equal(f.fixture.production_course_id, null);
  assert.equal(f.fixture.playback_verified, false);
  assert.equal(fs.existsSync(path.join(root, 'reports/cartoon-series-cs11-v2/provider_approval.json')), false);
});
