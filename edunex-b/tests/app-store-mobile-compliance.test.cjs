const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.join(__dirname, '..', '..', 'appcopyai');
const { canOpenExternalUrl } = require(path.join(mobileRoot, 'services/externalLinks.js'));
const { createSecureSessionStorage, SECURE_SESSION_KEY } = require(path.join(mobileRoot, 'services/secureSessionStorage.js'));
const { consentDecision, isAiConsentCurrent } = require(path.join(mobileRoot, 'services/aiConsent.js'));
const { hasActivePremiumEntitlement, normalizeEntitlement } = require(path.join(mobileRoot, 'services/subscriptions.js'));

const appSource = fs.readFileSync(path.join(mobileRoot, 'App.js'), 'utf8');
const appleHookSource = fs.readFileSync(path.join(mobileRoot, 'services/useAppleSubscriptions.js'), 'utf8');
const privacyManifest = fs.readFileSync(path.join(mobileRoot, 'ios/ProtectedVideo/PrivacyInfo.xcprivacy'), 'utf8');

test('iOS external-link policy allows legal/support/resources and blocks purchase steering', () => {
  assert.equal(canOpenExternalUrl('https://skillomate.in/privacy', 'ios').allowed, true);
  assert.deepEqual(canOpenExternalUrl('https://apps.apple.com/account/subscriptions', 'ios'), {
    allowed: true,
    category: 'account-management',
    url: 'https://apps.apple.com/account/subscriptions',
  });
  assert.equal(canOpenExternalUrl('https://apps.apple.com/account/subscriptions?redirect=checkout', 'ios').allowed, false);
  assert.deepEqual(canOpenExternalUrl('mailto:support@skillomate.in', 'ios'), {
    allowed: true,
    category: 'support',
    url: 'mailto:support@skillomate.in',
  });
  assert.equal(canOpenExternalUrl('mailto:billing@skillomate.in', 'ios').allowed, false);
  assert.equal(canOpenExternalUrl('https://support.skillomate.in/help', 'ios').allowed, false);
  assert.equal(canOpenExternalUrl('https://www.youtube.com/watch?v=abc', 'ios').allowed, true);
  for (const url of [
    'https://skillomate.in/payment',
    'https://skillomate.in/pricing?plan=monthly',
    'https://skillomate.in/profile?next=/checkout',
    'http://skillomate.in/privacy',
    'https://skillomate.in.evil.example/privacy',
  ]) assert.equal(canOpenExternalUrl(url, 'ios').allowed, false, url);
  assert.equal(canOpenExternalUrl('https://skillomate.in/payment', 'android').allowed, true);
});

test('native session migration verifies Keychain write and removes plaintext AsyncStorage copy', async () => {
  const secureValues = new Map();
  const legacyValues = new Map([['user', '{"accessToken":"secret"}']]);
  const secureStore = {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
    getItemAsync: async key => secureValues.get(key) || null,
    setItemAsync: async (key, value, options) => {
      assert.equal(options.keychainAccessible, 'device-only');
      secureValues.set(key, value);
    },
    deleteItemAsync: async key => secureValues.delete(key),
  };
  const legacyStorage = {
    getItem: async key => legacyValues.get(key) || null,
    setItem: async (key, value) => legacyValues.set(key, value),
    removeItem: async key => legacyValues.delete(key),
  };
  const storage = createSecureSessionStorage({ secureStore, legacyStorage });
  assert.equal(await storage.getItem('user'), '{"accessToken":"secret"}');
  assert.equal(secureValues.get(SECURE_SESSION_KEY), '{"accessToken":"secret"}');
  assert.equal(legacyValues.has('user'), false);
  await storage.setItem('user', '{"accessToken":"rotated"}');
  assert.equal(secureValues.get(SECURE_SESSION_KEY), '{"accessToken":"rotated"}');
  assert.equal(legacyValues.has('user'), false);
  await storage.removeItem('user');
  assert.equal(secureValues.has(SECURE_SESSION_KEY), false);
});

test('AI consent expires when the policy version changes and records explicit decline', () => {
  const allowed = consentDecision(true, 'providers-v1', new Date('2026-09-25T00:00:00Z'));
  assert.equal(isAiConsentCurrent(allowed), true);
  assert.equal(isAiConsentCurrent({ ...allowed, policyVersion: 'older' }), false);
  assert.equal(isAiConsentCurrent({ ...allowed, providerVersion: '' }), false);
  assert.equal(consentDecision(false).granted, false);
});

test('premium access is fail-closed for unknown, retry, revoked and expired states', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  for (const state of ['UNKNOWN', 'NONE', 'BILLING_RETRY', 'REVOKED', 'REFUNDED', 'EXPIRED']) {
    assert.equal(hasActivePremiumEntitlement({ entitlementState: state, entitlementActive: true, expiresAt: future }), false, state);
  }
  assert.equal(hasActivePremiumEntitlement({ entitlementState: 'ACTIVE', entitlementActive: true, expiresAt: future }), true);
  assert.equal(hasActivePremiumEntitlement({ entitlementState: 'ACTIVE_CANCELS_AT_PERIOD_END', entitlementActive: true, expiresAt: future }), true);
  assert.equal(hasActivePremiumEntitlement({ entitlementState: 'GRACE_PERIOD', entitlementActive: true, expiresAt: past, gracePeriodExpiresAt: future }), true);
  assert.equal(hasActivePremiumEntitlement({ entitlementState: 'GRACE_PERIOD', entitlementActive: true, expiresAt: future }), false);
  assert.equal(normalizeEntitlement({ entitlementState: 'ACTIVE', entitlementActive: true, expiresAt: past }).active, false);
});

test('production mobile source contains no enabled QA fixtures or iOS web-purchase steering', () => {
  assert.doesNotMatch(appSource, /from ["']\.\/dev\/uiQaFixtures["']/);
  assert.match(appSource, /const DEV_UI_QA_ENABLED = false;/);
  assert.doesNotMatch(appSource, /Visit our website to purchase|Subscribe on (?:the )?website|Buy on (?:the )?web|Upgrade on (?:the )?website/i);
  assert.match(appSource, /monthly subscription renews automatically until cancelled in Apple ID settings/i);
  assert.match(appSource, />Terms of Use</);
  assert.match(appSource, />Privacy Policy</);
});

test('StoreKit client verifies before finishing, handles cancellation, and restores only active access', () => {
  const verification = appleHookSource.indexOf('session.requestJson("/api/apple-iap/verify"');
  const finish = appleHookSource.indexOf('finishTransaction({ purchase, isConsumable: false })');
  assert.ok(verification >= 0 && finish > verification);
  assert.match(appleHookSource, /ErrorCode\.UserCancelled/);
  assert.match(appleHookSource, /ErrorCode\.Pending/);
  assert.match(appleHookSource, /ErrorCode\.DeferredPayment/);
  assert.match(appleHookSource, /No charge was made/);
  assert.match(appleHookSource, /getAvailablePurchases/);
  assert.match(appleHookSource, /entitlementActive\) restored = true/);
  assert.match(appleHookSource, /transaction intentionally remains unfinished/);
  assert.match(appleHookSource, /fetchProducts\(\{ skus: \[APPLE_SUBSCRIPTION_PRODUCT_IDS\.monthly\], type: "subs" \}\)/);
  assert.match(appleHookSource, /productFetchAttempted\.current && !retry/);
  assert.match(appSource, />Retry App Store</);
});

test('iOS privacy manifest declares uploaded photos without claiming device identifiers or tracking', () => {
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypePhotosorVideos/);
  assert.doesNotMatch(privacyManifest, /NSPrivacyCollectedDataTypeDeviceID/);
  assert.match(privacyManifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
});

test('age policy rejects 12, accepts 13, and signup UIs have no fabricated default age', async () => {
  const User = require('../models/User');
  await assert.rejects(new User({ age: 12 }).validate(), /age/);
  await new User({ age: 13 }).validate();
  assert.match(appSource, /const \[signupAge, setSignupAge\] = useState\(""\)/);
  const signupSource = fs.readFileSync(path.join(__dirname, '../../edunex-f/src/pages/SignupPage.jsx'), 'utf8');
  assert.match(signupSource, /const \[age, setAge\] = useState\(null\)/);
  assert.doesNotMatch(signupSource, /useState\(18\)/);
});
