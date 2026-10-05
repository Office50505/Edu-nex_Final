const crypto = require('crypto');
const https = require('https');
const OtpAttempt = require('../models/OtpAttempt');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const pendingOtps = new Map();
const isProduction = process.env.NODE_ENV === 'production';
const MSG91_BASE_URL = String(process.env.MSG91_BASE_URL || 'https://control.msg91.com/api/v5').replace(/\/+$/, '');
const OTP_PROVIDER = String(process.env.OTP_PROVIDER || process.env.OTP_DELIVERY_PROVIDER || (isProduction ? 'msg91' : 'demo'))
  .trim()
  .toLowerCase();
const MSG91_REQUEST_TIMEOUT_MS = Math.max(5000, Math.min(Number(process.env.MSG91_REQUEST_TIMEOUT_MS || 25000), 60000));

function shouldUseDevelopmentOtp() {
  return !isProduction && ['development', 'dev', 'demo', 'mock', 'temp', 'temporary'].includes(OTP_PROVIDER);
}

function normalizeMobileNumber(mobileNumber) {
  return String(mobileNumber || '').replace(/\D/g, '');
}

function createOtp() {
  const configuredOtp = String(process.env.DEV_OTP || '').trim();
  if (!isProduction && /^\d{6}$/.test(configuredOtp)) {
    return configuredOtp;
  }
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function storeOtp(mobileNumber, otp) {
  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  pendingOtps.set(normalizedMobile, {
    otpHash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

function verifyStoredOtp(mobileNumber, otp) {
  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  const record = pendingOtps.get(normalizedMobile);

  if (!record) {
    return { ok: false, error: 'Please request an OTP first' };
  }

  if (record.expiresAt < Date.now()) {
    pendingOtps.delete(normalizedMobile);
    return { ok: false, error: 'OTP expired. Please request a new one' };
  }

  if (record.otpHash !== hashOtp(String(otp || ''))) {
    return { ok: false, error: 'Invalid OTP' };
  }

  pendingOtps.delete(normalizedMobile);
  return { ok: true };
}

function normalizeMobileForMsg91(mobileNumber) {
  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  const countryDigits = normalizeMobileNumber(process.env.DEFAULT_SMS_COUNTRY_CODE || '+91') || '91';

  if (!/^\d{10,15}$/.test(normalizedMobile)) {
    return '';
  }

  if (normalizedMobile.startsWith(countryDigits) && normalizedMobile.length > 10) {
    return normalizedMobile;
  }

  if (normalizedMobile.length === 10) {
    return `${countryDigits}${normalizedMobile}`;
  }

  return normalizedMobile;
}

function msg91JsonRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (response) => {
      let data = '';

      response.setEncoding('utf8');

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        const trimmed = data.trim();
        const body = trimmed
          ? tryParseJson(trimmed)
          : {};
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          body,
          rawBody: trimmed,
        });
      });
    });

    request.setTimeout(MSG91_REQUEST_TIMEOUT_MS, () => request.destroy(new Error('OTP provider timed out. Please try again.')));
    request.on('error', reject);
    if (options.body !== undefined) {
      request.write(options.body);
    }
    request.end();
  });
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function msg91ErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === 'string') return data || fallback;
  return data.message || data.error || data.msg || fallback;
}

function isMsg91Error(data) {
  if (!data || typeof data !== 'object') return false;
  const type = String(data.type || '').toLowerCase();
  const message = String(data.message || data.error || '').toLowerCase();
  return type === 'error'
    || message.includes('invalid')
    || message.includes('expired')
    || message.includes('failed');
}

async function sendMsg91Otp(mobileNumber) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authKey) {
    return { ok: false, error: 'MSG91 auth key is not configured.' };
  }
  if (!templateId) {
    return { ok: false, error: 'MSG91 template ID is not configured.' };
  }

  const mobile = normalizeMobileForMsg91(mobileNumber);
  if (!mobile) {
    return { ok: false, error: 'Enter a valid mobile number' };
  }

  const url = new URL(`${MSG91_BASE_URL}/otp`);
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('otp_length', String(OTP_LENGTH));
  url.searchParams.set('mobile', mobile);


  const response = await msg91JsonRequest(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok || isMsg91Error(response.body) || response.body?.type !== 'success') {
    return {
      ok: false,
      provider: 'msg91',
      statusCode: response.statusCode,
      error: msg91ErrorMessage(response.body, 'Failed to send OTP.'),
    };
  }

  return {
    ok: true,
    provider: 'msg91',
    requestId: response.body?.request_id || response.body?.requestId || response.body?.message,
  };
}

async function verifyMsg91Otp(mobileNumber, otp) {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    return { ok: false, error: 'MSG91 auth key is not configured.' };
  }

  const mobile = normalizeMobileForMsg91(mobileNumber);
  if (!mobile || !String(otp || '').trim()) {
    return { ok: false, error: 'Mobile and OTP required.' };
  }

  const url = new URL(`${MSG91_BASE_URL}/otp/verify`);
  url.searchParams.set('otp', String(otp).trim());
  url.searchParams.set('mobile', mobile);

  const response = await msg91JsonRequest(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      authkey: authKey,
    },
  });

  if (!response.ok || isMsg91Error(response.body) || response.body?.type !== 'success') {
    return {
      ok: false,
      provider: 'msg91',
      statusCode: response.statusCode,
      error: msg91ErrorMessage(response.body, 'Invalid OTP.'),
    };
  }

  return {
    ok: true,
    provider: 'msg91',
  };
}

async function reserveDelivery(mobileNumber, resend = false, options = {}) {
  const mobile = normalizeMobileForMsg91(mobileNumber);
  const now = new Date();
  const generation = crypto.randomUUID();
  if (resend) {
    const current = await OtpAttempt.findById(mobile);
    if (!current || current.expiresAt <= now) return { ok: false, error: 'Request a new OTP first.' };
  }
  try {
    const deliveryWindow = options.bypassCooldown
      ? { _id: mobile }
      : { _id: mobile, $or: [{ nextSendAt: { $lte: now } }, { nextSendAt: { $exists: false } }] };
    const record = await OtpAttempt.findOneAndUpdate(deliveryWindow,
      { $set: { nextSendAt: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, generation } }, { upsert: true, new: true });
    return { ok: true, record };
  } catch (error) {
    if (error.code === 11000) return { ok: false, error: 'Please wait 60 seconds before requesting another OTP.' };
    throw error;
  }
}

async function sendMobileOtp(mobileNumber, options = {}) {
  const normalizedMobile = normalizeMobileNumber(mobileNumber);

  if (!/^\d{10,15}$/.test(normalizedMobile)) {
    return { ok: false, error: 'Enter a valid mobile number' };
  }

  if (!isProduction && shouldUseDevelopmentOtp()) {
    const otp = createOtp();
    storeOtp(normalizedMobile, otp);
    return { ok: true, provider: 'development', devOtp: otp };
  }
  if (OTP_PROVIDER !== 'msg91') return { ok: false, error: 'Unsupported OTP provider configuration.' };
  const reservation = await reserveDelivery(mobileNumber, false, options);
  if (!reservation.ok) return reservation;
  return sendMsg91Otp(mobileNumber);
}

async function resendMobileOtp(mobileNumber, options = {}) {
  if (shouldUseDevelopmentOtp()) return sendMobileOtp(mobileNumber);
  if (OTP_PROVIDER !== 'msg91' || !process.env.MSG91_AUTH_KEY) return { ok: false, error: 'MSG91 is not configured.' };
  const mobile = normalizeMobileForMsg91(mobileNumber);
  if (!mobile) return { ok: false, error: 'Enter a valid mobile number' };
  const reservation = await reserveDelivery(mobileNumber, true, options);
  if (!reservation.ok) return reservation;
  const url = new URL(`${MSG91_BASE_URL}/otp/retry`);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('retrytype', 'text');
  const response = await msg91JsonRequest(url, { headers: { authkey: process.env.MSG91_AUTH_KEY, Accept: 'application/json' } });
  return response.ok && response.body?.type === 'success'
    ? { ok: true, provider: 'msg91' }
    : { ok: false, error: msg91ErrorMessage(response.body, 'Could not resend OTP.') };
}

async function verifyMobileOtp(mobileNumber, otp) {
  if (!/^\d{6}$/.test(String(otp || ''))) return { ok: false, error: 'Enter a 6-digit OTP.' };
  if (!isProduction && shouldUseDevelopmentOtp()) {
    return verifyStoredOtp(mobileNumber, otp);
  }

  if (OTP_PROVIDER !== 'msg91') return { ok: false, error: 'Unsupported OTP provider configuration.' };
  const mobile = normalizeMobileForMsg91(mobileNumber);
  const record = await OtpAttempt.findOneAndUpdate({ _id: mobile, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
  if (!record) return { ok: false, error: 'OTP expired or too many attempts. Request a new OTP.' };
  const result = await verifyMsg91Otp(mobileNumber, otp);
  if (result.ok) {
    const consumed = await OtpAttempt.deleteOne({ _id: mobile, generation: record.generation });
    if (!consumed.deletedCount) return { ok: false, error: 'OTP was already used or replaced. Please request a new OTP.' };
  }
  return result;
}

module.exports = {
  OTP_LENGTH,
  MSG91_REQUEST_TIMEOUT_MS,
  normalizeMobileNumber,
  normalizeMobileForMsg91,
  sendMobileOtp,
  resendMobileOtp,
  verifyMobileOtp,
  verifyStoredOtp,
};
