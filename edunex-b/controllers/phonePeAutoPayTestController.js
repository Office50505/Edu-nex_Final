const crypto = require('node:crypto');
const PhonePeAutoPayTest = require('../models/PhonePeAutoPayTest');
const phonePeAutoPay = require('../services/phonePeAutoPayService');

function compactReference(value, field = 'mandateId') {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(text)) {
    throw Object.assign(new Error(`${field} is invalid.`), { statusCode: 400 });
  }
  return text;
}

function generatedId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`.toUpperCase();
}

function recordLookup(reference) {
  const id = compactReference(reference);
  return {
    $or: [
      { testId: id },
      { merchantSubscriptionId: id },
      { phonePeMandateId: id },
    ],
  };
}

function adminId(req) {
  return String(req.admin?.id || req.admin?._id || req.admin?.email || 'admin');
}

function safeLog(action, value = {}) {
  console.info(JSON.stringify({
    scope: 'phonepe_autopay_test',
    action,
    testId: value.testId || null,
    userId: value.userId || null,
    merchantOrderId: value.merchantOrderId || null,
    merchantSubscriptionId: value.merchantSubscriptionId || null,
    phonePeMandateId: value.phonePeMandateId || null,
    requestId: value.requestId || null,
    status: value.status || null,
    timestamp: new Date().toISOString(),
  }));
}

function publicRecord(record) {
  const source = typeof record?.toObject === 'function' ? record.toObject() : record;
  if (!source) return null;
  return {
    testId: source.testId,
    userId: source.userId,
    executionMode: source.executionMode,
    merchantOrderId: source.merchantOrderId,
    merchantSubscriptionId: source.merchantSubscriptionId,
    phonePeMandateId: source.phonePeMandateId || null,
    phonePeOrderId: source.phonePeOrderId || null,
    requestId: source.requestId,
    amount: source.amountPaise,
    status: source.status,
    approvalUrl: source.approvalUrl || null,
    debit: source.debit || null,
    lastStatusCheckedAt: source.lastStatusCheckedAt || null,
    lastWebhookAt: source.lastWebhookAt || null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function statusFromWebhook(event, state) {
  const normalizedEvent = String(event || '').toLowerCase();
  const normalizedState = String(state || '').toUpperCase();
  if (normalizedEvent === 'checkout.order.completed') return 'ACTIVE';
  if (normalizedEvent === 'checkout.order.failed') return 'FAILED';
  if (normalizedEvent === 'subscription.cancelled') return 'CANCELLED';
  if (normalizedEvent === 'subscription.revoked') return 'REVOKED';
  if (normalizedEvent === 'subscription.paused') return 'PAUSED';
  if (normalizedEvent === 'subscription.unpaused') return 'ACTIVE';
  // Notification/redemption state belongs to the nested debit record and must
  // never replace the mandate's ACTIVE state.
  return null;
}

function webhookMutation(payload, rawPayload, headers = {}, now = new Date()) {
  const event = String(payload?.event || payload?.type || 'unknown');
  const data = payload?.payload || payload?.data || payload || {};
  const flow = data.paymentFlow || data.payment_flow || {};
  const meta = data.metaInfo || data.meta_info || {};
  const state = String(data.state || payload?.state || '').toUpperCase();
  const merchantOrderId = data.merchantOrderId || data.merchantTransactionId || null;
  const merchantSubscriptionId = flow.merchantSubscriptionId || data.merchantSubscriptionId || null;
  const phonePeMandateId = flow.subscriptionId || data.subscriptionId || null;
  const testId = meta.udf1 || null;
  const requestId = String(headers['x-request-id'] || headers['x-phonepe-request-id'] || merchantOrderId || '').slice(0, 200) || null;
  const queryParts = [];
  if (testId) queryParts.push({ testId: String(testId) });
  if (merchantSubscriptionId) queryParts.push({ merchantSubscriptionId: String(merchantSubscriptionId) });
  if (phonePeMandateId) {
    queryParts.push({
      $or: [
        { phonePeMandateId: String(phonePeMandateId) },
        // The setup-completed callback is the first time PhonePe's mandate ID is known.
        { phonePeMandateId: null },
      ],
    });
  }
  if (merchantOrderId) {
    queryParts.push({
      $or: [
        { merchantOrderId: String(merchantOrderId) },
        { 'debit.merchantOrderId': String(merchantOrderId) },
      ],
    });
  }
  if (!queryParts.length) return null;

  const callbackAmounts = [
    data.amount,
    flow.maxAmount,
    ...(Array.isArray(data.paymentDetails) ? data.paymentDetails.map(detail => detail?.amount) : []),
  ].filter(value => value !== undefined && value !== null);
  if (callbackAmounts.some(value => Number(value) !== phonePeAutoPay.TEST_AMOUNT_PAISE)) {
    return { invalid: true, reason: 'amount_mismatch' };
  }

  const set = { lastWebhookAt: now };
  const localStatus = statusFromWebhook(event, state);
  if (localStatus) set.status = localStatus;
  if (phonePeMandateId) set.phonePeMandateId = String(phonePeMandateId);
  if (String(event).startsWith('subscription.notification.')) {
    set['debit.notifyState'] = event.endsWith('.completed') ? 'NOTIFIED' : 'FAILED';
    set['debit.notifiedAt'] = now;
    if (flow.validAfter) set['debit.validAfter'] = new Date(Number(flow.validAfter));
  }
  if (String(event).startsWith('subscription.redemption.')) {
    set['debit.redeemState'] = event.endsWith('.completed') ? 'COMPLETED' : 'FAILED';
    if (event.endsWith('.completed')) set['debit.executedAt'] = now;
    const detail = data.paymentDetails?.[0] || {};
    if (detail.transactionId) set['debit.phonePeTransactionId'] = String(detail.transactionId);
  }

  return {
    query: queryParts.length === 1 ? queryParts[0] : { $and: queryParts },
    update: {
      $set: set,
      $push: {
        webhookEvents: {
          $each: [{ event, state: state || null, requestId, rawPayload, receivedAt: now }],
          $slice: -25,
        },
      },
    },
    log: { event, state: localStatus || state || null, requestId, merchantOrderId, merchantSubscriptionId, phonePeMandateId },
  };
}

async function applyVerifiedWebhook({ payload, rawPayload, headers }, { Model = PhonePeAutoPayTest } = {}) {
  const mutation = webhookMutation(payload, rawPayload, headers);
  if (!mutation) return { matched: false, reason: 'identity_missing' };
  if (mutation.invalid) return { matched: false, reason: mutation.reason };
  const record = await Model.findOneAndUpdate(mutation.query, mutation.update, { returnDocument: 'after', runValidators: true });
  if (!record) return { matched: false, reason: 'test_record_not_found' };
  safeLog('webhook', {
    ...mutation.log,
    testId: record.testId,
    userId: record.userId,
    requestId: mutation.log.requestId || record.requestId,
    merchantOrderId: mutation.log.merchantOrderId || record.merchantOrderId,
    merchantSubscriptionId: mutation.log.merchantSubscriptionId || record.merchantSubscriptionId,
    phonePeMandateId: mutation.log.phonePeMandateId || record.phonePeMandateId,
    status: record.status,
  });
  return { matched: true, record };
}

async function createMandate(req, res) {
  const amount = req.body?.amount === undefined ? phonePeAutoPay.TEST_AMOUNT_PAISE : req.body.amount;
  phonePeAutoPay.assertOneRupee(amount, 'Mandate amount');
  const userId = compactReference(req.body?.userId, 'userId');
  const testId = generatedId('APT');
  const merchantOrderId = generatedId('APTO');
  const merchantSubscriptionId = generatedId('APTS');
  const requestId = generatedId('APTR');
  const c = phonePeAutoPay.requireConfigured();
  const record = await PhonePeAutoPayTest.create({
    testId,
    userId,
    adminId: adminId(req),
    executionMode: c.mode,
    merchantId: c.merchantId,
    requestId,
    merchantOrderId,
    merchantSubscriptionId,
    amountPaise: phonePeAutoPay.TEST_AMOUNT_PAISE,
    status: 'SETUP_REQUESTED',
  });
  safeLog('create_requested', record);
  try {
    const result = await phonePeAutoPay.createMandate({
      testId,
      userId,
      merchantOrderId,
      merchantSubscriptionId,
      amount: phonePeAutoPay.TEST_AMOUNT_PAISE,
    });
    record.status = result.state || 'PENDING';
    record.phonePeOrderId = result.orderId || null;
    record.approvalUrl = result.approvalUrl || null;
    await record.save();
    safeLog('create_result', record);
    return res.status(201).json({
      success: true,
      mock: result.mock,
      test: publicRecord(record),
      note: result.mock ? 'Mock mode never contacts PhonePe or charges an account.' : 'Approving this URL creates only a ₹1 test mandate.',
    });
  } catch (error) {
    record.status = 'SETUP_FAILED';
    record.providerError = {
      httpStatus: Number(error.providerStatus) || null,
      code: error.providerCode || null,
      detailedCode: error.providerDetailedCode || null,
      message: error.providerMessage || 'PhonePe AutoPay setup failed.',
      recordedAt: new Date(),
    };
    await record.save().catch(() => {});
    safeLog('create_failed', record);
    throw error;
  }
}

async function getMandateStatus(req, res) {
  const record = await PhonePeAutoPayTest.findOne(recordLookup(req.params.mandateId));
  if (!record) return res.status(404).json({ error: 'AutoPay test record not found.' });
  const result = await phonePeAutoPay.getMandateStatus(record.merchantSubscriptionId);
  record.lastStatusCheckedAt = new Date();
  if (!result.mock) {
    const safeLimit = result.maxAmount === phonePeAutoPay.TEST_AMOUNT_PAISE
      && result.amountType === 'FIXED'
      && result.frequency === 'ON_DEMAND';
    record.status = safeLimit ? (result.state || record.status) : 'SAFETY_BLOCKED';
    record.phonePeMandateId = result.subscriptionId || record.phonePeMandateId;
  }
  await record.save();
  safeLog('status_checked', record);
  return res.json({ success: true, providerState: result.state, test: publicRecord(record) });
}

function debitBody(req) {
  if (req.body?.confirmTestDebit !== true) {
    throw Object.assign(new Error('confirmTestDebit must be true for every ₹1 debit action.'), { statusCode: 400 });
  }
  phonePeAutoPay.assertOneRupee(req.body?.amount, 'Debit amount');
  return { mandateId: compactReference(req.body?.mandateId) };
}

async function executeDebit(req, res) {
  const { mandateId } = debitBody(req);
  let record = await PhonePeAutoPayTest.findOne(recordLookup(mandateId));
  if (!record) return res.status(404).json({ error: 'AutoPay test record not found.' });

  const providerStatus = await phonePeAutoPay.getMandateStatus(record.merchantSubscriptionId);
  const safeProviderLimit = providerStatus.mock || (
    providerStatus.maxAmount === phonePeAutoPay.TEST_AMOUNT_PAISE
    && providerStatus.amountType === 'FIXED'
    && providerStatus.frequency === 'ON_DEMAND'
  );
  if (!safeProviderLimit) {
    record.status = 'SAFETY_BLOCKED';
    await record.save();
    return res.status(409).json({ error: 'PhonePe mandate limits do not match the fixed ₹1 on-demand test mandate.' });
  }
  const active = providerStatus.mock
    ? String(record.status).toUpperCase() === 'ACTIVE'
    : String(providerStatus.state).toUpperCase() === 'ACTIVE';
  if (!active) {
    return res.status(409).json({
      error: 'The test mandate must be ACTIVE before a debit can be notified or executed.',
      status: providerStatus.mock ? record.status : providerStatus.state,
    });
  }
  if (!providerStatus.mock && providerStatus.subscriptionId) {
    record.phonePeMandateId = providerStatus.subscriptionId;
    record.status = providerStatus.state;
    await record.save();
  }

  if (!record.debit?.merchantOrderId) {
    const merchantOrderId = generatedId('APTD');
    const requestId = generatedId('APTR');
    const reserved = await PhonePeAutoPayTest.findOneAndUpdate(
      { _id: record._id, $or: [{ 'debit.merchantOrderId': null }, { 'debit.merchantOrderId': { $exists: false } }] },
      { $set: {
        'debit.merchantOrderId': merchantOrderId,
        'debit.requestId': requestId,
        'debit.amountPaise': phonePeAutoPay.TEST_AMOUNT_PAISE,
        'debit.notifyState': 'REQUESTING',
      } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!reserved) return res.status(409).json({ error: 'A test debit notification is already in progress.' });
    try {
      const result = await phonePeAutoPay.executeDebit({
        operation: 'notify',
        merchantOrderId,
        merchantSubscriptionId: record.merchantSubscriptionId,
        testId: record.testId,
        amount: phonePeAutoPay.TEST_AMOUNT_PAISE,
      });
      record = await PhonePeAutoPayTest.findByIdAndUpdate(record._id, { $set: {
        'debit.notifyState': result.state,
        'debit.phonePeTransactionId': result.transactionId || null,
        'debit.validAfter': result.validAfter ? new Date(Number(result.validAfter)) : null,
        'debit.notifiedAt': new Date(),
      } }, { returnDocument: 'after', runValidators: true });
      safeLog('debit_notified', {
        ...record.toObject(), requestId, merchantOrderId, status: result.state,
      });
      return res.status(202).json({
        success: true,
        debitExecuted: false,
        stage: 'NOTIFIED',
        message: 'The ₹1 pre-debit notification was submitted. Call this endpoint again with the same confirmation after notification completion/validAfter to execute it.',
        test: publicRecord(record),
      });
    } catch (error) {
      await PhonePeAutoPayTest.updateOne({ _id: record._id }, { $set: { 'debit.notifyState': 'FAILED' } }).catch(() => {});
      throw error;
    }
  }

  const notifyState = String(record.debit?.notifyState || '').toUpperCase();
  if (!['NOTIFIED', 'COMPLETED'].includes(notifyState)) {
    return res.status(409).json({ error: 'The pre-debit notification is not complete yet.', notifyState });
  }
  if (record.debit?.validAfter && new Date(record.debit.validAfter).getTime() > Date.now()) {
    return res.status(409).json({ error: 'PhonePe has not reached the debit validAfter time yet.', validAfter: record.debit.validAfter });
  }
  const redeemState = String(record.debit?.redeemState || '').toUpperCase();
  if (['REQUESTING', 'PENDING', 'COMPLETED'].includes(redeemState)) {
    return res.status(409).json({ error: 'This test debit has already been requested.', redeemState });
  }

  const reserved = await PhonePeAutoPayTest.findOneAndUpdate(
    { _id: record._id, 'debit.notifyState': { $in: ['NOTIFIED', 'COMPLETED'] }, 'debit.redeemState': { $nin: ['REQUESTING', 'PENDING', 'COMPLETED'] } },
    { $set: { 'debit.redeemState': 'REQUESTING' } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!reserved) return res.status(409).json({ error: 'This test debit is already being executed.' });
  try {
    const result = await phonePeAutoPay.executeDebit({
      operation: 'redeem',
      merchantOrderId: record.debit.merchantOrderId,
      amount: phonePeAutoPay.TEST_AMOUNT_PAISE,
    });
    record = await PhonePeAutoPayTest.findByIdAndUpdate(record._id, { $set: {
      'debit.redeemState': result.state,
      'debit.phonePeTransactionId': result.transactionId || record.debit.phonePeTransactionId || null,
      'debit.executedAt': new Date(),
    } }, { returnDocument: 'after', runValidators: true });
    safeLog('debit_executed', {
      ...record.toObject(), requestId: record.debit.requestId, merchantOrderId: record.debit.merchantOrderId, status: result.state,
    });
    return res.status(202).json({ success: true, debitExecuted: true, stage: 'REDEEM', test: publicRecord(record) });
  } catch (error) {
    await PhonePeAutoPayTest.updateOne({ _id: record._id }, { $set: { 'debit.redeemState': 'FAILED' } }).catch(() => {});
    throw error;
  }
}

async function webhook(req, res) {
  const verification = phonePeAutoPay.verifyWebhook(req.body, req.headers);
  if (!verification.valid) {
    return res.status(401).json({ error: 'Invalid PhonePe AutoPay webhook.', reason: verification.reason });
  }
  const result = await applyVerifiedWebhook({
    payload: verification.payload,
    rawPayload: verification.rawPayload,
    headers: req.headers,
  });
  if (result.reason === 'amount_mismatch') {
    return res.status(422).json({ received: true, matched: false, error: 'Webhook amount did not match the ₹1 test limit.' });
  }
  return res.status(result.matched ? 200 : 202).json({ received: true, matched: result.matched });
}

module.exports = {
  createMandate,
  getMandateStatus,
  executeDebit,
  webhook,
  webhookMutation,
  applyVerifiedWebhook,
  debitBody,
};
