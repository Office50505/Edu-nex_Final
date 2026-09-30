const { OAuth2Client } = require('google-auth-library');
const { GooglePlayIapError } = require('./googlePlayIapService');
const { GOOGLE_PLAY_PACKAGE_NAME } = require('./googlePlayEntitlement');

function decodeGooglePlayRtdnMessage(body) {
  const encoded = body?.message?.data;
  if (typeof encoded !== 'string' || !encoded || encoded.length > 64 * 1024) {
    throw new GooglePlayIapError('Google Play notification data is invalid.', 400, 'GOOGLE_PLAY_RTDN_INVALID');
  }
  let notification;
  try {
    notification = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (_) {
    throw new GooglePlayIapError('Google Play notification data is invalid.', 400, 'GOOGLE_PLAY_RTDN_INVALID');
  }
  if (notification?.packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    throw new GooglePlayIapError('Google Play notification package does not match.', 403, 'GOOGLE_PLAY_RTDN_PACKAGE_MISMATCH');
  }
  if (notification.testNotification) return { test: true, purchaseToken: null };
  const purchaseToken = notification.subscriptionNotification?.purchaseToken;
  if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
    throw new GooglePlayIapError('Google Play notification purchase token is invalid.', 400, 'GOOGLE_PLAY_RTDN_TOKEN_INVALID');
  }
  return { test: false, purchaseToken };
}

async function verifyGooglePlayPubSubAuthorization(
  authorization,
  {
    audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE,
    serviceAccountEmail = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL,
    client = new OAuth2Client(),
  } = {},
) {
  if (!audience || !serviceAccountEmail) {
    throw new GooglePlayIapError('Google Play notifications are not configured.', 503, 'GOOGLE_PLAY_RTDN_NOT_CONFIGURED');
  }
  const match = String(authorization || '').match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new GooglePlayIapError('Google Play notification authorization is required.', 401, 'GOOGLE_PLAY_RTDN_AUTH_REQUIRED');
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: match[1], audience });
    payload = ticket.getPayload();
  } catch (_) {
    throw new GooglePlayIapError('Google Play notification authorization is invalid.', 401, 'GOOGLE_PLAY_RTDN_AUTH_INVALID');
  }
  if (payload?.email !== serviceAccountEmail || payload?.email_verified !== true) {
    throw new GooglePlayIapError('Google Play notification sender is not allowed.', 403, 'GOOGLE_PLAY_RTDN_SENDER_MISMATCH');
  }
  return payload;
}

module.exports = {
  decodeGooglePlayRtdnMessage,
  verifyGooglePlayPubSubAuthorization,
};
