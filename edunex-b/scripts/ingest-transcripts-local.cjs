const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongoose').mongo;
const D = require('../services/transcriptDataset');
const S = require('../services/localTranscriptStore');

function preserveFile(file, bytes) {
  try { fs.writeFileSync(file, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!fs.readFileSync(file).equals(Buffer.from(bytes))) throw new Error('Archive conflict; left unchanged: ' + file);
  }
}

async function run({ source, catalogFile, uri, apply = false }) {
  S.localUri(uri);
  const dataset = S.readSource(source);
  const catalogBytes = fs.readFileSync(catalogFile);
  const catalog = JSON.parse(catalogBytes);
  const baseline = D.readDataset();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db();
    const before = await S.readRows(db);
    const plan = S.planImport({ dataset, catalog, baseline, ...before });
    const result = {
      mode: apply ? 'apply' : 'dry_run', database: db.databaseName,
      collections: { documents: S.DOCUMENTS, chunks: S.CHUNKS },
      sourceHashes: dataset.hashes, catalogHash: D.sha(catalogBytes),
      before: { documents: before.documents.length, chunks: before.chunks.length },
      firstRun: plan.report,
    };
    if (!apply) return result;
    const archive = path.resolve(__dirname, '../transcripts', 'skillomate-rag-' + dataset.hashes['documents.jsonl'].slice(0, 16));
    fs.mkdirSync(path.join(archive, 'original'), { recursive: true });
    for (const [name, bytes] of Object.entries(dataset.bytes)) preserveFile(path.join(archive, 'original', name), bytes);
    preserveFile(path.join(archive, 'published-catalog.json'), catalogBytes);
    await S.insertMissing(db, plan);
    const after = await S.readRows(db);
    for (const kind of ['documents', 'chunks']) {
      const current = new Map(after[kind].map(row => [row._id, S.rowHash(row)]));
      for (const row of before[kind]) assert.equal(current.get(row._id), S.rowHash(row), 'Existing database row changed');
    }
    const second = S.planImport({ dataset, catalog, baseline, ...after });
    await S.insertMissing(db, second);
    assert.deepEqual(second.report.inserted, { documents: 0, chunks: 0 }, 'Second ingestion added records');
    const finalRows = await S.readRows(db);
    assert.equal(S.rowHash(after), S.rowHash(finalRows), 'Second ingestion changed database rows');
    const index = await S.databaseIndex(db, catalog.courses);
    const T = require('../services/transcriptKnowledge');
    const retrieval = [];
    for (const mapping of index.mappings.filter(row => row.status === 'mapped')) {
      const course = catalog.courses.find(row => String(row._id) === mapping.courseId);
      const lesson = course.videos.find(row => String(row._id) === mapping.lessonId);
      const found = T.retrieveTranscripts({
        message: 'Explain this lecture transcript', courses: catalog.courses,
        viewingCourse: course, viewingLesson: lesson, index,
      });
      assert.ok(found.records.length, 'Transcript retrieval missing: ' + mapping.documentId);
      assert.ok(found.records.every(row => row.courseId === mapping.courseId && row.lessonId === mapping.lessonId));
      retrieval.push({ documentId: mapping.documentId, courseId: mapping.courseId, lessonId: mapping.lessonId,
        lessonName: mapping.lessonName, chunkIds: found.records.map(row => row.chunkId),
        sourceDocuments: found.records.map(row => row.sourceDocument) });
    }
    const byCourse = {};
    for (const mapping of index.mappings.filter(row => row.status === 'mapped')) {
      const group = byCourse[mapping.courseName] ||= { courseId: mapping.courseId, lessons: 0, chunks: 0 };
      group.lessons++;
      group.chunks += index.records.filter(row => row.documentId === mapping.documentId).length;
    }
    result.secondRun = second.report;
    result.after = { documents: finalRows.documents.length, chunks: finalRows.chunks.length };
    result.archive = archive;
    result.retrieval = { passedLessons: retrieval.length, byCourse, lessons: retrieval };
    result.existingDatabaseRowsUnchanged = true;
    result.secondRunUnchanged = true;
    return result;
  } finally { await client.close(); }
}

async function main(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') values.apply = true;
    else if (['--source', '--catalog', '--uri', '--report'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      values[arg.slice(2)] = args[++i];
    } else throw new Error('Unsupported or missing argument: ' + arg);
  }
  if (!values.source || !values.catalog || !values.uri) {
    throw new Error('Usage: node scripts/ingest-transcripts-local.cjs --source DIR --catalog FILE --uri mongodb://127.0.0.1:27017/DB [--apply] [--report FILE]');
  }
  const report = await run({ source: values.source, catalogFile: values.catalog, uri: values.uri, apply: values.apply });
  if (values.report) preserveFile(path.resolve(values.report), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, retrieval: report.retrieval ? { passedLessons: report.retrieval.passedLessons, byCourse: report.retrieval.byCourse } : undefined }, null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ status: 'failed', error: error.message }));
  process.exitCode = 1;
});

module.exports = { run };
