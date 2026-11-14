require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../services/transcriptDataset');
const S = require('../services/localTranscriptStore');
const dataset = D.readDataset();
const catalog = JSON.parse(fs.readFileSync(path.join(D.ROOT, 'published-catalog.json'), 'utf8'));

function memoryDb() {
  const data = new Map();
  return {
    databaseName: 'offline_test',
    collection(name) {
      if (!data.has(name)) data.set(name, new Map());
      const rows = data.get(name);
      return {
        find: () => ({ sort: () => ({ toArray: async () => structuredClone([...rows.values()].sort((a, b) => a._id.localeCompare(b._id))) }) }),
        createIndex: async () => {},
        async updateOne(filter, update, options) {
          assert.deepEqual(Object.keys(update), ['$setOnInsert']);
          assert.equal(options.upsert, true);
          if (rows.has(filter._id)) return { upsertedCount: 0, modifiedCount: 0 };
          rows.set(filter._id, structuredClone(update.$setOnInsert));
          return { upsertedCount: 1, modifiedCount: 0 };
        },
        findOne: async filter => structuredClone(rows.get(filter._id)),
      };
    },
    data,
  };
}

test('database ingestion inserts verified rows once and skips duplicates without modifying existing data', async () => {
  const db = memoryDb();
  const first = S.planImport({ dataset, catalog, baseline: dataset });
  assert.deepEqual(first.report.identicalExistingFiles, { documents: 85, chunks: 95 });
  assert.equal(first.report.quarantined.length, 1);
  await S.insertMissing(db, first);
  assert.deepEqual(first.report.inserted, { documents: 84, chunks: 93 });
  const before = await S.readRows(db);
  const second = S.planImport({ dataset, catalog, baseline: dataset, ...before });
  await S.insertMissing(db, second);
  assert.deepEqual(second.report.inserted, { documents: 0, chunks: 0 });
  assert.deepEqual(second.report.skipped, { documents: 84, chunks: 93 });
  assert.deepEqual(await S.readRows(db), before);
  const index = await S.databaseIndex(db, catalog.courses);
  assert.equal(index.records.length, 93);
  assert.ok(index.records.every(row => row.sourceDocument.startsWith('database:offline_test.')));
});

test('changed transcript content is reported as a conflict and its whole lesson remains unchanged', async () => {
  const db = memoryDb();
  await S.insertMissing(db, S.planImport({ dataset, catalog }));
  const before = await S.readRows(db);
  const revised = structuredClone(dataset);
  revised.chunks[0].text += ' A changed rendering.';
  const plan = S.planImport({ dataset: revised, catalog, baseline: dataset, ...before });
  assert.equal(plan.report.conflicts.length, 1);
  assert.ok(plan.report.conflicts[0].differences.some(row => row.fields.includes('text')));
  await S.insertMissing(db, plan);
  assert.deepEqual(plan.report.inserted, { documents: 0, chunks: 0 });
  assert.deepEqual(await S.readRows(db), before);
});

test('different IDs cannot duplicate an already stored lesson URL', () => {
  const plan = S.planImport({ dataset, catalog });
  const rows = structuredClone(plan.additions);
  rows.documents[0]._id = 'different-id';
  rows.documents[0].raw.id = 'different-id';
  const incoming = S.planImport({ dataset, catalog, ...rows });
  assert.equal(incoming.report.conflicts.length, 1);
  assert.equal(incoming.additions.documents.length, 0);
});

test('retrieval rejects stored content or binding tampering', async () => {
  const db = memoryDb();
  await S.insertMissing(db, S.planImport({ dataset, catalog }));
  const stored = db.data.get(S.CHUNKS).values().next().value;
  stored.record.courseId = 'another-owner';
  await assert.rejects(S.databaseIndex(db, catalog.courses), /binding failure/);
  stored.raw.text += ' changed';
  await assert.rejects(S.readRows(db), /integrity failure/);
});

test('production, remote and ambiguous MongoDB destinations are rejected', () => {
  for (const uri of [
    'mongodb+srv://example.com/db', 'mongodb://example.com/db',
    'mongodb://127.0.0.1', 'mongodb://user:password@localhost/db',
    'mongodb://localhost/db?replicaSet=remote', 'mongodb://localhost,example.com/db',
  ]) assert.throws(() => S.localUri(uri));
  assert.equal(S.localUri('mongodb://127.0.0.1:27017/edunex'), 'mongodb://127.0.0.1:27017/edunex');
});
