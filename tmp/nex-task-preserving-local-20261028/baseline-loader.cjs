// Read-only reproduction of this task's initial source state. No files are
// swapped in the working tree and no historical test artifacts are modified.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const names = ['businessRequestContract.js', 'businessResponsePipeline.js', 'businessCreativeRequest.js'];
const files = new Map(names.map(name => [
  path.join(root, 'edunex-b/services', name),
  path.join(__dirname, 'before/edunex-b/services', name),
]));
const load = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => files.has(filename)
  ? module._compile(fs.readFileSync(files.get(filename), 'utf8'), filename)
  : load(module, filename);
