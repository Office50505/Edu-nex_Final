const crypto = require('crypto');
const fs = require('fs');
const User = require('../models/User');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function parseServiceAccountJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  } catch (_) {
    return null;
  }
}

function getServiceAccountConfig() {
  const inlineConfig = parseServiceAccountJson(
    process.env.FCM_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
  if (inlineConfig?.projectId && inlineConfig?.clientEmail && inlineConfig?.privateKey) {
    return inlineConfig;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const fileConfig = parseServiceAccountJson(
        fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
      );
      if (fileConfig?.projectId && fileConfig?.clientEmail && fileConfig?.privateKey) {
        return fileConfig;
      }
    } catch (_) {
      return null;
    }
  }

  const directConfig = {
    projectId: process.env.FCM_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FCM_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY),
  };

  if (directConfig.projectId && directConfig.clientEmail && directConfig.privateKey) {
    return directConfig;
  }

  return null;
}

function createServiceAccountAssertion({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey);

  return `${signingInput}.${base64Url(signature)}`;
}

async function getAccessToken(config) {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60000 > now) {
    return cachedAccessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountAssertion(config),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Could not create FCM access token');
  }

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = now + Number(payload.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

function isStaleDeviceTokenResponse(response, payload) {
  const status = payload?.error?.status;
  const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
  const errorCodes = details
    .map((detail) => detail.errorCode || detail.error_code)
    .filter(Boolean);

  return response.status === 404
    || status === 'NOT_FOUND'
    || errorCodes.includes('UNREGISTERED')
    || errorCodes.includes('SENDER_ID_MISMATCH');
}

async function sendFcmMessage(deviceToken) {
  const config = getServiceAccountConfig();
  if (!config) {
    return { ok: false, skipped: true, reason: 'FCM service account is not configured' };
  }

  const accessToken = await getAccessToken(config);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          data: {
            action: 'FORCE_LOGOUT',
            reason: 'New login detected on another device',
          },
          android: { priority: 'HIGH' },
          apns: {
            headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
            payload: { aps: { 'content-available': 1 } },
          },
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (response.ok) {
    return { ok: true, payload };
  }

  return {
    ok: false,
    status: response.status,
    staleDeviceToken: isStaleDeviceTokenResponse(response, payload),
    payload,
  };
}

/**
 * Sends a silent (data-only) push to force logout on a device.
 * The mobile app must handle the "FORCE_LOGOUT" action key.
 * @param {string} deviceToken - FCM token of the device to log out
 * @returns {Promise<void>}
 */
async function sendSilentLogout(deviceToken) {
  if (!deviceToken) return;

  try {
    const result = await sendFcmMessage(deviceToken);
    if (result?.staleDeviceToken) {
      await User.findOneAndUpdate({ deviceToken }, { deviceToken: null });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Silent logout push skipped:', err.message);
    }
    // Never throw. Logout notification failure must not block login.
  }
}

module.exports = { sendSilentLogout };
