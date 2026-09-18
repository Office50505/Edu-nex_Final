const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const serverSource = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const userSource = fs.readFileSync(require.resolve('../models/User.js'), 'utf8');
const actionSource = fs.readFileSync(require.resolve('../models/AdminUserAction.js'), 'utf8');

test('admin user access route is protected and revokes sessions when banning', () => {
  assert.match(serverSource, /app\.patch\('\/api\/admin\/users\/:id\/access', protectAdmin/);
  assert.match(serverSource, /if \(action === 'ban'\) \{[\s\S]*user\.activeSessionId = null;[\s\S]*user\.activeSessions = \[\];/);
  assert.match(serverSource, /if \(action === 'ban' && !reason\)/);
});

test('admin subscription route validates its action and duration boundary', () => {
  assert.match(serverSource, /app\.patch\('\/api\/admin\/users\/:id\/subscription', protectAdmin/);
  assert.match(serverSource, /!\['grant', 'revoke'\]\.includes\(action\)/);
  assert.match(serverSource, /Math\.min\(3650, Math\.max\(1,/);
  assert.match(serverSource, /status: 'paused', currentPeriodEnd: now/);
});

test('admin actions are audited and user ban metadata is bounded', () => {
  assert.match(actionSource, /subscription_granted/);
  assert.match(actionSource, /subscription_revoked/);
  assert.match(actionSource, /maxlength: 500/);
  assert.match(userSource, /bannedAt/);
  assert.match(userSource, /banReason: \{ type: String, trim: true, maxlength: 500/);
});

test('admin deletion uses a recoverable trash workflow', () => {
  assert.match(userSource, /deletedAt: \{ type: Date, default: null \}/);
  assert.match(serverSource, /app\.delete\('\/api\/admin\/users\/:id', protectAdmin/);
  assert.match(serverSource, /action: 'user_trashed'/);
  assert.match(serverSource, /app\.patch\('\/api\/admin\/users\/:id\/restore', protectAdmin/);
  assert.match(serverSource, /action: 'user_restored'/);
  assert.match(serverSource, /app\.delete\('\/api\/admin\/users\/:id\/permanent', protectAdmin/);
  assert.match(serverSource, /Move the user to trash before permanent deletion/);
  assert.match(serverSource, /skipBillingCancellation: force/);
});

test('admin learner management exposes only the latest recorded session IP', () => {
  assert.match(serverSource, /Session\.aggregate\(\[/);
  assert.match(serverSource, /ipAddress: \{ \$first: '\$ipAddress' \}/);
  assert.match(serverSource, /networkSummary: latestSessionByUser/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/users\/:id\/ip-location', protectAdmin/);
  assert.match(serverSource, /isPrivateIpAddress\(ipAddress\)/);
});
