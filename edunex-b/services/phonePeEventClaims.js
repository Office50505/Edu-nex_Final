const { createHash, randomUUID } = require('node:crypto');
const PhonePeEventClaim = require('../models/PhonePeEventClaim');

const CLAIM_LEASE_MS = 2 * 60 * 1000;
const indexPromises = new WeakMap();

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function callbackEventIdentity(merchantTransactionId) {
  const merchantId = String(merchantTransactionId || '').trim();
  return merchantId ? `phonepe:payment:${digest(merchantId)}` : null;
}

function webhookEventIdentity({ event, merchantTransactionId, phonePeTransactionId, merchantSubscriptionId }) {
  const eventType = String(event || '').trim().toUpperCase();
  const merchantId = String(merchantTransactionId || '').trim();
  if (!eventType) return null;
  if (merchantId && ['PAYMENT_SUCCESS', 'PAYMENT_FAILED'].includes(eventType)) {
    return callbackEventIdentity(merchantId);
  }
  const providerIdentity = String(phonePeTransactionId || merchantId || merchantSubscriptionId || '').trim();
  return providerIdentity ? `phonepe:webhook:${digest(`${eventType}|${providerIdentity}`)}` : null;
}

async function resolveQuery(query) {
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

async function ensurePhonePeClaimIndex(model = PhonePeEventClaim) {
  if (!model?.collection?.createIndex) return;
  if (!indexPromises.has(model)) {
    const pending = model.collection.createIndex(
      { eventKey: 1 },
      { unique: true, name: 'phonepe_event_key_unique' }
    ).catch((error) => {
      indexPromises.delete(model);
      throw error;
    });
    indexPromises.set(model, pending);
  }
  await indexPromises.get(model);
}

async function claimPhonePeEvent({ eventKey, source, eventType }, options = {}) {
  if (!eventKey || !['callback', 'webhook'].includes(source) || !eventType) {
    throw Object.assign(new Error('Invalid PhonePe event identity.'), { statusCode: 400 });
  }
  const model = options.model || PhonePeEventClaim;
  await ensurePhonePeClaimIndex(model);
  const now = options.now || new Date();
  const leaseToken = (options.tokenFactory || randomUUID)();
  const leaseExpiresAt = new Date(now.getTime() + (options.leaseMs || CLAIM_LEASE_MS));
  try {
    const record = await resolveQuery(model.findOneAndUpdate(
      {
        eventKey,
        $or: [
          { status: 'failed' },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $setOnInsert: { eventKey, source, eventType },
        $set: {
          status: 'processing',
          leaseToken,
          leaseExpiresAt,
          processedAt: null,
          lastFailureCode: null,
        },
        $inc: { attempts: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ));
    return { acquired: true, eventKey, leaseToken, status: record?.status || 'processing' };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const lookup = model.findOne({ eventKey });
    const existing = await resolveQuery(lookup && typeof lookup.select === 'function' ? lookup.select('status') : lookup);
    return { acquired: false, eventKey, leaseToken: null, status: existing?.status || 'processing' };
  }
}

async function markPhonePeEventProcessed(claim, options = {}) {
  if (!claim?.acquired || !claim.eventKey || !claim.leaseToken) throw new Error('PhonePe event claim ownership is required.');
  const model = options.model || PhonePeEventClaim;
  const now = options.now || new Date();
  const result = await model.updateOne(
    { eventKey: claim.eventKey, leaseToken: claim.leaseToken, status: 'processing' },
    { $set: { status: 'processed', processedAt: now, leaseExpiresAt: now, lastFailureCode: null } }
  );
  if (result?.matchedCount === 0) throw new Error('PhonePe event claim ownership was lost.');
}

async function markPhonePeEventFailed(claim, failureCode = 'processing_error', options = {}) {
  if (!claim?.acquired || !claim.eventKey || !claim.leaseToken) return;
  const model = options.model || PhonePeEventClaim;
  const now = options.now || new Date();
  await model.updateOne(
    { eventKey: claim.eventKey, leaseToken: claim.leaseToken, status: 'processing' },
    { $set: { status: 'failed', leaseExpiresAt: now, processedAt: null, lastFailureCode: String(failureCode).slice(0, 80) } }
  );
}

module.exports = {
  callbackEventIdentity,
  claimPhonePeEvent,
  ensurePhonePeClaimIndex,
  markPhonePeEventFailed,
  markPhonePeEventProcessed,
  webhookEventIdentity,
};
