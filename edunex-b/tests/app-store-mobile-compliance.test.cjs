const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.join(__dirname, '..', '..', 'appcopyai');
const { canOpenExternalUrl } = require(path.join(mobileRoot, 'services/externalLinks.js'));
const { createSecureSessionStorage, SECURE_SESSION_KEY } = require(path.join(mobileRoot, 'services/secureSessionStorage.js'));
const { consentDecision, isAiConsentCurrent } = require(path.join(mobileRoot, 'services/aiConsent.js'));
const {
  GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS,
  hasActivePremiumEntitlement,
  normalizeGooglePlaySubscriptionOffers,
  normalizeEntitlement,
} = require(path.join(mobileRoot, 'services/subscriptions.js'));

const appSource = fs.readFileSync(path.join(mobileRoot, 'App.js'), 'utf8');
const upgradeModalSource = appSource.slice(
  appSource.indexOf('function UpgradeModal'),
  appSource.indexOf('function notificationIconForType'),
);
const appleHookSource = fs.readFileSync(path.join(mobileRoot, 'services/useAppleSubscriptions.js'), 'utf8');
const deferredIapSource = fs.readFileSync(path.join(mobileRoot, 'services/useDeferredIapConnection.js'), 'utf8');
const googlePlayHookSource = fs.readFileSync(path.join(mobileRoot, 'services/useGooglePlaySubscriptions.js'), 'utf8');
const privacyManifest = fs.readFileSync(path.join(mobileRoot, 'ios/ProtectedVideo/PrivacyInfo.xcprivacy'), 'utf8');
const infoPlist = fs.readFileSync(path.join(mobileRoot, 'ios/ProtectedVideo/Info.plist'), 'utf8');
const localStoreKit = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'ios/Skillomate-IN.storekit'), 'utf8'));

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
  assert.deepEqual(canOpenExternalUrl('https://play.google.com/store/account/subscriptions?sku=skillomate_premium_monthly&package=com.skillomate.app', 'android'), {
    allowed: true,
    category: 'account-management',
    url: 'https://play.google.com/store/account/subscriptions?sku=skillomate_premium_monthly&package=com.skillomate.app',
  });
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

test('mobile AI surfaces require explicit, withdrawable consent before sending a prompt', () => {
  assert.match(appSource, /AI_CONSENT_POLICY_VERSION, isAiConsentCurrent/);
  assert.match(appSource, /session\.requestJson\("\/api\/ai\/consent"\)/);
  assert.match(appSource, /if \(!options\.consentOverride && !isAiConsentCurrent\(aiConsent\)\)/);
  assert.match(appSource, /accessibilityLabel="Allow external AI processing"/);
  assert.match(appSource, /accessibilityLabel="Withdraw AI data consent"/);
  assert.match(appSource, /AI privacy unavailable[\s\S]+No AI request was sent/);
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

test('premium gate popup starts the platform store subscription and exposes required purchase controls', () => {
  assert.match(upgradeModalSource, /appleSubscriptionPriceCopy\(appleSubscription\)/);
  assert.match(upgradeModalSource, /ELIGIBLE NEW-SUBSCRIBER OFFER/);
  assert.match(upgradeModalSource, /Welcome to Skillomate/);
  assert.match(upgradeModalSource, /const storeName = isIOS \? "App Store" : "Google Play"/);
  assert.match(upgradeModalSource, /`Start Offer with \$\{storeName\}`/);
  assert.match(upgradeModalSource, /Then \{priceCopy\.recurring\} until cancelled/);
  assert.match(upgradeModalSource, /onPress=\{appleSubscription\?\.purchase\}/);
  assert.match(upgradeModalSource, /`Subscribe with \$\{storeName\}`/);
  assert.match(upgradeModalSource, /onPress=\{appleSubscription\?\.restore\}/);
  assert.match(upgradeModalSource, />Restore Purchases</);
  assert.match(upgradeModalSource, /renews automatically unless cancelled at least 24 hours/);
  assert.match(upgradeModalSource, /accessibilityLabel="Read subscription Terms of Use"/);
  assert.match(upgradeModalSource, /accessibilityLabel="Read subscription Privacy Policy"/);
});

test('Google Play offer normalization selects the dedicated ₹1 one-day phase and ₹499 monthly renewal', () => {
  const result = normalizeGooglePlaySubscriptionOffers({
    displayPrice: '₹499.00',
    subscriptionOfferDetailsAndroid: [
      {
        basePlanId: 'monthly',
        offerToken: 'base-token',
        pricingPhases: { pricingPhaseList: [{
          billingCycleCount: 0,
          billingPeriod: 'P1M',
          formattedPrice: '₹499.00',
          priceAmountMicros: '499000000',
        }] },
      },
      {
        basePlanId: 'monthly',
        offerId: 'old-first-month-offer',
        offerToken: 'old-intro-token',
        pricingPhases: { pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P1M',
            formattedPrice: '₹1.00',
            priceAmountMicros: '1000000',
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '₹499.00',
            priceAmountMicros: '499000000',
          },
        ] },
      },
      {
        basePlanId: 'monthly',
        offerId: GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory24Hour,
        offerToken: '24-hour-intro-token',
        pricingPhases: { pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P1D',
            formattedPrice: '₹1.00',
            priceAmountMicros: '1000000',
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '₹499.00',
            priceAmountMicros: '499000000',
          },
        ] },
      },
    ],
  });
  assert.equal(result.introductoryOffer.displayText, '₹1.00 for the first day');
  assert.equal(result.introductoryOffer.periodUnit, 'day');
  assert.equal(result.introductoryOffer.periodValue, 1);
  assert.equal(result.recurring.localizedPrice, '₹499.00');
  assert.deepEqual(result.purchaseOffer, {
    basePlanId: 'monthly',
    offerId: GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory24Hour,
    offerToken: '24-hour-intro-token',
  });
});

test('Google Play client uses the eligible offer token and verifies before acknowledging', () => {
  const verification = googlePlayHookSource.indexOf('session.requestJson("/api/google-play-iap/verify"');
  const finish = googlePlayHookSource.indexOf('finishTransaction({ purchase, isConsumable: false })');
  assert.ok(verification >= 0 && finish > verification);
  assert.match(googlePlayHookSource, /subscriptionOffers: \[\{ sku: productId, offerToken \}\]/);
  assert.match(googlePlayHookSource, /obfuscatedAccountId: configuration\.obfuscatedAccountId/);
  assert.match(googlePlayHookSource, /getAvailablePurchases/);
  assert.match(googlePlayHookSource, /ErrorCode\.UserCancelled/);
  assert.match(googlePlayHookSource, /ErrorCode\.Pending/);
  assert.match(googlePlayHookSource, /entitlementActive\) restored = true/);
  assert.match(googlePlayHookSource, /const delays = \[1200, 3500, 8000\]/);
  assert.match(googlePlayHookSource, /expiresAt - Date\.now\(\) \+ 5000/);
  assert.match(googlePlayHookSource, /normalizeGooglePlaySubscriptionOffers\(product, configuredIntroductoryOfferId\)/);
  assert.match(googlePlayHookSource, /iapRef\.current\.reconnect\(\)/);
  assert.match(googlePlayHookSource, /Open Play Store, sign in, then return and retry/);
  assert.doesNotMatch(googlePlayHookSource, /Razorpay|skillomate\.in\/(?:payment|pricing|checkout)/i);
  assert.match(upgradeModalSource, /logo-google-playstore/);
});

test('iOS exposes only the standard recurring App Store subscription', () => {
  assert.doesNotMatch(appleHookSource, /introductoryOffer|isEligibleForIntroOfferIOS|normalizeAppleIntroductoryOffer|introductoryPriceIOS/);
  assert.match(appSource, /const eligibleOffer = Platform\.OS === "android" && appleSubscription\?\.introductoryOfferEligible/);
  assert.doesNotMatch(upgradeModalSource, /₹\s*1|₹\s*499/);
});

test('local iOS StoreKit configuration has one ₹499 monthly plan and no introductory offer', () => {
  assert.equal(localStoreKit.subscriptionGroups.length, 1);
  assert.equal(localStoreKit.subscriptionGroups[0].subscriptions.length, 1);
  const subscription = localStoreKit.subscriptionGroups[0].subscriptions[0];
  assert.equal(subscription.displayPrice, '499');
  assert.equal(subscription.recurringSubscriptionPeriod, 'P1M');
  assert.equal(Object.hasOwn(subscription, 'introductoryOffer'), false);
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
  assert.match(appleHookSource, /useDeferredIapConnection\(\{/);
  assert.match(appleHookSource, /enabled: Boolean\(userId\)/);
  assert.match(deferredIapSource, /if \(!enabled\)/);
  assert.match(deferredIapSource, /initConnection\(\)/);
  assert.match(appSource, />Retry \{storeName\}</);
});

test('each unsubscribed login automatically sees the platform subscription popup once', () => {
  assert.match(appSource, /const subscriptionPopupShownForSessions = useRef\(new Set\(\)\)/);
  assert.match(appSource, /const subscriptionStateKnown = Boolean\(storeSubscription\.entitlement\?\.entitlementState\)/);
  assert.match(appSource, /if \(!subscriptionStateKnown \|\| currentUserHasCourseAccess\) return undefined/);
  assert.match(appSource, /const sessionKey = `\$\{currentUserId\}:\$\{currentSessionId\}`/);
  assert.match(appSource, /subscriptionPopupShownForSessions\.current\.has\(sessionKey\)/);
  assert.match(appSource, /subscriptionPopupShownForSessions\.current\.add\(sessionKey\);\s+setShowAppUpgrade\(true\)/);
  assert.doesNotMatch(appSource, /const isEligibleNewSubscriber =\s+Platform\.OS === "android"/);
});

test('iOS privacy manifest declares uploaded photos without claiming device identifiers or tracking', () => {
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypePhotosorVideos/);
  assert.doesNotMatch(privacyManifest, /NSPrivacyCollectedDataTypeDeviceID/);
  assert.match(privacyManifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
});

test('iOS native bundle explains photo-library access used by the editable profile picker', () => {
  assert.match(appSource, /launchImageLibraryAsync\([\s\S]+allowsEditing: true/);
  assert.match(infoPlist, /<key>NSPhotoLibraryUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
});

test('logged-in tablet screens constrain content and bottom navigation width', () => {
  assert.match(appSource, /tabletContentFrame: \{\s+width: "100%",\s+maxWidth: 760,\s+alignSelf: "center"/);
  assert.match(appSource, /tabletScrollContent: \{ width: "100%", maxWidth: 760, alignSelf: "center" \}/);
  assert.match(appSource, /const isTabletNav = navViewportWidth >= 768/);
  assert.match(appSource, /Math\.min\(navViewportWidth - 56, searchOpen \? 720 : 640\)/);
  assert.match(appSource, /homeStyles\.tabletScrollContent/);
  assert.match(appSource, /s\.tabletListContent/);
  assert.match(appSource, /s\.tabletContentFrame/);
});

test('secondary account tablet screens use the shared centered content frame', () => {
  for (const screenName of [
    'WishlistScreen',
    'CertificatesScreen',
    'InfoPageScreen',
    'SubscriptionDetailsScreen',
    'LegalContentScreen',
  ]) {
    const start = appSource.indexOf(`function ${screenName}`);
    assert.notEqual(start, -1, `${screenName} is present`);
    const nextFunction = appSource.indexOf('\nfunction ', start + 10);
    const source = appSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
    assert.match(source, /const isTablet = width >= 768/, `${screenName} detects tablet width`);
    assert.match(source, /s\.tabletContentFrame|s\.tabletListContent/, `${screenName} applies tablet frame`);
  }
});

test('profile avatar picker keeps unique bundled choices and falls back from unknown legacy values', () => {
  assert.match(appSource, /const DEMO_AVATARS = Array\.from\(\{ length: 15 \}/);
  assert.match(appSource, /const src = AVATAR_IMAGES\[avatarId\] \|\| AVATAR_IMAGES\.a1/);
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
