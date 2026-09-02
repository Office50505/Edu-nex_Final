const admin = require('firebase-admin');
const User = require('../models/User');

/**
 * Sends a silent (data-only) push to force logout on a device.
 * The mobile app must handle the "FORCE_LOGOUT" action key.
 * @param {string} deviceToken - FCM token of the device to log out
 * @returns {Promise<void>}
 */
async function sendSilentLogout(deviceToken) {
  try {
    await admin.messaging().send({
      token: deviceToken,
      data: {
        action: 'FORCE_LOGOUT',
        reason: 'New login detected on another device',
      },
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
        payload: { aps: { 'content-available': 1 } },
      },
    });
  } catch (err) {
    // Stale token — remove it from user record silently
    if (err.code === 'messaging/registration-token-not-registered') {
      await User.findOneAndUpdate(
        { deviceToken },
        { deviceToken: null }
      );
    }
    // Never throw — logout notification failure must not block login
  }
}

module.exports = { sendSilentLogout };
