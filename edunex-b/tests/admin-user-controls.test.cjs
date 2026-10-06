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

test('admin can create a learner id with bounded validated credentials', () => {
  assert.match(serverSource, /app\.post\('\/api\/admin\/users', protectAdmin/);
  assert.match(serverSource, /await bcrypt\.hash\(password, 12\)/);
  assert.match(serverSource, /A learner already exists with this mobile number or email/);
  assert.match(serverSource, /Temporary password must contain 8 to 72 characters/);
  assert.doesNotMatch(serverSource, /passwordHash: password/);
});

test('admin subscription route is protected and updates records and audit in a transaction', () => {
  assert.ok(serverSource.includes("app.patch('/api/admin/users/:id/subscription', protectAdmin"));
  assert.ok(serverSource.includes('mongoose.connection.transaction(async (session)'));
  assert.ok(serverSource.includes('subscriptionChange(req.body, previous || {}, billing)'));
  assert.ok(serverSource.includes('await user.save({ session })'));
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
  assert.doesNotMatch(serverSource, /ipwho\.is/);
  assert.doesNotMatch(serverSource, /\/api\/admin\/users\/:id\/ip-location/);
});

test('admin user management can be scoped to tester accounts', () => {
  assert.match(serverSource, /const audience = String\(req\.query\?\.audience \|\| 'learners'\)/);
  assert.match(serverSource, /const userFilter = audience === 'testers' \? \{ isTester: true \} : \{\}/);
  assert.match(serverSource, /User\.find\(userFilter\)/);
  assert.match(serverSource, /isActive isTester testerSince testerAssignedBy testerNotes/);
});

test('admin can mark learners as testers without changing learner identity', () => {
  assert.match(userSource, /isTester:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/);
  assert.match(userSource, /testerSince:\s*\{\s*type:\s*Date,\s*default:\s*null\s*\}/);
  assert.match(userSource, /testerAssignedBy:\s*\{\s*type:\s*String/);
  assert.match(serverSource, /app\.patch\('\/api\/admin\/users\/:id\/tester', protectAdmin/);
  assert.match(serverSource, /action:\s*enabling\s*\?\s*'tester_enabled'\s*:\s*'tester_disabled'/);
  assert.match(serverSource, /isTester testerSince testerAssignedBy testerNotes/);
});

test('admin-created test accounts are persisted as testers', () => {
  assert.match(serverSource, /const isTester = req\.body\?\.isTester === true/);
  assert.match(serverSource, /testerSince: isTester \? new Date\(\) : null/);
  assert.match(serverSource, /testerAssignedBy: isTester \? String\(adminSubject\) : null/);
  assert.match(serverSource, /testerNotes: isTester \? testerNotes : null/);
});

test('tester analytics is separate from main admin analytics', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/tester-analytics', protectAdmin/);
  assert.match(serverSource, /User\.find\(\{\s*isTester:\s*true\s*\}\)/);
  assert.match(serverSource, /testerRows = await User\.find/);
  assert.match(actionSource, /tester_enabled/);
  assert.match(actionSource, /tester_disabled/);
});

test('admin purchase history combines payment orders and course ownership changes', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/users\/:id\/purchase-history', protectAdmin/);
  assert.match(serverSource, /Order\.find\(\{ user: req\.params\.id \}\)/);
  assert.match(serverSource, /course_granted', 'course_revoked/);
  assert.match(serverSource, /res\.json\(\{ user, orders, courseChanges \}\)/);
});

test('admin course summary derives learner metrics from progress records', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/courses', protectAdmin/);
  assert.match(serverSource, /Progress\.aggregate\(\[/);
  assert.match(serverSource, /CourseProgress\.aggregate\(\[/);
  assert.match(serverSource, /Math\.max\([\s\S]*Number\(course\.totalStarted \|\| 0\)[\s\S]*Number\(lessonProgress\.learnerCount \|\| 0\)[\s\S]*Number\(courseProgress\.learnerCount \|\| 0\)/);
  assert.match(serverSource, /videos\.videoUrl videos\.embedUrl videos\.bunnyVideoId/);
});
