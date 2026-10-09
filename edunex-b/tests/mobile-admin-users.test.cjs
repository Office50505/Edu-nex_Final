const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

test('mobile sessions retain the app and device fields used by admin pages', () => {
  const Session = require(path.join(backendRoot, 'models/Session'));
  for (const field of ['platform', 'deviceName', 'deviceModel', 'osVersion', 'appVersion', 'appBuild', 'lastPingAt']) {
    assert.ok(Session.schema.path(field), `Session.${field} must exist`);
  }
  assert.deepEqual(Session.schema.path('platform').enumValues, ['ios', 'android', 'web', 'windows', 'macos']);
});

test('admin mobile audiences are filtered from session history without exposing push tokens', () => {
  const serverSource = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
  assert.match(serverSource, /Session\.distinct\('user', \{ platform: requestedPlatform \}\)/);
  assert.match(serverSource, /mobileSession: mobileSessionByUser\[String\(user\._id\)\]/);
  assert.match(serverSource, /firstSeenAt:[\s\S]*lastSeenAt:[\s\S]*sessionCount:[\s\S]*activeSessionCount:[\s\S]*pushEnabled:/);
  const mobileProjection = serverSource.slice(serverSource.indexOf('requestedPlatform ? Session.aggregate'), serverSource.indexOf(']) : Promise.resolve([])'));
  assert.doesNotMatch(mobileProjection, /deviceToken:\s*1/);
});

test('both mobile clients report metadata at login and while the app is active', () => {
  for (const appDirectory of ['appcopyai', 'razorpay-app']) {
    const appSource = fs.readFileSync(path.join(repoRoot, appDirectory, 'App.js'), 'utf8');
    const metadataSource = fs.readFileSync(path.join(repoRoot, appDirectory, 'services/mobileSessionMetadata.js'), 'utf8');
    assert.match(appSource, /JSON\.stringify\(\{ \.\.\.body, \.\.\.mobileSessionMetadata\(\) \}\)/);
    assert.match(appSource, /requestJson\("\/api\/sessions\/ping"[\s\S]*setInterval\(recordMobileSession, 60000\)/);
    for (const field of ['platform', 'deviceName', 'deviceModel', 'osVersion', 'appVersion', 'appBuild']) {
      assert.match(metadataSource, new RegExp(`${field}[,:]`));
    }
  }
});
