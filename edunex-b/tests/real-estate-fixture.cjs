const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { backend } = require('./ai-tutor-fixture.cjs');
const root = path.resolve(__dirname, '..');
const staged = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/ai-real-estate-videos/index.json')));
// Synthetic identity ONLY inside this isolated VM. Never written to the real
// registry, catalog, binding or knowledge index; never used against a live API.
const course = { _id: '000000000000000000000004', slug: 'fixture-real-estate-only',
  title: 'AI Real Estate Videos', status: 'published', description: 'Synthetic offline test course',
  videos: staged.records.filter(r => r.contentType === 'lesson-summary').map(r => ({
    _id: `0000000000000000000001${String(r.lessonNumber).padStart(2, '0')}`,
    title: r.heading.replace(/^Lesson \d+ — /u, ''), order: r.lessonNumber,
  })) };
const pack = { ...staged, actualCourseId: course._id, slugs: [course.slug], status: 'verified_published_identity',
  lessonBindings: Object.fromEntries(course.videos.map(v => [v._id, v.order])) };
function load(file, overrides = {}) {
  const filename = path.join(root, file);
  const normalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : normalRequire(name),
    process, console, Buffer, URL, Set, Map,
  }, { filename });
  return module.exports;
}
const packs = load('services/courseKnowledgePacks.js', { 'node:fs': {
  ...fs, readFileSync(file, ...args) {
    if (String(file).endsWith('/course-packs.json')) {
      const registry = JSON.parse(fs.readFileSync(file, 'utf8')).map(entry => entry.dir === 'ai-real-estate-videos' ? { ...entry, enabled: true } : entry);
      return JSON.stringify(registry);
    }
    if (String(file).endsWith('/ai-real-estate-videos/index.json')) return JSON.stringify(pack);
    return fs.readFileSync(file, ...args);
  },
} });
const K = load('services/tutorKnowledge.js', { './courseKnowledgePacks': packs });
const user = { _id: '000000000000000000000099', purchasedCourses: [course._id] };
const safe = 'Use the original room photo and preserve its structure, dimensions, windows, doors and outside view. Only add realistically scaled furniture and decor. Add a visible Virtually Staged label to every staged clip/photo and a disclosure end card: Virtually Staged — furniture and decor are digitally added for visualization.';
const make = options => backend({ courses: [course], user, knowledgeModule: K, reply: safe, ...options });
module.exports = { root, staged, course, pack, packs, K, user, safe, make };
