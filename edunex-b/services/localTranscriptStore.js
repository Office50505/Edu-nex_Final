// Source text and its README are reference data, never ingestion instructions.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { MongoClient } = require('mongoose').mongo;
const D = require('./transcriptDataset');
const { loadFileTranscriptIndex } = require('./fileTranscriptStore');
const DOCUMENTS = 'nex_transcript_documents';
const CHUNKS = 'nex_transcript_chunks';
const rowHash = row => D.sha(JSON.stringify(row));

function localUri(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    || parsed.username || parsed.password || !/^\/[a-zA-Z0-9_-]+$/.test(parsed.pathname)
    || parsed.search) throw new Error('Transcript writes require an explicit localhost MongoDB database');
  return uri;
}

function readSource(directory) {
  const hashes = {}, bytes = {};
  for (const name of ['manifest.json', 'documents.jsonl', 'chunks.jsonl', 'README.md']) {
    bytes[name] = fs.readFileSync(path.join(directory, name));
    hashes[name] = D.sha(bytes[name]);
  }
  const rows = name => bytes[name].toString('utf8').split('\n').filter(line => line.trim()).map(JSON.parse);
  return {
    manifest: JSON.parse(bytes['manifest.json']), documents: rows('documents.jsonl'),
    chunks: rows('chunks.jsonl'), hashes, bytes,
  };
}

function sameBinding(a, b) {
  return ['courseId', 'lessonId', 'videoId', 'originalSourceUrl'].every(key => a?.[key] === b?.[key]);
}

function difference(existing, incoming, reason) {
  return {
    id: incoming.id, reason, existingHash: rowHash(existing), incomingHash: rowHash(incoming),
    fields: [...new Set([...Object.keys(existing), ...Object.keys(incoming)])]
      .filter(key => !isDeepStrictEqual(existing[key], incoming[key])),
  };
}

function planImport({ dataset, catalog, documents = [], chunks = [], baseline }) {
  const compiled = D.prepareDataset(dataset, catalog);
  const mappings = new Map(compiled.mappings.map(mapping => [mapping.documentId, mapping]));
  const records = new Map(compiled.records.map(record => [record.chunkId, record]));
  const report = {
    sourceDocuments: dataset.documents.length, sourceChunks: dataset.chunks.length,
    inserted: { documents: 0, chunks: 0 }, skipped: { documents: 0, chunks: 0 },
    identicalExistingFiles: { documents: 0, chunks: 0 }, conflicts: [], quarantined: [],
    missingPublishedLessons: compiled.audit.missingPublishedLessons,
  };
  const additions = { documents: [], chunks: [] };
  for (const document of dataset.documents) {
    const mapping = mappings.get(document.id);
    const parts = dataset.chunks.filter(chunk => chunk.document_id === document.id);
    const issues = [];
    const oldDocument = baseline?.documents.find(row => row.id === document.id
      || row.lesson_key === document.lesson_key || row.source_url === document.source_url);
    if (oldDocument) {
      if (!isDeepStrictEqual(oldDocument, document)) issues.push(difference(oldDocument, document, 'existing_file_document'));
      else report.identicalExistingFiles.documents++;
    }
    for (const chunk of parts) {
      const oldChunk = baseline?.chunks.find(row => row.id === chunk.id);
      if (oldChunk) {
        if (!isDeepStrictEqual(oldChunk, chunk)) issues.push(difference(oldChunk, chunk, 'existing_file_chunk'));
        else report.identicalExistingFiles.chunks++;
      }
    }
    const stored = documents.find(row => row._id === document.id || row.raw.lesson_key === document.lesson_key
      || row.raw.source_url === document.source_url);
    if (stored && (!isDeepStrictEqual(stored.raw, document) || !sameBinding(stored.mapping, mapping))) {
      issues.push(difference(stored.raw, document, 'existing_database_document_or_binding'));
    }
    for (const chunk of parts) {
      const prior = chunks.find(row => row._id === chunk.id
        || row.raw.document_id === chunk.document_id && row.raw.metadata.chunk_index === chunk.metadata.chunk_index
        || row.raw.content_sha256 === chunk.content_sha256);
      if (prior && !isDeepStrictEqual(prior.raw, chunk)) issues.push(difference(prior.raw, chunk, 'existing_database_chunk'));
    }
    if (issues.length) {
      report.conflicts.push({ documentId: document.id, chunkCount: parts.length, differences: issues });
      continue;
    }
    if (mapping.status !== 'mapped') {
      report.quarantined.push({ documentId: document.id, chunkCount: parts.length, reason: mapping.reason });
      continue;
    }
    const provenance = {
      sourceHashes: dataset.hashes, catalogHash: compiled.catalogHash,
      overlapSegments: dataset.manifest.chunking?.overlap_segments || 0,
    };
    if (stored) report.skipped.documents++;
    else additions.documents.push({ _id: document.id, raw: document, rawHash: rowHash(document), mapping, provenance });
    for (const chunk of parts) {
      if (chunks.some(row => row._id === chunk.id)) report.skipped.chunks++;
      else additions.chunks.push({
        _id: chunk.id, raw: chunk, rawHash: rowHash(chunk), documentId: document.id,
        record: records.get(chunk.id), provenance,
      });
    }
  }
  report.proposed = { documents: additions.documents.length, chunks: additions.chunks.length };
  return { additions, report };
}

async function readRows(db) {
  const [documents, chunks] = await Promise.all([
    db.collection(DOCUMENTS).find({}).sort({ _id: 1 }).toArray(),
    db.collection(CHUNKS).find({}).sort({ _id: 1 }).toArray(),
  ]);
  for (const row of [...documents, ...chunks]) {
    if (!row.raw || rowHash(row.raw) !== row.rawHash || row._id !== row.raw.id) {
      throw new Error('Stored transcript integrity failure: ' + row._id);
    }
  }
  return { documents, chunks };
}

async function insertMissing(db, plan) {
  // Unique natural identities plus $setOnInsert prevent replacement, including
  // concurrent ingestion. There is deliberately no overwrite or delete mode.
  await db.collection(DOCUMENTS).createIndex({ 'raw.lesson_key': 1 }, { unique: true });
  await db.collection(DOCUMENTS).createIndex({ 'raw.source_url': 1 }, { unique: true });
  await db.collection(CHUNKS).createIndex({ 'raw.document_id': 1, 'raw.metadata.chunk_index': 1 }, { unique: true });
  await db.collection(CHUNKS).createIndex({ 'raw.content_sha256': 1 }, { unique: true });
  for (const [kind, collection] of [['documents', DOCUMENTS], ['chunks', CHUNKS]]) {
    for (const row of plan.additions[kind]) {
      const result = await db.collection(collection).updateOne({ _id: row._id }, { $setOnInsert: row }, { upsert: true });
      if (result.upsertedCount) plan.report.inserted[kind]++;
      else {
        const current = await db.collection(collection).findOne({ _id: row._id });
        if (!isDeepStrictEqual(current, row)) throw new Error('Concurrent transcript conflict: ' + row._id);
        plan.report.skipped[kind]++;
      }
    }
  }
  return plan.report;
}

async function databaseIndex(db, courses) {
  const rows = await readRows(db);
  if (!rows.documents.length) return withQuarantine({ records: [], mappings: [], courseAliases: {} }, courses);
  const documents = rows.documents.map(row => row.raw), chunks = rows.chunks.map(row => row.raw);
  const hashes = { 'documents.jsonl': rowHash(documents), 'chunks.jsonl': rowHash(chunks) };
  const compiled = D.prepareDataset({
    documents, chunks, hashes,
    manifest: { document_count: documents.length, chunk_count: chunks.length,
      chunking: { overlap_segments: Math.max(...rows.documents.map(row => row.provenance.overlapSegments)) } },
  }, { courses, lessons: [] });
  const stored = new Map(rows.chunks.map(row => [row._id, row]));
  for (const record of compiled.records) {
    const row = stored.get(record.chunkId);
    // Verify immutable persisted content and IDs before returning DB retrieval.
    if (!row.record || row.record.contentHash !== record.contentHash || !sameBinding(row.record, record)) {
      throw new Error('Stored transcript binding failure: ' + record.chunkId);
    }
    record.sourceHash = row.provenance.sourceHashes['chunks.jsonl'];
    record.sourceDocument = `database:${db.databaseName}.${CHUNKS}#${record.chunkId}`;
  }
  return withQuarantine(compiled, courses);
}

function withQuarantine(index, courses) {
  // Insert-only ingestion intentionally omits quarantined rows. Their absence
  // must not turn the same lesson's notes/templates into eligible evidence.
  // Use the preserved, verified file mapping as exclusion metadata only.
  const quarantined = D.loadIndex().mappings.filter(m => m.status === 'quarantined'
    && courses.some(c => String(c._id) === m.candidate?.courseId
      && c.videos?.some(v => String(v._id || v.id) === m.candidate.videoId)));
  const ids = new Set(quarantined.map(m => m.documentId));
  return { ...index, records: index.records.filter(r => !ids.has(r.documentId)),
    mappings: [...index.mappings.filter(m => !ids.has(m.documentId)), ...quarantined] };
}

let cached, pending;
async function loadTranscriptIndex(courses) {
  const uri = process.env.NEX_TRANSCRIPT_MONGODB_URI;
  if (!uri) return loadFileTranscriptIndex(courses);
  const key = rowHash({ uri, courses });
  if (cached?.key === key && cached.expires > Date.now()) return cached.index;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    let client;
    try {
      client = new MongoClient(localUri(uri), { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      const index = await databaseIndex(client.db(), courses);
      cached = { key, index, expires: Date.now() + 5000 };
      return index;
    } catch (error) {
      return withQuarantine({ records: [], mappings: [], courseAliases: {}, error: 'Local transcript database unavailable or invalid' }, courses);
    } finally {
      await client?.close();
    }
  })();
  pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}

module.exports = { DOCUMENTS, CHUNKS, localUri, readSource, planImport, readRows, insertMissing, databaseIndex, loadTranscriptIndex, rowHash };
