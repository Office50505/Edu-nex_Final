const crypto = require('node:crypto');
const querystring = require('node:querystring');

const TEST_AMOUNT_PAISE = 100;
const SANDBOX_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const LIVE_BASE_URL = 'https://api.phonepe.com/apis/pg';
const LIVE_AUTH_BASE_URL = 'https://api.phonepe.com/apis/identity-manager';
const tokenCache = new Map();

function isTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizedMode(value) {
  const mode = String(value || 'mock').trim().toLowerCase();
  if (!['mock', 'sandbox', 'live'].includes(mode)) {
    throw Object.assign(new Error('PHONEPE_AUTOPAY_MODE must be mock, sandbox, or live.'), { statusCode: 503 });
  }
  return mode;
}

function config(env = process.env) {
  const mode = normalizedMode(env.PHONEPE_AUTOPAY_MODE);
  const baseUrl = String(env.PHONEPE_AUTOPAY_BASE_URL || (mode === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL)).replace(/\/+$/, '');
  const authBaseUrl = String(env.PHONEPE_AUTOPAY_AUTH_BASE_URL
    || (mode === 'live' ? LIVE_AUTH_BASE_URL : baseUrl)).replace(/\/+$/, '');

  return {
    nodeEnv: String(env.NODE_ENV || '').trim().toLowerCase(),
    enabled: isTrue(env.PHONEPE_AUTOPAY_ENABLED),
    mode,
    liveTestEnabled: isTrue(env.PHONEPE_AUTOPAY_LIVE_TEST_ENABLED),
    baseUrl,
    authBaseUrl,
    merchantId: String(env.PHONEPE_AUTOPAY_MERCHANT_ID || '').trim(),
    // PhonePe documents X-MERCHANT-ID for partner/aggregator integrations.
    // Direct merchants authenticate with their own OAuth token and leave this empty.
    partnerMerchantId: String(env.PHONEPE_AUTOPAY_PARTNER_MERCHANT_ID || '').trim(),
    clientId: String(env.PHONEPE_AUTOPAY_CLIENT_ID || '').trim(),
    clientSecret: String(env.PHONEPE_AUTOPAY_CLIENT_SECRET || ''),
    clientVersion: String(env.PHONEPE_AUTOPAY_CLIENT_VERSION || '1').trim(),
    callbackUrl: String(env.PHONEPE_AUTOPAY_CALLBACK_URL || '').trim(),
    redirectUrl: String(env.PHONEPE_AUTOPAY_REDIRECT_URL || '').trim(),
    webhookAuthType: String(env.PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE || 'sha').trim().toLowerCase(),
    webhookUsername: String(env.PHONEPE_AUTOPAY_WEBHOOK_USERNAME || '').trim(),
    webhookPassword: String(env.PHONEPE_AUTOPAY_WEBHOOK_PASSWORD || ''),
    webhookHmacSecret: String(env.PHONEPE_AUTOPAY_HMAC_SECRET || env.PHONEPE_AUTOPAY_SALT_KEY || ''),
    webhookHmacKeyId: String(env.PHONEPE_AUTOPAY_HMAC_KEY_ID || '').trim(),
  };
}

function assertOneRupee(amount, label = 'amount') {
  if (Number(amount) !== TEST_AMOUNT_PAISE) {
    throw Object.assign(new Error(`${label} must be exactly 100 paise (₹1) for the AutoPay test harness.`), { statusCode: 400 });
  }
  return TEST_AMOUNT_PAISE;
}

function requireConfigured(options = {}) {
  const c = options.env ? config(options.env) : (options.config || config());
  if (!c.enabled) {
    throw Object.assign(new Error('PhonePe AutoPay test harness is disabled.'), { statusCode: 503 });
  }
  if (c.nodeEnv === 'production') {
    throw Object.assign(new Error('PhonePe AutoPay test harness is unavailable in production.'), { statusCode: 503 });
  }
  if (!c.merchantId) {
    throw Object.assign(new Error('PHONEPE_AUTOPAY_MERCHANT_ID is required.'), { statusCode: 503 });
  }
  if (c.mode === 'mock') return c;

  const missing = [];
  if (!c.clientId) missing.push('PHONEPE_AUTOPAY_CLIENT_ID');
  if (!c.clientSecret) missing.push('PHONEPE_AUTOPAY_CLIENT_SECRET');
  if (!c.clientVersion) missing.push('PHONEPE_AUTOPAY_CLIENT_VERSION');
  if (!c.callbackUrl) missing.push('PHONEPE_AUTOPAY_CALLBACK_URL');
  if (!c.redirectUrl) missing.push('PHONEPE_AUTOPAY_REDIRECT_URL');
  if (missing.length) {
    throw Object.assign(new Error(`Missing AutoPay configuration: ${missing.join(', ')}`), { statusCode: 503 });
  }

  let parsedBase;
  let parsedAuth;
  let parsedCallback;
  let parsedRedirect;
  try {
    parsedBase = new URL(c.baseUrl);
    parsedAuth = new URL(c.authBaseUrl);
    parsedCallback = new URL(c.callbackUrl);
    parsedRedirect = new URL(c.redirectUrl);
  } catch {
    throw Object.assign(new Error('PhonePe AutoPay base, callback, and redirect URLs must be valid HTTPS URLs.'), { statusCode: 503 });
  }
  if (parsedBase.protocol !== 'https:' || parsedAuth.protocol !== 'https:' || parsedCallback.protocol !== 'https:' || parsedRedirect.protocol !== 'https:') {
    throw Object.assign(new Error('PhonePe AutoPay network mode requires HTTPS endpoints.'), { statusCode: 503 });
  }
  if (c.mode === 'sandbox') {
    if (parsedBase.hostname !== 'api-preprod.phonepe.com' || !parsedBase.pathname.startsWith('/apis/pg-sandbox')) {
      throw Object.assign(new Error('Sandbox mode only permits the official PhonePe pre-production API host.'), { statusCode: 503 });
    }
    if (parsedAuth.hostname !== 'api-preprod.phonepe.com' || !parsedAuth.pathname.startsWith('/apis/pg-sandbox')) {
      throw Object.assign(new Error('Sandbox credentials may only be sent to the official PhonePe pre-production auth host.'), { statusCode: 503 });
    }
  }
  if (c.mode === 'live') {
    if (!c.liveTestEnabled) {
      throw Object.assign(new Error('Live ₹1 testing also requires PHONEPE_AUTOPAY_LIVE_TEST_ENABLED=true.'), { statusCode: 503 });
    }
    if (parsedBase.hostname !== 'api.phonepe.com' || !parsedBase.pathname.startsWith('/apis/pg')) {
      throw Object.assign(new Error('Live test mode only permits the official PhonePe production API host.'), { statusCode: 503 });
    }
    if (parsedAuth.hostname !== 'api.phonepe.com' || !parsedAuth.pathname.startsWith('/apis/identity-manager')) {
      throw Object.assign(new Error('Live credentials may only be sent to the official PhonePe identity-manager host.'), { statusCode: 503 });
    }
  }
  return c;
}

function compactId(value, field) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(text)) {
    throw Object.assign(new Error(`${field} must be 1-63 characters using letters, numbers, _ or -.`), { statusCode: 400 });
  }
  return text;
}

function buildCreateMandateRequest({
  merchantOrderId,
  merchantSubscriptionId,
  testId,
  userId,
  amount = TEST_AMOUNT_PAISE,
  redirectUrl = 'https://example.invalid/phonepe-autopay/return',
  now = Date.now(),
  mandateDays = 30,
}) {
  assertOneRupee(amount, 'Mandate amount');
  let normalizedRedirectUrl;
  try { normalizedRedirectUrl = new URL(String(redirectUrl || '')).toString(); }
  catch { throw Object.assign(new Error('redirectUrl must be a valid HTTPS URL.'), { statusCode: 400 }); }
  if (!normalizedRedirectUrl.startsWith('https://')) {
    throw Object.assign(new Error('redirectUrl must be a valid HTTPS URL.'), { statusCode: 400 });
  }
  const boundedDays = Math.max(1, Math.min(Number(mandateDays) || 30, 90));
  return {
    merchantOrderId: compactId(merchantOrderId, 'merchantOrderId'),
    amount: TEST_AMOUNT_PAISE,
    expireAfter: 900,
    metaInfo: {
      udf1: String(testId || '').slice(0, 256),
      udf2: 'SKILLOMATE_AUTOPAY_TEST',
      udf3: String(userId || '').slice(0, 256),
    },
    paymentFlow: {
      type: 'SUBSCRIPTION_CHECKOUT_SETUP',
      merchantUrls: {
        redirectUrl: normalizedRedirectUrl,
      },
      subscriptionDetails: {
        subscriptionType: 'RECURRING',
        merchantSubscriptionId: compactId(merchantSubscriptionId, 'merchantSubscriptionId'),
        authWorkflowType: 'TRANSACTION',
        amountType: 'FIXED',
        maxAmount: TEST_AMOUNT_PAISE,
        frequency: 'ON_DEMAND',
        expireAt: now + (boundedDays * 24 * 60 * 60 * 1000),
      },
    },
  };
}

function buildDebitNotificationRequest({ merchantOrderId, merchantSubscriptionId, testId, amount = TEST_AMOUNT_PAISE, now = Date.now() }) {
  assertOneRupee(amount, 'Debit amount');
  return {
    merchantOrderId: compactId(merchantOrderId, 'merchantOrderId'),
    amount: TEST_AMOUNT_PAISE,
    expireAt: now + (48 * 60 * 60 * 1000),
    metaInfo: {
      udf1: String(testId || '').slice(0, 256),
      udf2: 'SKILLOMATE_AUTOPAY_TEST_DEBIT',
    },
    paymentFlow: {
      type: 'SUBSCRIPTION_CHECKOUT_REDEMPTION',
      merchantSubscriptionId: compactId(merchantSubscriptionId, 'merchantSubscriptionId'),
      redemptionRetryStrategy: 'STANDARD',
      // Deliberately false: notification and debit remain two explicit admin actions.
      autoDebit: false,
    },
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { message: 'PhonePe returned a non-JSON response.' }; }
}

function safeProviderText(value, fallback = '') {
  return String(value || fallback)
    .replace(/(?:O-)?Bearer\s+[A-Za-z0-9._~-]+/gi, '[redacted-auth]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}

function providerError(body, fallback, status) {
  const message = safeProviderText(body?.message || body?.error_description || body?.error, fallback);
  const error = new Error(message);
  error.statusCode = 502;
  error.providerStatus = status;
  error.providerCode = safeProviderText(body?.code || body?.errorCode || body?.error);
  error.providerDetailedCode = safeProviderText(body?.detailedErrorCode || body?.detailed_error_code);
  error.providerMessage = message;
  return error;
}

async function requestJson(url, { method = 'GET', token, body, fetchImpl = global.fetch, merchantId }) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `O-Bearer ${token}`;
  if (merchantId) headers['X-MERCHANT-ID'] = merchantId;
  const response = await fetchImpl(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const data = await readJson(response);
  if (!response.ok) throw providerError(data, 'PhonePe AutoPay request failed.', response.status);
  return data;
}

async function getAccessToken(c, fetchImpl = global.fetch) {
  const cacheKey = crypto.createHash('sha256').update(`${c.authBaseUrl}|${c.clientId}|${c.clientVersion}`).digest('hex');
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const response = await fetchImpl(`${c.authBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: querystring.stringify({
      client_id: c.clientId,
      client_version: c.clientVersion,
      client_secret: c.clientSecret,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(12000),
  });
  const body = await readJson(response);
  const accessToken = body.access_token || body.accessToken;
  if (!response.ok || !accessToken) throw providerError(body, 'PhonePe AutoPay authorization failed.', response.status);
  const expiresAtSeconds = Number(body.expires_at || 0);
  const expiresInSeconds = Number(body.expires_in || 0);
  const expiresAt = expiresAtSeconds > 0
    ? expiresAtSeconds * 1000
    : Date.now() + Math.max(expiresInSeconds * 1000, 5 * 60 * 1000);
  tokenCache.set(cacheKey, { token: accessToken, expiresAt });
  return accessToken;
}

async function createMandate(input, options = {}) {
  const c = requireConfigured(options);
  const payload = buildCreateMandateRequest({
    ...input,
    redirectUrl: input.redirectUrl || c.redirectUrl || 'https://example.invalid/phonepe-autopay/return',
  });
  if (c.mode === 'mock') {
    return {
      mock: true,
      state: 'PENDING',
      orderId: `MOCK_${payload.merchantOrderId}`,
      approvalUrl: `https://example.invalid/phonepe-autopay/mock-approval/${encodeURIComponent(input.testId)}`,
      request: payload,
    };
  }
  const token = await getAccessToken(c, options.fetchImpl);
  const body = await requestJson(`${c.baseUrl}/checkout/v2/pay`, {
    method: 'POST', token, body: payload, fetchImpl: options.fetchImpl, merchantId: c.partnerMerchantId,
  });
  const approvalUrl = body.redirectUrl || body.data?.redirectUrl || null;
  if (!approvalUrl) throw providerError(body, 'PhonePe AutoPay setup did not return an approval URL.', 502);
  return {
    mock: false,
    state: String(body.state || 'PENDING').toUpperCase(),
    orderId: body.orderId || body.data?.orderId || null,
    approvalUrl,
    request: payload,
  };
}

async function getMandateStatus(merchantSubscriptionId, options = {}) {
  const c = requireConfigured(options);
  const id = compactId(merchantSubscriptionId, 'merchantSubscriptionId');
  if (c.mode === 'mock') return { mock: true, state: 'MOCK_LOCAL_ONLY', merchantSubscriptionId: id };
  const token = await getAccessToken(c, options.fetchImpl);
  const body = await requestJson(`${c.baseUrl}/checkout/v2/subscriptions/${encodeURIComponent(id)}/status`, {
    token, fetchImpl: options.fetchImpl, merchantId: c.partnerMerchantId,
  });
  return {
    mock: false,
    state: String(body.state || body.data?.state || 'UNKNOWN').toUpperCase(),
    merchantSubscriptionId: body.merchantSubscriptionId || body.data?.merchantSubscriptionId || id,
    subscriptionId: body.subscriptionId || body.data?.subscriptionId || null,
    maxAmount: Number(body.maxAmount ?? body.data?.maxAmount),
    amountType: String(body.amountType || body.data?.amountType || '').toUpperCase(),
    frequency: String(body.frequency || body.data?.frequency || '').toUpperCase(),
  };
}

async function executeDebit(input, options = {}) {
  const c = requireConfigured(options);
  assertOneRupee(input.amount, 'Debit amount');
  const operation = String(input.operation || 'notify').toLowerCase();
  if (!['notify', 'redeem'].includes(operation)) {
    throw Object.assign(new Error('Debit operation must be notify or redeem.'), { statusCode: 400 });
  }
  if (operation === 'notify') {
    const payload = buildDebitNotificationRequest(input);
    if (c.mode === 'mock') {
      return { mock: true, operation, state: 'NOTIFIED', validAfter: Date.now(), request: payload };
    }
    const token = await getAccessToken(c, options.fetchImpl);
    const body = await requestJson(`${c.baseUrl}/checkout/v2/subscriptions/notify`, {
      method: 'POST', token, body: payload, fetchImpl: options.fetchImpl, merchantId: c.partnerMerchantId,
    });
    const flow = body.paymentFlow || body.data?.paymentFlow || {};
    return {
      mock: false,
      operation,
      state: String(body.state || body.data?.state || 'PENDING').toUpperCase(),
      validAfter: flow.validAfter || null,
      transactionId: body.transactionId || body.data?.transactionId || null,
      request: payload,
    };
  }

  const merchantOrderId = compactId(input.merchantOrderId, 'merchantOrderId');
  if (c.mode === 'mock') {
    return { mock: true, operation, state: 'COMPLETED', transactionId: `MOCK_DEBIT_${merchantOrderId}` };
  }
  const token = await getAccessToken(c, options.fetchImpl);
  const body = await requestJson(`${c.baseUrl}/checkout/v2/subscriptions/redeem`, {
    method: 'POST', token, body: { merchantOrderId }, fetchImpl: options.fetchImpl, merchantId: c.partnerMerchantId,
  });
  return {
    mock: false,
    operation,
    state: String(body.state || body.data?.state || 'PENDING').toUpperCase(),
    transactionId: body.transactionId || body.data?.transactionId || null,
  };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhook(rawPayload, headers = {}, options = {}) {
  const c = requireConfigured(options);
  const raw = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(String(rawPayload || ''));
  if (!raw.length) return { valid: false, reason: 'empty_payload' };
  const header = name => headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  let valid = false;

  if (c.webhookAuthType === 'sha') {
    if (!c.webhookUsername || !c.webhookPassword) return { valid: false, reason: 'webhook_sha_credentials_missing' };
    const expected = crypto.createHash('sha256').update(`${c.webhookUsername}:${c.webhookPassword}`).digest('hex');
    const received = String(header('authorization') || '').replace(/^sha256\s+/i, '').trim();
    valid = safeEqual(expected, received);
  } else if (c.webhookAuthType === 'hmac') {
    if (!c.webhookHmacSecret) return { valid: false, reason: 'webhook_hmac_secret_missing' };
    const receivedKeyId = String(header('x-phonepe-checksum-key-id') || '');
    if (c.webhookHmacKeyId && !safeEqual(c.webhookHmacKeyId, receivedKeyId)) {
      return { valid: false, reason: 'webhook_key_id_mismatch' };
    }
    const received = String(header('x-phonepe-checksum-signature') || '').replace(/^sha256=/i, '').trim();
    const hex = crypto.createHmac('sha256', c.webhookHmacSecret).update(raw).digest('hex');
    const base64 = crypto.createHmac('sha256', c.webhookHmacSecret).update(raw).digest('base64');
    valid = safeEqual(received, hex) || safeEqual(received, base64);
  } else {
    return { valid: false, reason: 'unsupported_webhook_auth_type' };
  }
  if (!valid) return { valid: false, reason: 'signature_mismatch' };

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch { return { valid: false, reason: 'invalid_json' }; }
  const payloadMerchantId = payload?.payload?.merchantId || payload?.merchantId;
  if (payloadMerchantId && c.merchantId && !safeEqual(payloadMerchantId, c.merchantId)) {
    return { valid: false, reason: 'merchant_mismatch' };
  }
  return { valid: true, payload, rawPayload: raw.toString('utf8') };
}

module.exports = {
  TEST_AMOUNT_PAISE,
  config,
  assertOneRupee,
  requireConfigured,
  buildCreateMandateRequest,
  buildDebitNotificationRequest,
  createMandate,
  getMandateStatus,
  executeDebit,
  verifyWebhook,
};
