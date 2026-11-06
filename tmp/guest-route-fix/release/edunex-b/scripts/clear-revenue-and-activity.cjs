#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm=CLEAR_REVENUE_AND_ACTIVITY');

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI.');
  process.exit(1);
}
if (apply && !confirmed) {
  console.error('Refusing to clear. Re-run with --apply --confirm=CLEAR_REVENUE_AND_ACTIVITY');
  process.exit(1);
}

const modelDefs = [
  ['Order', '../models/Order'],
  ['Subscription', '../models/Subscription'],
  ['SubscriptionEvent', '../models/SubscriptionEvent'],
  ['RazorpayBilling', '../models/RazorpayBilling'],
  ['AnalyticsEvent', '../models/AnalyticsEvent'],
  ['BillingWebhook', '../models/BillingWebhook'],
  ['PhonePeEventClaim', '../models/PhonePeEventClaim'],
];

function loadModel(name, path) {
  try {
    require(path);
    return mongoose.model(name);
  } catch (error) {
    if (error && (error.name === 'MissingSchemaError' || error.code === 'MODULE_NOT_FOUND')) return null;
    throw error;
  }
}

async function countOrDelete(Model, label) {
  if (!Model) return null;
  const count = await Model.countDocuments({});
  if (!apply) return { label, count };
  const result = await Model.deleteMany({});
  return { label, count, deleted: result.deletedCount || 0 };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || undefined,
    serverSelectionTimeoutMS: 15000,
  });

  const models = modelDefs.map(([name, path]) => [name, loadModel(name, path)]);
  const results = [];
  for (const [name, Model] of models) {
    const result = await countOrDelete(Model, name);
    if (result) results.push(result);
  }

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    database: mongoose.connection.name,
    host: mongoose.connection.host,
    results,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
