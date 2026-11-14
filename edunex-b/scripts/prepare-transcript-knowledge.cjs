const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { ROOT, readDataset, prepareDataset, sha } = require('../services/transcriptDataset');

function summary(value) {
  if (typeof value === 'string' && value.length > 120) {
    return { bytes: Buffer.byteLength(value), sha256: sha(value) };
  }
  if (value && typeof value === 'object') {
    return { count: Object.keys(value).length, sha256: sha(JSON.stringify(value)) };
  }
  return value === undefined ? { missing: true } : value;
}

function differences(before, after, field = '', result = []) {
  if (isDeepStrictEqual(before, after)) return result;
  if (before && after && typeof before === 'object' && typeof after === 'object'
    && Array.isArray(before) === Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      differences(before[key], after[key], field ? `${field}.${key}` : key, result);
    }
  } else {
    result.push({ field, existing: summary(before), incoming: summary(after) });
  }
  return result;
}

function counts(index) {
  return {
    documents: index?.mappings?.length || 0,
    records: index?.records?.length || 0,
  };
}

function compareExisting(existing, incoming) {
  const changes = differences(existing, incoming);
  const previous = new Map((existing.records || []).map(record => [record.chunkId, record]));
  const next = new Map(incoming.records.map(record => [record.chunkId, record]));
  const added = [], removed = [], changed = [], skipped = [];
  for (const [id, record] of next) {
    if (!previous.has(id)) added.push(id);
    else if (isDeepStrictEqual(previous.get(id), record)) skipped.push(id);
    else changed.push(id);
  }
  for (const id of previous.keys()) if (!next.has(id)) removed.push(id);
  return {
    status: changes.length ? 'approval_required' : 'unchanged',
    before: counts(existing), after: counts(existing), proposed: counts(incoming),
    addedRecords: 0, skippedRecords: skipped.length,
    proposedAddedRecordIds: added, proposedRemovedRecordIds: removed,
    changedRecordIds: changed, differences: changes,
  };
}

function ingestTranscriptIndex({ directory = ROOT, catalog, check = false }) {
  const indexPath = path.join(directory, 'index.json');
  // Inspect the existing index first. Corrupt indexes fail closed.
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!existing || existing.schemaVersion !== 1 || !Array.isArray(existing.records)
      || !Array.isArray(existing.mappings)) throw new Error('Invalid existing transcript index');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let dataset, incoming;
  try {
    dataset = readDataset(directory);
    incoming = prepareDataset(dataset, catalog);
  } catch (error) {
    return {
      status: 'blocked', addedRecords: 0, before: counts(existing), after: counts(existing),
      validationError: error.message,
      differences: dataset && existing ? differences(existing.sourceHashes, dataset.hashes, 'sourceHashes') : [],
    };
  }
  if (existing) return compareExisting(existing, incoming);
  if (check) return { status: 'missing_index', addedRecords: 0, before: counts(), after: counts() };

  try {
    fs.writeFileSync(indexPath, JSON.stringify(incoming, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    // A concurrent creation must also be compared, never overwritten.
    if (error.code !== 'EEXIST') throw error;
    return compareExisting(JSON.parse(fs.readFileSync(indexPath, 'utf8')), incoming);
  }
  return {
    status: 'created', before: counts(), after: counts(incoming),
    addedRecords: incoming.records.length, skippedRecords: 0, audit: incoming.audit,
  };
}

function main(args) {
  const catalogAt = args.indexOf('--catalog');
  const catalogFile = args[catalogAt + 1];
  if (catalogAt < 0 || !catalogFile || catalogFile.startsWith('--')
    || args.some((arg, i) => i !== catalogAt + 1 && !['--catalog', '--check'].includes(arg))) {
    throw new Error('Usage: node scripts/prepare-transcript-knowledge.cjs --catalog PATH [--check]');
  }
  const catalog = JSON.parse(fs.readFileSync(path.resolve(catalogFile), 'utf8'));
  const report = ingestTranscriptIndex({ catalog, check: args.includes('--check') });
  console.log(JSON.stringify(report, null, 2));
  if (!['created', 'unchanged'].includes(report.status)) {
    console.error('No existing transcripts or index records were changed. Review the differences and obtain explicit approval before replacing an existing index.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(JSON.stringify({ status: 'blocked', addedRecords: 0, error: error.message }));
    process.exitCode = 1;
  }
}

module.exports = { ingestTranscriptIndex };
