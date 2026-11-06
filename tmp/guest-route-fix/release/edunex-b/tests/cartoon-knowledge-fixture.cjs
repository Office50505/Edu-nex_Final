// VM-only catalog binding. Never writes a course, registry or database record.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const owner = '6f0000000000000000000801';
const slug = 'fixture-ai-cartoon-series';
const staged = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/ai-cartoon-series/index.json')));

function load(relative, overrides) {
  const filename = path.join(root, relative);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => overrides[name] || nativeRequire(name),
    module, exports: module.exports, __dirname: path.dirname(filename), console,
  }, { filename });
  return module.exports;
}
const packModule = load('services/courseKnowledgePacks.js', {
  'node:fs': { ...fs, readFileSync(file, ...args) {
    if (String(file) === path.join(root, 'knowledge/course-packs.json')) {
      return JSON.stringify(JSON.parse(fs.readFileSync(file)).map(entry =>
        entry.dir === 'ai-cartoon-series' ? { ...entry, enabled: true } : entry));
    }
    if (String(file) === path.join(root, 'knowledge/ai-cartoon-series/index.json')) {
      return JSON.stringify({ ...staged, actualCourseId: owner, slugs: [slug] });
    }
    return fs.readFileSync(file, ...args);
  } },
});
const knowledge = load('services/tutorKnowledge.js', { './courseKnowledgePacks': packModule });
const pack = knowledge.COURSE_PACKS.find(p => p.dir === 'ai-cartoon-series');
module.exports = { knowledge, pack, staged, owner, slug };
