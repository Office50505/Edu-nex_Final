require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, sha } = require('../services/transcriptDataset');
const { ingestTranscriptIndex } = require('../scripts/prepare-transcript-knowledge.cjs');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'published-catalog.json'), 'utf8'));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-ingestion-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'original'), path.join(directory, 'original'), { recursive: true });
  return directory;
}

function snapshot(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true })
    .filter(name => fs.statSync(path.join(directory, name)).isFile())
    .map(name => [name, sha(fs.readFileSync(path.join(directory, name)))]));
}

test('initial ingestion then repeated ingestion adds no records and preserves every file byte', t => {
  const directory = fixture(t);
  const originals = snapshot(directory);
  const first = ingestTranscriptIndex({ directory, catalog });
  assert.equal(first.status, 'created');
  assert.equal(first.addedRecords, 93);
  assert.deepEqual(first.after, { documents: 85, records: 93 });
  const before = snapshot(directory);
  const indexPath = path.join(directory, 'index.json');
  const mtime = fs.statSync(indexPath).mtimeMs;
  for (let attempt = 0; attempt < 2; attempt++) {
    const rerun = ingestTranscriptIndex({ directory, catalog });
    assert.equal(rerun.status, 'unchanged');
    assert.equal(rerun.addedRecords, 0);
    assert.equal(rerun.skippedRecords, 93);
    assert.deepEqual(rerun.before, rerun.after);
    assert.deepEqual(rerun.differences, []);
    assert.deepEqual(snapshot(directory), before);
    assert.equal(fs.statSync(indexPath).mtimeMs, mtime);
  }
  for (const [name, hash] of Object.entries(originals)) assert.equal(before[name], hash);
});

test('changed catalog reports field differences and never replaces existing mappings', t => {
  const directory = fixture(t);
  ingestTranscriptIndex({ directory, catalog });
  const before = snapshot(directory);
  const changed = structuredClone(catalog);
  changed.courses.find(course => course.status === 'published').title += ' changed';
  const report = ingestTranscriptIndex({ directory, catalog: changed });
  assert.equal(report.status, 'approval_required');
  assert.equal(report.addedRecords, 0);
  assert.ok(report.differences.some(change => change.field === 'catalogHash'));
  assert.ok(report.differences.some(change => change.field.endsWith('.courseName')));
  assert.ok(report.changedRecordIds.length);
  assert.deepEqual(snapshot(directory), before);
});

test('removing a published course reports proposed removals without deleting transcripts', t => {
  const directory = fixture(t);
  ingestTranscriptIndex({ directory, catalog });
  const before = snapshot(directory);
  const changed = structuredClone(catalog);
  changed.courses = [];
  const report = ingestTranscriptIndex({ directory, catalog: changed });
  assert.equal(report.status, 'approval_required');
  assert.equal(report.proposedRemovedRecordIds.length, 93);
  assert.equal(report.after.records, 93);
  assert.equal(report.addedRecords, 0);
  assert.deepEqual(snapshot(directory), before);
});

test('changed transcript source blocks ingestion and reports its source hash', t => {
  const directory = fixture(t);
  ingestTranscriptIndex({ directory, catalog });
  const chunksPath = path.join(directory, 'original/chunks.jsonl');
  const chunks = fs.readFileSync(chunksPath, 'utf8').trim().split('\n').map(JSON.parse);
  chunks[0].retrieval_text += ' changed';
  fs.writeFileSync(chunksPath, chunks.map(row => JSON.stringify(row)).join('\n') + '\n');
  const before = snapshot(directory);
  const report = ingestTranscriptIndex({ directory, catalog });
  assert.equal(report.status, 'blocked');
  assert.match(report.validationError, /content hash mismatch/);
  assert.ok(report.differences.some(change => change.field === 'sourceHashes.chunks.jsonl'));
  assert.equal(report.addedRecords, 0);
  assert.deepEqual(snapshot(directory), before);
});

test('corrupt existing index fails closed rather than replacing it', t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'index.json'), '{broken');
  const before = snapshot(directory);
  assert.throws(() => ingestTranscriptIndex({ directory, catalog }), SyntaxError);
  assert.deepEqual(snapshot(directory), before);
});

test('valid revised transcript text reports a conflict instead of silently skipping or updating it', t => {
  const directory = fixture(t);
  ingestTranscriptIndex({ directory, catalog });
  const chunksPath = path.join(directory, 'original/chunks.jsonl');
  const chunks = fs.readFileSync(chunksPath, 'utf8').trim().split('\n').map(JSON.parse);
  const indexed = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8')).records[0];
  chunks.find(chunk => chunk.id === indexed.chunkId).text += ' Revised rendering.';
  fs.writeFileSync(chunksPath, chunks.map(row => JSON.stringify(row)).join('\n') + '\n');
  const before = snapshot(directory);
  const report = ingestTranscriptIndex({ directory, catalog });
  assert.equal(report.status, 'approval_required');
  assert.ok(report.changedRecordIds.includes(indexed.chunkId));
  assert.ok(report.differences.some(change => change.field.endsWith('.content')));
  assert.equal(report.addedRecords, 0);
  assert.deepEqual(snapshot(directory), before);
});

test('check mode never creates a missing index', t => {
  const directory = fixture(t);
  const before = snapshot(directory);
  assert.equal(ingestTranscriptIndex({ directory, catalog, check: true }).status, 'missing_index');
  assert.deepEqual(snapshot(directory), before);
});
