const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/seed-reviewer-account.cjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('reviewer seed command exists and requires explicit credentials', () => {
  assert.equal(packageJson.scripts['reviewer:seed'], 'node scripts/seed-reviewer-account.cjs');
  assert.match(script, /requiredEnv\('REVIEWER_MOBILE'\)/);
  assert.match(script, /requiredEnv\('REVIEWER_PASSWORD'\)/);
  assert.match(script, /password\.length < 8/);
});

test('reviewer seed creates active tester learner access without app auth bypass', () => {
  assert.match(script, /subscriptionStatus = 'active'|subscriptionStatus: 'active'/);
  assert.match(script, /isTester = true|isTester: true/);
  assert.match(script, /Subscription\.findOneAndUpdate/);
  assert.doesNotMatch(script, /DEV_UI_QA_ENABLED\s*=\s*true/);
});
