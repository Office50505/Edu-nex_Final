import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const modelsDir = path.join(rootDir, 'models');
const createMissing = process.argv.includes('--create-missing');

dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });

const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/edunex';

function normalizeIndex(index) {
  return JSON.stringify(index);
}

function isIdIndex(index) {
  return normalizeIndex(index) === normalizeIndex({ _id: 1 });
}

function loadModels() {
  fs.readdirSync(modelsDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .forEach((file) => {
      require(path.join(modelsDir, file));
    });
}

async function auditModel(modelName) {
  const Model = mongoose.model(modelName);
  const expectedIndexes = Model.schema.indexes()
    .map(([keys, options]) => ({
      keys,
      options,
      signature: normalizeIndex(keys),
    }))
    .filter((index) => !isIdIndex(index.keys));

  let existingIndexes = await Model.collection.indexes();
  let existingSignatures = new Set(existingIndexes.map((index) => normalizeIndex(index.key)));
  let missing = expectedIndexes.filter((index) => !existingSignatures.has(index.signature));

  if (createMissing && missing.length) {
    for (const index of missing) {
      await Model.collection.createIndex(index.keys, index.options || {});
    }

    existingIndexes = await Model.collection.indexes();
    existingSignatures = new Set(existingIndexes.map((index) => normalizeIndex(index.key)));
    missing = expectedIndexes.filter((index) => !existingSignatures.has(index.signature));
  }

  return {
    modelName,
    collectionName: Model.collection.name,
    expectedCount: expectedIndexes.length,
    existingCount: existingIndexes.length,
    missing,
  };
}

async function main() {
  if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  loadModels();
  await mongoose.connect(mongodbUri);

  const results = [];
  for (const modelName of mongoose.modelNames().sort()) {
    results.push(await auditModel(modelName));
  }

  const missingTotal = results.reduce((sum, result) => sum + result.missing.length, 0);

  console.log(`MongoDB index audit${createMissing ? ' with create-missing' : ''}`);
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`Models: ${results.length}`);
  console.log(`Missing indexes: ${missingTotal}`);
  console.log('');

  results.forEach((result) => {
    console.log(`${result.modelName} -> ${result.collectionName}`);
    console.log(`  expected schema indexes: ${result.expectedCount}`);
    console.log(`  existing db indexes: ${result.existingCount}`);

    if (!result.missing.length) {
      console.log('  missing: none');
      return;
    }

    result.missing.forEach((index) => {
      const options = Object.keys(index.options || {}).length
        ? ` ${JSON.stringify(index.options)}`
        : '';
      console.log(`  missing: ${JSON.stringify(index.keys)}${options}`);
    });
  });

  if (missingTotal > 0 && !createMissing) {
    console.log('');
    console.log('Run `npm run db:index:create` to create missing schema indexes without dropping existing indexes.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`MongoDB index audit failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
