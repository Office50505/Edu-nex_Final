const crypto = require('crypto');
const querystring = require('querystring');

const isProduction = process.env.NODE_ENV === 'production';
function envValue(name, fallback = '') {
  const value = process.env[name];
  return value || fallback;
}

const clientId = process.env.PHONEPE_CLIENT_ID || process.env.PHONEPE_MERCHANT_ID || envValue('PHONEPE_CLIENT_ID');
const clientSecret = envValue('PHONEPE_CLIENT_SECRET');
const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '1';
const merchantId = process.env.PHONEPE_MERCHANT_ID || clientId;
const saltKey = envValue('PHONEPE_SALT_KEY');
const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
const baseUrl = process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const authBaseUrl = process.env.PHONEPE_AUTH_BASE_URL
  || (baseUrl.includes('api.phonepe.com/apis/pg') ? 'https://api.phonepe.com/apis/identity-manager' : baseUrl);
const redirectUrl = process.env.PHONEPE_REDIRECT_URL || (isProduction ? envValue('PHONEPE_REDIRECT_URL') : 'http://localhost:3000/api/payment/callback');
const webhookUsername = envValue('PHONEPE_WEBHOOK_USERNAME');
const webhookPassword = envValue('PHONEPE_WEBHOOK_PASSWORD');
const trialAmountPaise = Number(process.env.TRIAL_AMOUNT_PAISE || 100);
const subscriptionAmountPaise = Number(process.env.SUBSCRIPTION_AMOUNT_PAISE || 50000);

let cachedToken = null;
let tokenExpiresAt = 0;

function generateMerchantTransactionId(userId) {
  return `EDUNEX_${userId}_${Date.now()}`;
}

function generateMerchantSubscriptionId(userId) {
  return `EDUNEX_SUB_${userId}_${Date.now()}`.slice(0, 63);
}

function normalizePaymentInstrument(instrument) {
  const type = typeof instrument === 'string'
    ? instrument
    : instrument?.type || instrument?.paymentInstrumentType || null;

  return ['UPI', 'CARD', 'NETBANKING', 'WALLET'].includes(type) ? type : null;
}

function getPaymentInstrumentFromStatus(data) {
  const paymentDetail = data.paymentDetails?.[0] || data.paymentDetail?.[0] || data.paymentInstrument;
  return normalizePaymentInstrument(paymentDetail?.paymentMode || paymentDetail?.instrument || paymentDetail);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error('PhonePe client credentials are missing. Set PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET.');
  }

  const response = await fetch(`${authBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: querystring.stringify({
      client_id: clientId,
      client_version: clientVersion,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const body = await readJson(response);
  const accessToken = body.access_token || body.accessToken || body.token;

  if (!response.ok || !accessToken) {
    throw new Error(body.message || body.error_description || 'PhonePe auth token request failed');
  }

  cachedToken = accessToken;
  const expiresInMs = Number(body.expires_in || body.expiresIn || 300) * 1000;
  tokenExpiresAt = Date.now() + Math.max(expiresInMs - 60000, 60000);

  return cachedToken;
}

async function createTrialPaymentRequest(userId) {
  const merchantTransactionId = generateMerchantTransactionId(userId);
  const merchantSubscriptionId = generateMerchantSubscriptionId(userId);
  const accessToken = await getAccessToken();
  const subscriptionAmountPaise = Number(process.env.SUBSCRIPTION_AMOUNT_PAISE || 50000);
  const trialAmountPaise = Number(process.env.TRIAL_AMOUNT_PAISE || 100);
  const subscriptionExpiresAt = Date.now() + Number(process.env.PHONEPE_SUBSCRIPTION_EXPIRY_DAYS || 3650) * 24 * 60 * 60 * 1000;
  const payload = {
    merchantOrderId: merchantTransactionId,
    amount:          trialAmountPaise,
    expireAt:        Math.floor(Date.now() / 1000) + 900,
    metaInfo: {
      udf1: String(userId),
      udf2: 'mandate_setup',
      udf3: 'edunex',
      udf4: 'phonepe_autopay',
      udf5: merchantSubscriptionId,
    },
    paymentFlow: {
      type: 'SUBSCRIPTION_SETUP',
      merchantSubscriptionId,
      authWorkflowType: process.env.PHONEPE_AUTOPAY_AUTH_WORKFLOW || 'TRANSACTION',
      amountType: 'FIXED',
      maxAmount: subscriptionAmountPaise,
      frequency: process.env.PHONEPE_AUTOPAY_FREQUENCY || 'MONTHLY',
      expireAt: subscriptionExpiresAt,
      paymentMode: {
        type: 'UPI_INTENT',
        targetApp: process.env.PHONEPE_AUTOPAY_TARGET_APP || 'com.phonepe.app',
      },
    },
    deviceContext: {
      deviceOS: process.env.PHONEPE_AUTOPAY_DEVICE_OS || 'ANDROID',
    },
  };

  const response = await fetch(`${baseUrl}/subscriptions/v2/setup`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  const redirect = body.intentUrl || body.data?.intentUrl || body.redirectUrl || body.data?.redirectUrl;

  if (!response.ok || !redirect) {
    throw new Error(body.message || body.error || 'PhonePe mandate setup request failed');
  }

  return {
    redirectUrl: redirect,
    merchantTransactionId,
    merchantSubscriptionId,
    raw: body,
  };
}

async function verifySubscriptionOrderStatus(merchantTransactionId) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${baseUrl}/subscriptions/v2/order/${merchantTransactionId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
  });
  const body = await readJson(response);
  const data = body.data || body;
  const paymentFlow = data.paymentFlow || data.payment_flow || {};
  const state = data.state || data.status || body.state || body.status;
  const success = response.ok && ['COMPLETED', 'SUCCESS', 'ACTIVE'].includes(String(state || '').toUpperCase());

  return {
    success,
    state: String(state || '').toUpperCase(),
    transactionId: data.transactionId || data.orderId || data.merchantOrderId || merchantTransactionId,
    paymentInstrument: getPaymentInstrumentFromStatus(data),
    mandateId: data.subscriptionId || paymentFlow.subscriptionId || data.mandateId || null,
    merchantSubscriptionId: data.merchantSubscriptionId || paymentFlow.merchantSubscriptionId || null,
    raw: body,
  };
}

async function createMonthlyPaymentRequest(userId) {
  const merchantTransactionId = generateMerchantTransactionId(userId);
  const accessToken = await getAccessToken();
  const payload = {
    merchantOrderId: merchantTransactionId,
    amount: subscriptionAmountPaise,
    expireAfter: 1200,
    metaInfo: {
      udf1: String(userId),
      udf2: 'subscription_charge',
      udf3: 'monthly',
      udf4: 'edunex',
      udf5: 'phonepe_test',
    },
    paymentFlow: {
      type: 'PG_CHECKOUT',
      message: 'Subscribe Monthly - ₹500/month',
      subscription: {
        type: 'RECURRING',
        startAmount: subscriptionAmountPaise,
        amount: subscriptionAmountPaise,
        frequency: 'MONTHLY',
        billingCycle: 'monthly',
      },
      merchantUrls: {
        redirectUrl: `${redirectUrl}?merchantTransactionId=${merchantTransactionId}`,
      },
    },
  };

  const response = await fetch(`${baseUrl}/checkout/v2/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  const redirect = body.redirectUrl || body.data?.redirectUrl || body.instrumentResponse?.redirectInfo?.url;

  if (!response.ok || !redirect) {
    throw new Error(body.message || body.error || 'PhonePe monthly payment URL request failed');
  }

  return {
    redirectUrl: redirect,
    merchantTransactionId,
    raw: body,
  };
}

async function verifyPaymentStatus(merchantTransactionId) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${baseUrl}/checkout/v2/order/${merchantTransactionId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
  });
  const body = await readJson(response);
  const data = body.data || body;
  const state = data.state || data.status || body.state || body.status;
  const success = response.ok && ['COMPLETED', 'SUCCESS', 'PAID'].includes(String(state || '').toUpperCase());

  return {
    success,
    state: String(state || '').toUpperCase(),
    transactionId: data.transactionId || data.orderId || data.merchantOrderId || merchantTransactionId,
    paymentInstrument: getPaymentInstrumentFromStatus(data),
    mandateId: data.mandateId || data.subscriptionId || null,
    raw: body,
  };
}

function timingSafeMatch(expected, received) {
  if (!expected || !received || expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function verifyWebhookShaAuth(authorization) {
  if (!authorization || !webhookUsername || !webhookPassword) {
    return false;
  }

  const received = String(authorization).replace(/^sha256\s+/i, '').trim();
  const expected = crypto
    .createHash('sha256')
    .update(`${webhookUsername}:${webhookPassword}`)
    .digest('hex');

  return timingSafeMatch(expected, received);
}

function verifyLegacyXVerify(payload, xVerify) {
  if (!payload || !xVerify || !saltKey) {
    return false;
  }

  const rawPayload = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
  const expectedHash = crypto.createHash('sha256').update(`${rawPayload}${saltKey}`).digest('hex');
  const expected = `${expectedHash}###${saltIndex}`;

  return timingSafeMatch(expected, String(xVerify));
}

function verifyWebhookSignature(payload, headersOrXVerify = {}) {
  if (typeof headersOrXVerify === 'string') {
    return verifyLegacyXVerify(payload, headersOrXVerify);
  }

  const headers = headersOrXVerify || {};
  const authorization = headers.authorization || headers.Authorization;
  const xVerify = headers['x-verify'] || headers['X-VERIFY'];

  return verifyWebhookShaAuth(authorization) || verifyLegacyXVerify(payload, xVerify);
}

async function cancelMandate() {
  return { success: false, raw: { message: 'Mandate cancellation is not implemented for Standard Checkout test flow' } };
}

function config() {
  return {
    clientId,
    clientSecret,
    clientVersion,
    merchantId,
    saltKey,
    saltIndex,
    baseUrl,
    authBaseUrl,
    redirectUrl,
    webhookUsername,
    webhookPassword,
    trialAmountPaise,
    subscriptionAmountPaise,
  };
}

function readiness() {
  const c = config();
  const missing = [];
  if (!c.clientId) missing.push('PHONEPE_CLIENT_ID');
  if (!c.clientSecret) missing.push('PHONEPE_CLIENT_SECRET');
  if (!c.merchantId) missing.push('PHONEPE_MERCHANT_ID');
  if (!c.redirectUrl) missing.push('PHONEPE_REDIRECT_URL');
  return missing.length
    ? { configured: false, detail: `Missing: ${missing.join(', ')}` }
    : { configured: true, detail: 'PhonePe credentials are configured. No payment request was created.' };
}

module.exports = {
  generateMerchantTransactionId,
  generateMerchantSubscriptionId,
  createTrialPaymentRequest,
  createMonthlyPaymentRequest,
  verifyPaymentStatus,
  verifySubscriptionOrderStatus,
  verifyWebhookSignature,
  cancelMandate,
  config,
  readiness,
  merchantId,
};
