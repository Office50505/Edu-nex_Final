const fs = require('node:fs'), path = require('node:path');
const read = fs.readFileSync;
const root = path.resolve(__dirname, '../..');
const files = new Set(['aiTutorService.js', 'businessCreativeRequest.js', 'courseTutorRequest.js', 'courseKnowledgePacks.js']);
fs.readFileSync = function(file, ...args) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  if (resolved.startsWith(path.join(root, 'edunex-b/services') + path.sep) && files.has(path.basename(resolved))) {
    return read.call(this, path.join(__dirname, 'before', path.relative(root, resolved)), ...args);
  }
  return read.call(this, file, ...args);
};
