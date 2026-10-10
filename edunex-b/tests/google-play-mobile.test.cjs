const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const subscriptions = require('../../appcopyai/services/subscriptions');
const { createGooglePlayBillingDiagnostics } = require('../../appcopyai/services/googlePlayBillingDiagnostics');
const { GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS, GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS,
  normalizeGooglePlaySubscriptionOffers } = subscriptions;
const productId = GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly;
const offerId = GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory;
const monthly = (overrides = {}) => ({
  billingCycleCount: 0, billingPeriod: 'P1M', recurrenceMode: 1,
  formattedPrice: '₹499.00', priceAmountMicros: '499000000', priceCurrencyCode: 'INR', ...overrides,
});
const firstThreeDays = (overrides = {}) => ({
  billingCycleCount: 0, billingPeriod: 'P3D', recurrenceMode: 3,
  formattedPrice: '₹9.00', priceAmountMicros: '9000000', priceCurrencyCode: 'INR', ...overrides,
});
const offer = (id, token, phases, overrides = {}) => ({
  basePlanId: 'monthly', offerId: id, offerToken: token,
  pricingPhases: { pricingPhaseList: phases }, ...overrides,
});
const base = () => offer(null, 'base-token', [monthly()]);
const introductory = (overrides = {}) => offer(offerId, 'intro-token', [firstThreeDays(), monthly()], overrides);
const product = (offers = [base(), introductory()], id = productId) => ({
  id, displayPrice: '₹499.00', subscriptionOfferDetailsAndroid: offers,
});

test('Google product is separate from Apple and selects the returned paid P3D → P1M token', () => {
  assert.equal(productId, 'skillomate_premium_monthly');
  assert.notEqual(productId, subscriptions.APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly);
  const result = normalizeGooglePlaySubscriptionOffers(product());
  assert.equal(result.purchaseOffer.offerToken, 'intro-token');
  assert.equal(result.purchaseOffer.offerId, 'intro-9rs-3days');
  assert.equal(result.introductoryOffer.displayText, '₹9.00 for the first 3 days');
  assert.equal(result.introductoryOffer.periodCount, 1);
  assert.equal(result.recurring.localizedPrice, '₹499.00');
});

test('configured offer ID chooses its token; absent eligibility falls back to monthly base', () => {
  const configured = introductory({ offerId: 'configured-intro', offerToken: 'configured-token' });
  assert.equal(normalizeGooglePlaySubscriptionOffers(product([base(), configured]), 'configured-intro')
    .purchaseOffer.offerToken, 'configured-token');
  const absent = normalizeGooglePlaySubscriptionOffers(product([base(), configured]));
  assert.equal(absent.introductoryOffer, null);
  assert.equal(absent.purchaseOffer.offerToken, 'base-token');
  assert.equal(normalizeGooglePlaySubscriptionOffers(product([configured])).purchaseOffer, null);
});

test('renewal price comes from the purchased offer even with multiple base plans', () => {
  const otherBase = offer(null, 'annual-token', [monthly({
    billingPeriod: 'P1Y', formattedPrice: '₹3,999.00', priceAmountMicros: '3999000000',
  })], { basePlanId: 'annual' });
  const selected = introductory({ pricingPhases: { pricingPhaseList: [firstThreeDays(), monthly({
    formattedPrice: '₹599.00', priceAmountMicros: '599000000',
  })] } });
  assert.equal(normalizeGooglePlaySubscriptionOffers(product([otherBase, base(), selected]))
    .recurring.localizedPrice, '₹599.00');
  assert.equal(normalizeGooglePlaySubscriptionOffers(product([otherBase, base()]))
    .purchaseOffer.offerToken, 'base-token');
});

test('malformed offers fail closed without crashing or synthesizing a monthly period', () => {
  const badOffers = [
    null,
    introductory({ offerToken: '' }),
    introductory({ offerToken: '   ' }),
    introductory({ offerToken: 42 }),
    introductory({ pricingPhases: { pricingPhaseList: [null, monthly()] } }),
    introductory({ pricingPhases: { pricingPhaseList: [firstThreeDays(), monthly({ billingPeriod: 'invalid' })] } }),
    introductory({ pricingPhases: { pricingPhaseList: [firstThreeDays(), monthly({ billingPeriod: 'P0M' })] } }),
    introductory({ pricingPhases: { pricingPhaseList: [firstThreeDays(), monthly({ formattedPrice: '' })] } }),
    introductory({ pricingPhases: { pricingPhaseList: [firstThreeDays({ priceAmountMicros: 'NaN' }), monthly()] } }),
  ];
  const result = normalizeGooglePlaySubscriptionOffers(product(badOffers));
  assert.deepEqual(result, { introductoryOffer: null, purchaseOffer: null, recurring: null });
  assert.deepEqual(normalizeGooglePlaySubscriptionOffers(null), result);
});

test('free, repeated, multi-phase and non-recurring renewal offers cannot be advertised as paid three-day intro', () => {
  const invalidPhases = [
    [firstThreeDays({ priceAmountMicros: '0' }), monthly()],
    [firstThreeDays({ billingPeriod: 'P1M' }), monthly()],
    [firstThreeDays({ billingPeriod: 'P1D' }), monthly()],
    [firstThreeDays({ recurrenceMode: undefined }), monthly()],
    [firstThreeDays({ recurrenceMode: 2, billingCycleCount: 2 }), monthly()],
    [firstThreeDays({ recurrenceMode: 1 }), monthly()],
    [firstThreeDays(), monthly({ recurrenceMode: 3 })],
    [firstThreeDays(), monthly({ priceAmountMicros: '500000' })],
    [firstThreeDays(), monthly({ billingCycleCount: 1, recurrenceMode: 2 }), monthly()],
  ];
  for (const phases of invalidPhases) {
    const result = normalizeGooglePlaySubscriptionOffers(product([base(), offer(offerId, 'bad-token', phases)]));
    assert.equal(result.introductoryOffer, null, JSON.stringify(phases));
    assert.equal(result.purchaseOffer.offerToken, 'base-token');
  }
  assert.equal(normalizeGooglePlaySubscriptionOffers(product([
    offer(null, 'prepaid-token', [monthly({ recurrenceMode: 3 })]),
  ])).purchaseOffer, null);
});

test('a finite one-cycle P3D introductory phase represents exactly one paid charge', () => {
  const result = normalizeGooglePlaySubscriptionOffers(product([
    offer(offerId, 'one-cycle-token', [firstThreeDays({ recurrenceMode: 2, billingCycleCount: 1 }), monthly()]),
  ]));
  assert.equal(result.purchaseOffer.offerToken, 'one-cycle-token');
  assert.equal(result.introductoryOffer.displayText, '₹9.00 for the first 3 days');
});

test('old Google offer IDs and a different base plan cannot be selected for new checkout', () => {
  for (const incompatible of [
    introductory({ offerId: 'new-subscriber-1rs-24h' }),
    introductory({ basePlanId: 'another-plan' }),
  ]) {
    const result = normalizeGooglePlaySubscriptionOffers(product([incompatible, base()]));
    assert.equal(result.introductoryOffer, null);
    assert.equal(result.purchaseOffer.offerToken, 'base-token');
  }
});

// Execute the real hook's public actions with native/React boundaries replaced.
// Effects are intentionally not mounted: these are action/contract tests, not a
// substitute for device billing or React lifecycle tests.
const hookSource = fs.readFileSync(path.join(__dirname, '../../appcopyai/services/useGooglePlaySubscriptions.js'), 'utf8')
  .replace(/^import[\s\S]*?from\s+"[^"\n]+";\s*/gm, '')
  .replace('export function useGooglePlaySubscriptions', 'function useGooglePlaySubscriptions');

function hookHarness({ configuration = {}, products = [product()], availablePurchases = [],
  verifyError = null, verifyResponse = {}, connected = true, fetchProducts, finishError = null,
  diagnosticsEnabled = false } = {}) {
  const config = { productId, introductoryOfferId: offerId, obfuscatedAccountId: 'account-hash', ...configuration };
  const events = [];
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const timers = new Map();
  let timerId = 0;
  const entitlement = { entitlementState: 'ACTIVE', entitlementActive: true,
    expiresAt: '2099-01-01T00:00:00.000Z', ...config, ...verifyResponse };
  const session = { requestJson: async (url, options) => {
    events.push({ kind: 'request', url, options });
    if (url.endsWith('/verify')) {
      if (verifyError) throw verifyError;
      return entitlement;
    }
    return config;
  } };
  let callbacks;
  const iap = {
    connected,
    subscriptions: products,
    reconnect: async () => connected,
    fetchProducts: async () => { throw new Error('Merged hook cache must not be used for authoritative terms'); },
    requestPurchase: async request => { events.push({ kind: 'purchase', request }); },
    finishTransaction: async request => {
      events.push({ kind: 'finish', request });
      if (finishError) throw finishError;
    },
  };
  const context = vm.createContext({
    ...subscriptions,
    createGooglePlayBillingDiagnostics,
    NativeModules: { SkillomateBillingDiagnostics: {
      enabled: diagnosticsEnabled,
      logEvent(event, fields) { events.push({ kind: 'diagnostic', event, fields }); },
      queryProduct(id) { events.push({ kind: 'native-query', productId: id }); },
    } },
    __DEV__: false,
    process: { env: {} },
    Platform: { OS: 'android' },
    AppState: {},
    ErrorCode: { UserCancelled: 'cancelled', Pending: 'pending', DeferredPayment: 'deferred' },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: () => {},
    useIAP: next => { callbacks = next; return iap; },
    readProducts: async request => {
      events.push({ kind: 'fetch', request });
      return fetchProducts ? fetchProducts(request) : products;
    },
    readAvailablePurchases: async () => availablePurchases,
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(`${hookSource}\nglobalThis.hook = useGooglePlaySubscriptions;`, context);
  let currentUser = { _id: 'user-1' };
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return context.hook({ session, user: currentUser,
      onEntitlementChanged: async value => events.push({ kind: 'entitlement', value }) });
  };
  return {
    events, render, config,
    setUser(user) { currentUser = user; },
    expireProductQuery() {
      for (const [id, timer] of timers) {
        if (timer.delay === 12_000) { timers.delete(id); timer.callback(); }
      }
    },
    async ready() { await render().refresh(); await render().retryProductLoad(); return render(); },
    get callbacks() { return callbacks; },
  };
}

test('Android fetch and purchase use remote SKU, matching eligible token and account ID', async () => {
  const overriddenId = 'test_premium_monthly';
  const h = hookHarness({ configuration: { productId: overriddenId }, products: [product(undefined, overriddenId)] });
  await h.render().refresh();
  await h.render().retryProductLoad();
  await h.render().purchase();
  const fetch = h.events.find(event => event.kind === 'fetch');
  assert.deepEqual(JSON.parse(JSON.stringify(fetch.request)), { skus: [overriddenId], type: 'subs' });
  const purchase = h.events.find(event => event.kind === 'purchase');
  assert.deepEqual(JSON.parse(JSON.stringify(purchase.request)), {
    request: { google: { skus: [overriddenId],
      subscriptionOffers: [{ sku: overriddenId, offerToken: 'intro-token' }],
      obfuscatedAccountId: 'account-hash' } }, type: 'subs',
  });
});

test('Android purchase uses base token when Google does not return eligible intro', async () => {
  const h = hookHarness({ products: [product([base()])] });
  await h.ready();
  await h.render().purchase();
  assert.equal(h.events.find(event => event.kind === 'purchase').request.request.google.subscriptionOffers[0].offerToken,
    'base-token');
  assert.equal(h.render().introductoryOfferEligible, false);
});

test('explicit native diagnostic build logs authenticated config, raw finite offer and same checkout token safely', async () => {
  const h = hookHarness({ diagnosticsEnabled: true,
    configuration: { packageName: 'com.skillomate.app' },
    products: [product([base(), offer(offerId, 'fake-finite-token', [
      firstThreeDays({ recurrenceMode: 2, billingCycleCount: 1 }), monthly(),
    ])])] });
  await h.ready();
  await h.render().purchase();
  const diagnostics = h.events.filter(event => event.kind === 'diagnostic');
  assert.ok(diagnostics.some(item => item.event === 'js_startup'));
  const configuration = diagnostics.find(item => item.event === 'configuration').fields;
  assert.equal(configuration.introductoryOfferId, offerId);
  assert.equal(configuration.accountBindingPresent, true);
  const phase = diagnostics.find(item => item.event === 'raw_phase' && item.fields.billingPeriod === 'P3D').fields;
  assert.equal(phase.recurrenceMode, 2);
  assert.equal(phase.billingCycleCount, 1);
  assert.equal(phase.priceCurrencyCode, 'INR');
  const validation = diagnostics.find(item => item.event === 'validation' && item.fields.offerId === offerId).fields;
  assert.equal(validation.oldValidatorAccepted, false);
  assert.equal(validation.rejectionReason, null);
  const checkout = diagnostics.find(item => item.event === 'checkout').fields;
  assert.equal(checkout.selectedOfferId, offerId);
  assert.equal(checkout.selectedTokenMatchesReturnedOffer, true);
  assert.equal(checkout.submittedTokenMatchesSelectedOffer, true);
  const serialized = JSON.stringify(diagnostics);
  for (const secret of ['fake-finite-token', 'base-token', 'account-hash', 'user-1', 'obfuscatedAccountId', 'purchaseToken']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('default production build emits no diagnostics and does not start a native probe', async () => {
  const h = hookHarness();
  await h.ready();
  await h.render().purchase();
  assert.equal(h.events.some(event => ['diagnostic', 'native-query'].includes(event.kind)), false);
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
});

test('Android cannot purchase without returned offers or backend account binding', async () => {
  for (const options of [{ products: [product([])] }, { configuration: { obfuscatedAccountId: null } }]) {
    const h = hookHarness(options);
    await h.ready();
    await h.render().purchase();
    assert.equal(h.events.some(event => event.kind === 'purchase'), false);
    assert.match(h.render().error, /not ready/);
  }
});

test('restore filters to configured SKU and sends only token, then finishes verified purchase', async () => {
  const restored = { productId, purchaseToken: 'valid-token', purchaseState: 'purchased', transactionId: 'order-1' };
  const h = hookHarness({ availablePurchases: [
    { productId: subscriptions.APPLE_SUBSCRIPTION_PRODUCT_IDS.monthly, purchaseToken: 'wrong-platform-token' },
    { productId: 'unrelated-sku', purchaseToken: 'unrelated-token' }, restored,
  ] });
  await h.render().refresh();
  await h.render().restore();
  const verifications = h.events.filter(event => event.url?.endsWith('/verify'));
  assert.equal(verifications.length, 1);
  assert.deepEqual(JSON.parse(verifications[0].options.body), { purchaseToken: 'valid-token' });
  const finishIndex = h.events.findIndex(event => event.kind === 'finish');
  assert.ok(finishIndex > h.events.indexOf(verifications[0]));
  assert.equal(h.events[finishIndex].request.purchase, restored);
  assert.equal(h.events[finishIndex].request.isConsumable, false);
  assert.equal(h.render().notice, 'Purchases restored.');
});

test('restore never verifies or acknowledges pending purchases', async () => {
  const h = hookHarness({ availablePurchases: [{ productId, purchaseToken: 'pending-token', purchaseState: 'pending' }] });
  await h.render().refresh();
  await h.render().restore();
  assert.equal(h.events.some(event => event.url?.endsWith('/verify')), false);
  assert.equal(h.events.some(event => event.kind === 'finish'), false);
});

test('failed verification never acknowledges purchase and can be retried', async () => {
  const h = hookHarness({ verifyError: new Error('Verification unavailable'),
    availablePurchases: [{ productId, purchaseToken: 'retry-token', purchaseState: 'purchased' }] });
  await h.render().refresh();
  await h.render().restore();
  await h.render().restore();
  assert.equal(h.events.filter(event => event.url?.endsWith('/verify')).length, 2);
  assert.equal(h.events.some(event => event.kind === 'finish'), false);
});

test('selected introductory checkout cannot silently switch to monthly when eligibility disappears', async () => {
  let currentProducts = [product()];
  const h = hookHarness({ fetchProducts: async () => currentProducts });
  const displayed = await h.ready();
  assert.equal(displayed.introductoryOffer.displayText, '₹9.00 for the first 3 days');
  currentProducts = [product([base()])];
  await displayed.purchase();
  assert.equal(h.events.some(event => event.kind === 'purchase'), false);
  const changed = h.render();
  assert.equal(changed.introductoryOfferEligible, false);
  assert.equal(changed.localizedPrice, '₹499.00');
  assert.match(changed.notice, /terms have changed.*again to confirm/);
  await changed.purchase();
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
  assert.equal(h.events.find(event => event.kind === 'purchase')
    .request.request.google.subscriptionOffers[0].offerToken, 'base-token');
});

test('changed introductory or recurring price must be shown and confirmed before checkout', async () => {
  for (const phases of [
    [firstThreeDays({ formattedPrice: '₹19.00', priceAmountMicros: '19000000' }), monthly()],
    [firstThreeDays(), monthly({ formattedPrice: '₹599.00', priceAmountMicros: '599000000' })],
  ]) {
    let currentProducts = [product()];
    const h = hookHarness({ fetchProducts: async () => currentProducts });
    const displayed = await h.ready();
    currentProducts = [product([offer(offerId, 'updated-token', phases)])];
    await displayed.purchase();
    assert.equal(h.events.some(event => event.kind === 'purchase'), false);
    assert.equal(h.render().introductoryOffer.localizedPrice, phases[0].formattedPrice);
    assert.equal(h.render().localizedPrice, phases[1].formattedPrice);
    await h.render().purchase();
    assert.equal(h.events.find(event => event.kind === 'purchase')
      .request.request.google.subscriptionOffers[0].offerToken, 'updated-token');
  }
});

test('unchanged displayed terms use a freshly returned token rather than a cached token', async () => {
  let currentProducts = [product()];
  const h = hookHarness({ fetchProducts: async () => currentProducts });
  const displayed = await h.ready();
  currentProducts = [product([base(), introductory({ offerToken: 'rotated-google-token' })])];
  await displayed.purchase();
  assert.equal(h.events.find(event => event.kind === 'purchase')
    .request.request.google.subscriptionOffers[0].offerToken, 'rotated-google-token');
  assert.equal(h.render().notice, '');
});

test('a Play purchase-sheet error refreshes changed eligibility without automatically buying monthly', async () => {
  let currentProducts = [product()];
  const h = hookHarness({ fetchProducts: async () => currentProducts });
  const displayed = await h.ready();
  await displayed.purchase();
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
  currentProducts = [product([base()])];
  await h.callbacks.onPurchaseError({ code: 'item-unavailable' });
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
  assert.equal(h.render().introductoryOfferEligible, false);
  assert.equal(h.render().localizedPrice, '₹499.00');
  assert.match(h.render().error, /Review the current price/);
});

test('missing or failed refreshed products clear stale prices and block checkout', async () => {
  for (const fail of [false, true]) {
    let refreshed = false;
    const h = hookHarness({ fetchProducts: async () => {
      if (!refreshed) return [product()];
      if (fail) throw new Error('Play disconnected');
      return [];
    } });
    const displayed = await h.ready();
    refreshed = true;
    await displayed.purchase();
    assert.equal(h.events.some(event => event.kind === 'purchase'), false);
    assert.equal(h.render().productLoadStatus, 'error');
    assert.equal(h.render().purchaseReady, false);
    assert.equal(h.render().localizedPrice, '');
    assert.ok(h.render().error);
  }
});

test('a hung product preflight times out, ignores its late response, and allows a fresh retry', async () => {
  let release;
  let shouldWait = false;
  const h = hookHarness({ fetchProducts: async () => shouldWait
    ? new Promise(resolve => { release = resolve; }) : [product()] });
  const displayed = await h.ready();
  shouldWait = true;
  const buying = displayed.purchase();
  h.expireProductQuery();
  await buying;
  assert.equal(h.render().working, false);
  assert.equal(h.render().productLoadStatus, 'error');
  assert.equal(h.render().purchaseReady, false);
  release([product()]);
  await Promise.resolve();
  assert.equal(h.events.some(event => event.kind === 'purchase'), false);
  assert.equal(h.render().productLoadStatus, 'error');
  shouldWait = false;
  await h.render().retryProductLoad();
  await h.render().purchase();
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
});

test('initial product loading times out into an accurate unavailable state', async () => {
  const h = hookHarness({ fetchProducts: () => new Promise(() => {}) });
  await h.render().refresh();
  const loading = h.render().retryProductLoad();
  assert.equal(h.render().productLoadStatus, 'loading');
  assert.equal(h.render().purchaseReady, false);
  h.expireProductQuery();
  await loading;
  assert.equal(h.render().productLoadStatus, 'error');
  assert.equal(h.render().localizedPrice, '');
  assert.match(h.render().error, /Could not load/);
});

test('a new Skillomate account cannot use the previous account billing configuration', async () => {
  const h = hookHarness();
  await h.ready();
  h.setUser({ _id: 'another-user' });
  assert.equal(h.render().purchaseReady, false);
  await h.render().purchase();
  assert.equal(h.events.some(event => event.kind === 'purchase'), false);
});

test('one pending preflight or store sheet cannot launch duplicate purchase requests', async () => {
  let release;
  let shouldWait = false;
  const h = hookHarness({ fetchProducts: async () => shouldWait
    ? new Promise(resolve => { release = resolve; }) : [product()] });
  const displayed = await h.ready();
  shouldWait = true;
  const first = displayed.purchase();
  await displayed.purchase();
  assert.equal(h.events.filter(event => event.kind === 'fetch').length, 2);
  release([product()]);
  await first;
  await h.render().purchase();
  assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
  assert.equal(h.render().working, true);
  h.callbacks.onPurchaseError({ code: 'cancelled' });
  assert.equal(h.render().working, false);
});

test('logout, changed account and changed billing configuration cancel an in-flight checkout', async () => {
  for (const change of ['logout', 'account', 'configuration']) {
    let release;
    let shouldWait = false;
    const h = hookHarness({ fetchProducts: async request => shouldWait
      ? new Promise(resolve => { release = resolve; }) : [product(undefined, request.skus[0])] });
    const displayed = await h.ready();
    shouldWait = true;
    const buying = displayed.purchase();
    if (change === 'configuration') {
      h.config.productId = 'changed-product';
      h.config.obfuscatedAccountId = 'changed-account-binding';
      await h.render().refresh();
    } else {
      h.setUser(change === 'logout' ? null : { _id: 'another-user' });
    }
    assert.equal(h.render().working, false, `${change} does not inherit the old busy state`);
    release([product()]);
    await buying;
    assert.equal(h.events.some(event => event.kind === 'purchase'), false, change);
    assert.equal(h.render().working, false, `${change} remains retryable after the old query finishes`);
    if (change === 'logout') h.setUser({ _id: 'newly-signed-in-user' });
    shouldWait = false;
    await h.render().refresh();
    await h.render().retryProductLoad();
    await h.render().purchase();
    assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1, `${change} can start a new checkout`);
  }
});

test('late preflight completion or callback cannot clear a newer account or configuration checkout', async () => {
  for (const change of ['account', 'configuration']) {
    let releaseOld;
    let shouldWait = false;
    const h = hookHarness({ fetchProducts: async request => shouldWait
      ? new Promise(resolve => { releaseOld = resolve; }) : [product(undefined, request.skus[0])] });
    const displayed = await h.ready();
    const oldCallbacks = h.callbacks;
    shouldWait = true;
    const oldBuying = displayed.purchase();
    if (change === 'account') h.setUser({ _id: 'another-user' });
    else h.config.productId = 'changed-product';
    h.config.obfuscatedAccountId = 'new-binding';
    await h.render().refresh();
    assert.equal(h.render().working, false);
    shouldWait = false;
    await h.render().retryProductLoad();
    await h.render().purchase();
    assert.equal(h.render().working, true);
    releaseOld([product()]);
    await oldBuying;
    await oldCallbacks.onPurchaseError({ code: 'cancelled' });
    assert.equal(h.render().working, true, `${change}: old work must not unlock the new store sheet`);
    await h.render().purchase();
    assert.equal(h.events.filter(event => event.kind === 'purchase').length, 1);
    await h.callbacks.onPurchaseError({ code: 'cancelled' });
    assert.equal(h.render().working, false);
  }
});

test('server-acknowledged historical purchase restores without another native acknowledgement', async () => {
  const h = hookHarness({ verifyResponse: { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' },
    availablePurchases: [{ productId, offerId: 'new-subscriber-1rs-24h',
      purchaseToken: 'historical-purchase-token', purchaseState: 'purchased' }] });
  await h.render().refresh();
  await h.render().restore();
  assert.equal(h.events.filter(event => event.url?.endsWith('/verify')).length, 1);
  assert.equal(h.events.some(event => event.kind === 'finish'), false);
  assert.equal(h.render().notice, 'Purchases restored.');
});

test('pending backend payment is never acknowledged even if the client snapshot says purchased', async () => {
  const h = hookHarness({ verifyResponse: { entitlementState: 'BILLING_RETRY', entitlementActive: false,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' },
    availablePurchases: [{ productId, purchaseToken: 'pending-backend-token', purchaseState: 'purchased' }] });
  await h.render().refresh();
  await h.render().restore();
  await h.render().restore();
  assert.equal(h.events.filter(event => event.url?.endsWith('/verify')).length, 2);
  assert.equal(h.events.some(event => event.kind === 'finish'), false);
  assert.equal(h.render().notice, 'No currently active purchase could be restored.');
});

test('native acknowledgement errors allow retry after verified active payment', async () => {
  const h = hookHarness({ finishError: new Error('Acknowledgement unavailable'),
    verifyResponse: { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' },
    availablePurchases: [{ productId, purchaseToken: 'ack-retry-token', purchaseState: 'purchased' }] });
  await h.render().refresh();
  await h.render().restore();
  await h.render().restore();
  assert.equal(h.events.filter(event => event.kind === 'finish').length, 2);
  assert.equal(h.events.filter(event => event.url?.endsWith('/verify')).length, 2);
});

test('shared paywall derives Android three-day terms and keeps iOS on regular Apple pricing', async () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../../appcopyai/App.js'), 'utf8');
  const priceFunction = appSource.slice(appSource.indexOf('function appleSubscriptionPriceCopy('),
    appSource.indexOf('\nfunction UpgradeModal('));
  const h = hookHarness();
  const model = await h.ready();
  for (const platform of ['android', 'ios']) {
    const context = vm.createContext({ Platform: { OS: platform }, model });
    const result = vm.runInContext(`${priceFunction}\nappleSubscriptionPriceCopy(model)`, context);
    assert.equal(result.recurring, '₹499.00 per month');
    assert.equal(result.isIntroductory, platform === 'android');
    assert.equal(result.headline, platform === 'android' ? '₹9.00 for the first 3 days' : '₹499.00 per month');
  }
});
