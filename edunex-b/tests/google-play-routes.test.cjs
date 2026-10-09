const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createGooglePlayIapService, GooglePlayIapError } = require('../services/googlePlayIapService');
const { decodeGooglePlayRtdnMessage, verifyGooglePlayPubSubAuthorization } = require('../services/googlePlayRtdn');

const userId = '507f1f77bcf86cd799439011';
const secret = 'google-play-route-test-secret';
const sessionId = 'current-test-session';
const purchaseToken = 'test-purchase-token-'.padEnd(64, 'x');

function load(file, dependencies, env = {}) {
  const module = { exports: {} };
  const run = vm.compileFunction(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    ['module', 'exports', 'require', 'process', 'console'], { filename: file });
  run(module, module.exports, name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, { env }, console);
  return module.exports;
}

async function harness(t, options = {}) {
  const calls = [];
  const user = { _id: userId, activeSessionId: sessionId, isActive: true };
  const auth = load('middleware/compatAuth.js', {
    jsonwebtoken: jwt,
    mongoose,
    '../models/User': { findById: id => ({ select: () => ({ lean: async () => id === userId ? user : null }) }) },
  }, { NODE_ENV: 'production', JWT_SECRET: secret });
  const config = load('services/googlePlayEntitlement.js', {}, options.env);
  const verification = createGooglePlayIapService({
    GooglePlaySubscription: { findOne: async () => null }, User: {},
    GooglePlayReconciliation: { findOne: async () => null, findOneAndUpdate: async query => ({ ...query, generation: 1 }), updateOne: async () => ({ matchedCount: 1 }) },
    loadSnapshot: async () => { throw new GooglePlayIapError('fixture unavailable', 503, 'GOOGLE_PLAY_API_UNAVAILABLE'); },
  });
  const service = {
    statusForUser: async id => {
      calls.push(['status', id]);
      return { entitlementState: 'NONE', entitlementActive: false, obfuscatedAccountId: 'account-hash', ...options.status };
    },
    verifyClientPurchase: async (id, token) => {
      calls.push(['verify', id, token]);
      if (options.verifyError) throw options.verifyError;
      if (options.useRealValidation) return verification.verifyClientPurchase(id, token);
      return { productId: config.GOOGLE_PLAY_PRODUCT_ID, entitlementState: 'ACTIVE', entitlementActive: true };
    },
    processDeveloperNotification: async token => { calls.push(['notification', token]); },
  };
  const router = load('routes/googlePlayIap.js', {
    express,
    '../middleware/compatAuth': auth,
    '../services/googlePlayEntitlement': config,
    '../services/googlePlayIapService': { createGooglePlayIapService: () => service },
    '../services/googlePlayRtdn': {
      decodeGooglePlayRtdnMessage,
      verifyGooglePlayPubSubAuthorization: authorization => verifyGooglePlayPubSubAuthorization(authorization, {
        audience: 'https://api.skillomate.in/api/google-play-iap/notifications',
        serviceAccountEmail: 'test-push@example.iam.gserviceaccount.com',
        client: { verifyIdToken: async ({ idToken }) => {
          if (idToken !== 'valid-push-token') throw new Error('invalid signature');
          return { getPayload: () => ({ email: 'test-push@example.iam.gserviceaccount.com', email_verified: true }) };
        } },
      }),
    },
  });
  const app = express();
  app.set('env', 'test');
  app.use(express.json());
  // Execute the actual server mount without starting its database, jobs or integrations.
  const mounts = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8')
    .split('\n').filter(line => /require\(['"]\.\/routes\/googlePlayIap['"]\)/.test(line));
  assert.equal(mounts.length, 1, 'server must mount the Google Play router exactly once');
  vm.runInNewContext(mounts[0], { app, require: () => router });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const accessToken = jwt.sign({ userId, sessionId }, secret, { expiresIn: '5m' });
  async function request(url, { method = 'GET', body, token = accessToken, rawBody } = {}) {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text.startsWith('{') ? JSON.parse(text) : text };
  }
  return { request, calls, user };
}

test('server exposes authenticated Google config under /api exactly once with the confirmed defaults', async t => {
  const h = await harness(t);
  const response = await h.request('/api/google-play-iap/config');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.body.productId, 'skillomate_premium_monthly');
  assert.equal(response.body.packageName, 'com.skillomate.app');
  assert.equal(response.body.introductoryOfferId, 'intro-9rs-3days');
  assert.equal(response.body.obfuscatedAccountId, 'account-hash');
  assert.equal((await h.request('/api/google-play-iap/google-play-iap/config')).status, 404);
  assert.equal((await h.request('/google-play-iap/config')).status, 404);
});

test('environment overrides control purchase configuration even when a stored purchase has an older product', async t => {
  const h = await harness(t, {
    env: {
      GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID: 'test_premium_monthly',
      GOOGLE_PLAY_PACKAGE_NAME: 'com.skillomate.test',
      GOOGLE_PLAY_INTRODUCTORY_OFFER_ID: 'test-intro',
    },
    status: { productId: 'old_product', packageName: 'old.package', managementUrl: 'https://old.invalid' },
  });
  const response = await h.request('/api/google-play-iap/config');
  assert.equal(response.body.productId, 'test_premium_monthly');
  assert.equal(response.body.packageName, 'com.skillomate.test');
  assert.equal(response.body.introductoryOfferId, 'test-intro');
  const management = new URL(response.body.managementUrl);
  assert.equal(management.searchParams.get('sku'), 'test_premium_monthly');
  assert.equal(management.searchParams.get('package'), 'com.skillomate.test');
});

test('config, status and verification reject unauthenticated and revoked sessions before billing work', async t => {
  const h = await harness(t);
  const revoked = jwt.sign({ userId, sessionId: 'revoked-session' }, secret);
  for (const token of [null, 'invalid-jwt', revoked]) {
    for (const [url, method] of [['config', 'GET'], ['status', 'GET'], ['verify', 'POST']]) {
      const result = await h.request(`/api/google-play-iap/${url}`, { method, token, ...(method === 'POST' ? { body: { purchaseToken } } : {}) });
      assert.equal(result.status, 401);
    }
  }
  assert.equal(h.calls.length, 0);
  h.user.isActive = false;
  assert.equal((await h.request('/api/google-play-iap/config')).status, 401);
});

test('verification uses the authenticated owner and token, ignoring client-claimed product/package/status', async t => {
  const h = await harness(t);
  const result = await h.request('/api/google-play-iap/verify', { method: 'POST', body: {
    purchaseToken, userId: 'another-user', productId: 'wrong', packageName: 'wrong', entitlementActive: true,
  } });
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls, [['verify', userId, purchaseToken]]);
  assert.equal(result.body.productId, 'skillomate_premium_monthly');
});

test('verification rejects missing, malformed and oversized tokens and malformed JSON', async t => {
  const h = await harness(t, { useRealValidation: true });
  for (const value of [undefined, null, {}, 1, '', 'short', 'x'.repeat(4097)]) {
    const result = await h.request('/api/google-play-iap/verify', { method: 'POST', body: { purchaseToken: value } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'GOOGLE_PLAY_TOKEN_REQUIRED');
  }
  assert.equal((await h.request('/api/google-play-iap/verify', { method: 'POST', rawBody: '{broken' })).status, 400);
});

test('verification errors preserve safe client codes and hide provider internals', async t => {
  const unavailable = await harness(t, { useRealValidation: true });
  const result = await unavailable.request('/api/google-play-iap/verify', { method: 'POST', body: { purchaseToken } });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'GOOGLE_PLAY_API_UNAVAILABLE');
  assert.doesNotMatch(result.body.error, /fixture/);
  const mismatch = await harness(t, { verifyError: new GooglePlayIapError('Wrong product', 422, 'GOOGLE_PLAY_PRODUCT_MISMATCH') });
  const rejected = await mismatch.request('/api/google-play-iap/verify', { method: 'POST', body: { purchaseToken } });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.code, 'GOOGLE_PLAY_PRODUCT_MISMATCH');
});

test('verification rate limit applies before another verification call', async t => {
  const h = await harness(t);
  for (let attempt = 0; attempt < 12; attempt++) {
    assert.equal((await h.request('/api/google-play-iap/verify', { method: 'POST', body: { purchaseToken } })).status, 200);
  }
  assert.equal((await h.request('/api/google-play-iap/verify', { method: 'POST', body: { purchaseToken } })).status, 429);
  assert.equal(h.calls.length, 12);
});

test('status returns authenticated entitlement state without caching', async t => {
  const h = await harness(t, { status: { entitlementState: 'EXPIRED', entitlementActive: false } });
  const result = await h.request('/api/google-play-iap/status');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.body.entitlementState, 'EXPIRED');
  assert.equal(result.body.entitlementActive, false);
  assert.deepEqual(h.calls, [['status', userId]]);
});

test('notifications require Pub/Sub authentication and the correct package before processing', async t => {
  const h = await harness(t);
  const body = notification => ({ message: { data: Buffer.from(JSON.stringify(notification)).toString('base64') } });
  const notification = { packageName: 'com.skillomate.app', subscriptionNotification: { purchaseToken } };
  for (const token of [null, 'forged-push-token']) {
    assert.equal((await h.request('/api/google-play-iap/notifications', { method: 'POST', token, body: body(notification) })).status, 401);
  }
  assert.equal(h.calls.length, 0);
  const send = value => h.request('/api/google-play-iap/notifications', { method: 'POST', token: 'valid-push-token', body: body(value) });
  assert.equal((await send({ ...notification, packageName: 'wrong.package' })).status, 403);
  assert.equal((await send({ packageName: 'com.skillomate.app', subscriptionNotification: {} })).status, 400);
  assert.equal((await send({ packageName: 'com.skillomate.app', testNotification: {} })).status, 204);
  assert.equal(h.calls.length, 0);
  assert.equal((await send(notification)).status, 204);
  assert.deepEqual(h.calls, [['notification', purchaseToken]]);
  assert.equal((await send({ packageName: 'com.skillomate.app',
    voidedPurchaseNotification: { productType: 1, purchaseToken, refundType: 1 } })).status, 204);
  assert.deepEqual(h.calls, [['notification', purchaseToken], ['notification', purchaseToken]]);
  assert.equal((await send({ packageName: 'com.skillomate.app',
    voidedPurchaseNotification: { productType: 2, purchaseToken } })).status, 204);
  assert.equal(h.calls.length, 2);
});
