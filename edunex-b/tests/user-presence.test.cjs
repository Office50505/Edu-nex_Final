const test = require('node:test');
const assert = require('node:assert/strict');
const { ONLINE_WINDOW_MS, presenceFromPing } = require('../services/userPresence');

test('presence is online only inside the heartbeat window', () => {
  const now = Date.now();
  assert.equal(presenceFromPing(new Date(now - ONLINE_WINDOW_MS + 1), now).isOnline, true);
  assert.equal(presenceFromPing(new Date(now - ONLINE_WINDOW_MS - 1), now).isOnline, false);
  assert.equal(presenceFromPing(null, now).isOnline, false);
});

test('presence window tolerates background-tab timer throttling', () => {
  const now = Date.now();
  assert.equal(ONLINE_WINDOW_MS, 180000);
  assert.equal(presenceFromPing(new Date(now - 2 * 60 * 1000), now).isOnline, true);
});
