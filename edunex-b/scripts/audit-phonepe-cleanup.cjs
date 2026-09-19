#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { auditPhonePeCleanup } = require('../services/phonePeCleanupAudit');

async function main() {
  if (process.argv.slice(2).length) {
    throw new Error('This command is read-only and accepts no apply/delete arguments.');
  }
  if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI || '')) {
    throw new Error('MONGODB_URI must be configured.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const result = await auditPhonePeCleanup(mongoose.connection.db);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(`PhonePe cleanup dry run failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
