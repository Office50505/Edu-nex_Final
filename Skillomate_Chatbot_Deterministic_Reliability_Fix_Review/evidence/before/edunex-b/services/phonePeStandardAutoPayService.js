const crypto = require('node:crypto');
const querystring = require('node:querystring');

const SETUP_AMOUNT_PAISE = 100;
const MONTHLY_AMOUNT_PAISE = 49900;
const TRIAL_HOURS = 24;
const SANDBOX_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const LIVE_BASE_URL = 'https://api.phonepe.com/apis/pg';
const LIVE_AUTH_BASE_URL = 'https://api.phonepe.com/apis/identity-manager';
const tokenCache = new Map();

function isTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizedMode(value) {
  const mode = String(value || 'sandbox').trim().toLowerCase();
  if (!['sandbox', 'live'].includes(mode)) {
    throw Object.assign(new Error('PhonePe Standard AutoPay mode must be sandbox or live.'), { statusCode: 503 });
  }
  return mode;
}

function config(env = process.env) {
  const mode = normalizedMode(env.PHONEPE_AUTOPAY_MODE);
  const baseUrl = String(env.PHONEPE_AUTOPAY_BASE_URL || (mode === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL)).replace(/\/+$/, '');
  const authBaseUrl = String(env.PHONEPE_AUTOPAY_AUTH_BASE_URL
    || (mode === 'live' ? LIVE_AUTH_BASE_URL : baseUrl)).replace(/\/+$/, '');
  return {
    mode,
    enabled: isTrue(env.PHONEPE_AUTOPAY_ENABLED),
    webEnabled: isTrue(env.PHONEPE_AUTOPAY_WEB_ENABLED),
    mobileEnabled: isTrue(env.PHONEPE_AUTOPAY_MOBILE_ENABLED),
    schedulerEnabled: isTrue(env.PHONEPE_AUTOPAY_SCHEDULER_ENABLED),
    liveRecurringEnabled: isTrue(env.PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED),
    baseUrl,
    authBaseUrl,
    merchantId: String(env.PHONEPE_AUTOPAY_MERCHANT_ID || '').trim(),
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

function httpsUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw Object.assign(new Error(`${label} must be a valid HTTPS URL.`), { statusCode: 503 }); }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`${label} must be a valid HTTPS URL.`), { statusCode: 503 });
  }
  return parsed;
}

function requireConfigured(options = {}) {
  const c = options.env ? config(options.env) : (options.config || config());
  if (!c.enabled) {
    throw Object.assign(new Error('PhonePe Standard AutoPay is disabled.'), { statusCode: 503 });
  }
  if (options.mobile && !c.mobileEnabled) {
    throw Object.assign(new Error('PhonePe Standard AutoPay mobile checkout is disabled.'), { statusCode: 503 });
  }
  if (!options.mobile && !options.allowWebDisabled && !c.webEnabled) {
    throw Object.assign(new Error('PhonePe Standard AutoPay web checkout is disabled.'), { statusCode: 503 });
  }
  const missing = [];
  if (!c.merchantId) missing.push('PHONEPE_AUTOPAY_MERCHANT_ID');
  if (!c.clientId) missing.push('PHONEPE_AUTOPAY_CLIENT_ID');
  if (!c.clientSecret) missing.push('PHONEPE_AUTOPAY_CLIENT_SECRET');
  if (!c.clientVersion) missing.push('PHONEPE_AUTOPAY_CLIENT_VERSION');
  if (!c.callbackUrl) missing.push('PHONEPE_AUTOPAY_CALLBACK_URL');
  if (!options.mobile && !c.redirectUrl) missing.push('PHONEPE_AUTOPAY_REDIRECT_URL');
  if (missing.length) {
    throw Object.assign(new Error(`Missing PhonePe Standard AutoPay configuration: ${missing.join(', ')}`), { statusCode: 503 });
  }
  const base = httpsUrl(c.baseUrl, 'PhonePe API URL');
  const auth = httpsUrl(c.authBaseUrl, 'PhonePe authorization URL');
  httpsUrl(c.callbackUrl, 'PhonePe callback URL');
  if (!options.mobile) httpsUrl(c.redirectUrl, 'PhonePe redirect URL');
  if (c.mode === 'sandbox') {
    if (base.hostname !== 'api-preprod.phonepe.com' || !base.pathname.startsWith('/apis/pg-sandbox')) {
      throw Object.assign(new Error('PhonePe sandbox requests must use the official pre-production API.'), { statusCode: 503 });
    }
    if (auth.hostname !== 'api-preprod.phonepe.com' || !auth.pathname.startsWith('/apis/pg-sandbox')) {
      throw Object.assign(new Error('PhonePe sandbox authorization must use the official pre-production API.'), { statusCode: 503 });
    }
  } else {
    if (base.hostname !== 'api.phonepe.com' || !base.pathname.startsWith('/apis/pg')) {
      throw Object.assign(new Error('PhonePe live requests must use the official production API.'), { statusCode: 503 });
    }
    if (auth.hostname !== 'api.phonepe.com' || !auth.pathname.startsWith('/apis/identity-manager')) {
      throw Object.assign(new Error('PhonePe live authorization must use the official identity-manager API.'), { statusCode: 503 });
    }
  }
  if (options.recurringDebit && c.mode === 'live' && !c.liveRecurringEnabled) {
    throw Object.assign(new Error('Live PhonePe recurring debits are disabled.'), { statusCode: 503 });
  }
  return c;
}

function readiness(env = process.env) {
  try {
    const c = requireConfigured({ env });
    return {
      configured: true,
      mode: c.mode,
      webEnabled: c.webEnabled,
      mobileEnabled: c.mobileEnabled,
      schedulerEnabled: c.schedulerEnabled,
      liveRecurringEnabled: c.liveRecurringEnabled,
    };
  } catch (error) {
    return { configured: false, detail: error.message };
  }
}

function compactId(value, field) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(text)) {
    throw Object.assign(new Error(`${field} must be 1-63 characters using letters, numbers, _ or -.`), { statusCode: 400 });
  }
  return text;
}

function allowedSetupAmount(value) {
  const amount = Number(value);
  if (![SETUP_AMOUNT_PAISE, MONTHLY_AMOUNT_PAISE].includes(amount)) {
    throw Object.assign(new Error('PhonePe setup amount must be ₹1 for the trial or ₹499 for direct monthly access.'), { statusCode: 400 });
  }
  return amount;
}

function buildSetupRequest({
  merchantOrderId,
  merchantSubscriptionId,
  userId,
  paymentType = 'trial',
  redirectUrl,
  channel = 'web',
  now = Date.now(),
}) {
  const setupAmount = allowedSetupAmount(paymentType === 'trial' ? SETUP_AMOUNT_PAISE : MONTHLY_AMOUNT_PAISE);
  const isTrial = paymentType === 'trial';
  const mobile = channel === 'mobile';
  if (!mobile && channel !== 'web') {
    throw Object.assign(new Error('PhonePe checkout channel must be web or mobile.'), { statusCode: 400 });
  }
  const redirect = mobile ? null : httpsUrl(String(redirectUrl || ''), 'PhonePe redirect URL').toString();
  return {
    merchantOrderId: compactId(merchantOrderId, 'merchantOrderId'),
    amount: setupAmount,
    expireAfter: 1800,
    metaInfo: {
      udf1: String(userId || '').slice(0, 256),
      udf2: mobile ? 'SKILLOMATE_MOBILE_AUTOPAY' : 'SKILLOMATE_WEB_AUTOPAY',
      udf3: paymentType,
    },
    paymentFlow: {
      type: 'SUBSCRIPTION_CHECKOUT_SETUP',
      ...(!mobile ? { merchantUrls: { redirectUrl: redirect } } : {}),
      subscriptionDetails: {
        subscriptionType: 'RECURRING',
        merchantSubscriptionId: compactId(merchantSubscriptionId, 'merchantSubscriptionId'),
        authWorkflowType: 'TRANSACTION',
        // The trial authorizes a ₹499 ceiling with a ₹1 setup transaction.
        // It cannot be represented as a fixed ₹499 monthly setup because the
        // setup amount and the later redemption amount are different.
        amountType: isTrial ? 'VARIABLE' : 'FIXED',
        maxAmount: MONTHLY_AMOUNT_PAISE,
        // The first ₹499 redemption is due after 24 hours, so the trial uses
        // an on-demand mandate and our scheduler controls the billing dates.
        frequency: isTrial ? 'ON_DEMAND' : 'MONTHLY',
        ...(mobile ? { productType: 'UPI_MANDATE' } : {}),
        expireAt: now + (10 * 365 * 24 * 60 * 60 * 1000),
      },
    },
  };
}

function buildNotifyRequest({ merchantOrderId, merchantSubscriptionId, userId, cycle, now = Date.now() }) {
  return {
    merchantOrderId: compactId(merchantOrderId, 'merchantOrderId'),
    amount: MONTHLY_AMOUNT_PAISE,
    // PhonePe permits redemption only after 24 hours from notification. Keep
    // this order aligned with the 24-hour trial instead of advertising a
    // second, 48-hour window to the customer's UPI app.
    expireAt: now + (TRIAL_HOURS * 60 * 60 * 1000),
    metaInfo: {
      udf1: String(userId || '').slice(0, 256),
      udf2: 'SKILLOMATE_MONTHLY_RENEWAL',
      udf3: String(cycle || 1).slice(0, 50),
    },
    paymentFlow: {
      type: 'SUBSCRIPTION_CHECKOUT_REDEMPTION',
      merchantSubscriptionId: compactId(merchantSubscriptionId, 'merchantSubscriptionId'),
      redemptionRetryStrategy: 'STANDARD',
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
    signal: AbortSignal.timeout(15000),
  });
  const data = await readJson(response);
  if (!response.ok) throw providerError(data, 'PhonePe Standard AutoPay request failed.', response.status);
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
    signal: AbortSignal.timeout(15000),
  });
  const body = await readJson(response);
  const token = body.access_token || body.accessToken;
  if (!response.ok || !token) throw providerError(body, 'PhonePe Standard AutoPay authorization failed.', response.status);
  const expiresAtSeconds = Number(body.expires_at || 0);
  const expiresInSeconds = Number(body.expires_in || 0);
  const expiresAt = expiresAtSeconds > 0
    ? expiresAtSeconds * 1000
    : Date.now() + Math.max(expiresInSeconds * 1000, 5 * 60 * 1000);
  tokenCache.set(cacheKey, { token, expiresAt });
  return token;
}

async function providerRequest(path, request = {}, options = {}) {
  const c = requireConfigured({ ...options, recurringDebit: options.recurringDebit });
  const token = await getAccessToken(c, options.fetchImpl);
  return requestJson(`${c.baseUrl}${path}`, {
    ...request,
    token,
    fetchImpl: options.fetchImpl,
    merchantId: c.partnerMerchantId,
  });
}

async function createSubscription(input, options = {}) {
  const c = requireConfigured(options);
  const request = buildSetupRequest({ ...input, redirectUrl: input.redirectUrl || c.redirectUrl });
  const body = await providerRequest('/checkout/v2/pay', { method: 'POST', body: request }, options);
  const redirectUrl = body.redirectUrl || body.data?.redirectUrl || null;
  if (!redirectUrl) throw providerError(body, 'PhonePe did not return a subscription approval URL.', 502);
  return {
    state: String(body.state || body.data?.state || 'PENDING').toUpperCase(),
    orderId: body.orderId || body.data?.orderId || null,
    redirectUrl,
    request,
  };
}

async function createMobileSubscription(input, options = {}) {
  requireConfigured({ ...options, mobile: true });
  const request = buildSetupRequest({ ...input, channel: 'mobile' });
  const body = await providerRequest('/checkout/v2/sdk/order', {
    method: 'POST',
    body: request,
  }, { ...options, mobile: true });
  const data = body.data || body;
  const token = data.token || data.orderToken || null;
  if (!token) throw providerError(body, 'PhonePe did not return a mobile SDK order token.', 502);
  return {
    state: String(data.state || 'PENDING').toUpperCase(),
    orderId: data.orderId || null,
    token,
    expireAt: Number(data.expireAt || data.expiryAt) || null,
    request,
  };
}

async function getOrderStatus(merchantOrderId, options = {}) {
  const id = compactId(merchantOrderId, 'merchantOrderId');
  const body = await providerRequest(`/checkout/v2/order/${encodeURIComponent(id)}/status?details=true`, {}, { ...options, allowWebDisabled: true });
  const data = body.data || body;
  const flow = data.paymentFlow || {};
  const completedPayment = Array.isArray(data.paymentDetails)
    ? data.paymentDetails.find(item => String(item?.state || '').toUpperCase() === 'COMPLETED')
    : null;
  return {
    state: String(data.state || 'UNKNOWN').toUpperCase(),
    amount: Number(data.amount),
    orderId: data.orderId || null,
    merchantOrderId: data.merchantOrderId || id,
    merchantSubscriptionId: flow.merchantSubscriptionId || null,
    subscriptionId: flow.subscriptionId || null,
    maxAmount: Number(flow.maxAmount),
    amountType: String(flow.amountType || '').toUpperCase(),
    frequency: String(flow.frequency || '').toUpperCase(),
    validAfter: Number(flow.validAfter) || null,
    validUpto: Number(flow.validUpto) || null,
    notifiedAt: Number(flow.notifiedAt) || null,
    transactionId: completedPayment?.transactionId || data.transactionId || null,
    paymentMode: completedPayment?.paymentMode || null,
  };
}

async function getSubscriptionStatus(merchantSubscriptionId, options = {}) {
  const id = compactId(merchantSubscriptionId, 'merchantSubscriptionId');
  const body = await providerRequest(`/checkout/v2/subscriptions/${encodeURIComponent(id)}/status`, {}, { ...options, allowWebDisabled: true });
  const data = body.data || body;
  return {
    state: String(data.state || 'UNKNOWN').toUpperCase(),
    merchantSubscriptionId: data.merchantSubscriptionId || id,
    subscriptionId: data.subscriptionId || null,
    maxAmount: Number(data.maxAmount),
    amountType: String(data.amountType || '').toUpperCase(),
    frequency: String(data.frequency || '').toUpperCase(),
  };
}

async function notifyRedemption(input, options = {}) {
  const request = buildNotifyRequest(input);
  const body = await providerRequest('/checkout/v2/subscriptions/notify', { method: 'POST', body: request }, { ...options, recurringDebit: true, allowWebDisabled: true });
  const data = body.data || body;
  return {
    state: String(data.state || 'NOTIFICATION_IN_PROGRESS').toUpperCase(),
    orderId: data.orderId || null,
    expireAt: Number(data.expireAt) || null,
    request,
  };
}

async function redeem(merchantOrderId, options = {}) {
  const id = compactId(merchantOrderId, 'merchantOrderId');
  const body = await providerRequest('/checkout/v2/subscriptions/redeem', {
    method: 'POST',
    body: { merchantOrderId: id },
  }, { ...options, recurringDebit: true, allowWebDisabled: true });
  const data = body.data || body;
  return {
    state: String(data.state || 'PENDING').toUpperCase(),
    transactionId: data.transactionId || null,
  };
}

async function cancel(merchantSubscriptionId, options = {}) {
  const id = compactId(merchantSubscriptionId, 'merchantSubscriptionId');
  await providerRequest(`/checkout/v2/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, { ...options, allowWebDisabled: true });
  return { requested: true };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhook(rawPayload, headers = {}, options = {}) {
  const c = requireConfigured({ ...options, allowWebDisabled: true });
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
    const keyId = String(header('x-phonepe-checksum-key-id') || '');
    if (c.webhookHmacKeyId && !safeEqual(c.webhookHmacKeyId, keyId)) return { valid: false, reason: 'webhook_key_id_mismatch' };
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
  return { valid: true, payload };
}

module.exports = {
  SETUP_AMOUNT_PAISE,
  MONTHLY_AMOUNT_PAISE,
  TRIAL_HOURS,
  config,
  readiness,
  requireConfigured,
  buildSetupRequest,
  buildNotifyRequest,
  createSubscription,
  createMobileSubscription,
  getOrderStatus,
  getSubscriptionStatus,
  notifyRedemption,
  redeem,
  cancel,
  verifyWebhook,
};
