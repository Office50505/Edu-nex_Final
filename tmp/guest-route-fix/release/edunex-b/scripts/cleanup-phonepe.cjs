#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { executePhonePeCleanup } = require('../services/phonePeCleanup');

function option(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

async function main() {
  if (option('confirm') !== 'DELETE_CONFIRMED_PHONEPE_TEST_USERS') {
    throw new Error('Explicit PhonePe cleanup confirmation is required.');
  }
  const expectedUsers = Number(option('expected-users'));
  if (!Number.isInteger(expectedUsers) || expectedUsers < 0) throw new Error('A valid --expected-users count is required.');
  if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI || '')) throw new Error('MONGODB_URI must be configured.');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const result = await executePhonePeCleanup(mongoose.connection, {
    expectedUsers,
    parentDirectory: option('backup-parent') || undefined,
    repositoryRoot: require('node:path').join(__dirname, '..', '..'),
  });
  console.log(JSON.stringify({
    alreadyClean: result.alreadyClean,
    backup: result.backup ? {
      directory: result.backup.backupDirectory,
      verified: result.backup.verified,
      records: result.backup.totalRecords,
      checksumAlgorithm: 'sha256',
    } : null,
    deletedByCollection: result.deletedByCollection,
    before: result.before,
    after: result.after,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`PhonePe cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
