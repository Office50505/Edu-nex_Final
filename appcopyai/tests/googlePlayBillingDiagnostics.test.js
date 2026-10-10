const test = require('node:test');
const assert = require('node:assert/strict');
const { createGooglePlayBillingDiagnostics } = require('../services/googlePlayBillingDiagnostics');
const { diagnoseGooglePlaySubscriptionOffers, normalizeGooglePlaySubscriptionOffers } = require('../services/subscriptions');

const productId = 'skillomate_premium_monthly';
const offerId = 'intro-9rs-3days';
const phase = (billingPeriod, recurrenceMode, billingCycleCount, priceAmountMicros, formattedPrice) => ({
  billingPeriod, recurrenceMode, billingCycleCount, priceAmountMicros, formattedPrice, priceCurrencyCode: 'INR',
});
const phases = [phase('P3D', 2, 1, '9000000', '₹9.00'), phase('P1M', 1, 0, '499000000', '₹499.00')];
const fakeToken = 'fake-offer-token-must-never-appear';
const rawOffer = { basePlanId: 'monthly', offerId, offerToken: fakeToken, pricingPhases: { pricingPhaseList: phases } };
const product = { id: productId, subscriptionOfferDetailsAndroid: [rawOffer], subscriptionOffers: [{
  id: offerId, basePlanIdAndroid: 'monthly', offerTokenAndroid: fakeToken, pricingPhasesAndroid: { pricingPhaseList: phases },
}] };
function recorder(...args) {
  const enabled = args.length ? args[0] : true;
  const events = [];
  const probes = [];
  const logger = createGooglePlayBillingDiagnostics({ enabled,
    logEvent: (event, fields) => events.push({ event, ...fields }),
    queryProduct: id => probes.push(id),
  });
  return { logger, events, probes };
}

test('only an explicitly enabled native bridge permits logging and the native probe', () => {
  for (const enabled of [false, undefined, 'true', 1]) {
    const { logger, events, probes } = recorder(enabled);
    logger.configuration({ obfuscatedAccountId: 'private-hash' }, productId, offerId);
    logger.rawProduct(product);
    logger.selection(diagnoseGooglePlaySubscriptionOffers(product));
    logger.checkout(product, normalizeGooglePlaySubscriptionOffers(product).purchaseOffer, fakeToken);
    assert.deepEqual(events, []);
    assert.deepEqual(probes, []);
  }
  assert.equal(createGooglePlayBillingDiagnostics(null).enabled, false);
});

test('startup marker and both pre-normalization representations retain every safe phase', () => {
  const { logger, events, probes } = recorder();
  logger.rawProduct(product);
  assert.deepEqual(events[0], { event: 'js_startup', diagnosticsEnabled: true });
  assert.equal(events.find(item => item.event === 'raw_product').returnedSubscriptionOfferCount, 2);
  assert.deepEqual(probes, [productId]);
  const offers = events.filter(item => item.event === 'raw_offer');
  assert.deepEqual(offers.map(item => item.shape), ['subscriptionOfferDetailsAndroid', 'subscriptionOffers']);
  assert.ok(offers.every(item => item.offerTokenPresent && item.offerId === offerId && item.phaseCount === 2));
  const emittedPhases = events.filter(item => item.event === 'raw_phase');
  assert.equal(emittedPhases.length, 4);
  assert.deepEqual(emittedPhases.map(item => [item.billingPeriod, item.recurrenceMode, item.billingCycleCount]), [
    ['P3D', 2, 1], ['P1M', 1, 0], ['P3D', 2, 1], ['P1M', 1, 0],
  ]);
});

test('malformed or absent recurrence values remain unknown rather than coercing to zero', () => {
  const { logger, events } = recorder();
  logger.rawProduct({ id: productId, subscriptionOfferDetailsAndroid: [{ ...rawOffer,
    pricingPhases: { pricingPhaseList: [
      { billingPeriod: 'P3D', recurrenceMode: null, billingCycleCount: null },
      { billingPeriod: 'P1M', recurrenceMode: '1', billingCycleCount: '' },
    ] },
  }] });
  for (const item of events.filter(item => item.event === 'raw_phase')) {
    assert.equal(item.recurrenceMode, null);
    assert.equal(item.billingCycleCount, null);
  }
});

test('a missing JS product can still be compared with the explicit configured native query', () => {
  const { logger, events, probes } = recorder();
  logger.rawProduct(null, productId);
  const raw = events.find(item => item.event === 'raw_product');
  assert.equal(raw.productId, null);
  assert.equal(raw.returnedSubscriptionOfferCount, 0);
  assert.deepEqual(probes, [productId]);
});

test('configured and effective offer IDs are recorded separately without any session or binding value', () => {
  const { logger, events } = recorder();
  logger.configuration({ packageName: 'com.skillomate.app', productId, introductoryOfferId: 'outdated-offer',
    obfuscatedAccountId: 'private-account-hash', authorization: 'private-access-token', userId: 'private-user',
    phone: 'private-phone', email: 'private-email' }, productId, 'outdated-offer');
  const config = events.find(item => item.event === 'configuration');
  assert.equal(config.introductoryOfferId, 'outdated-offer');
  assert.equal(config.configuredIntroductoryOfferId, 'outdated-offer');
  assert.equal(config.accountBindingPresent, true);
  assert.equal(JSON.stringify(events).includes('private-'), false);
});

test('diagnostics distinguish absent offer from returned offer rejected by an exact validation check', () => {
  const { logger, events } = recorder();
  logger.selection(diagnoseGooglePlaySubscriptionOffers({ id: productId, subscriptionOfferDetailsAndroid: [] }));
  logger.selection(diagnoseGooglePlaySubscriptionOffers({ id: productId, subscriptionOfferDetailsAndroid: [{
    ...rawOffer, pricingPhases: { pricingPhaseList: [{ ...phases[0], billingCycleCount: 2 }, phases[1]] },
  }] }));
  const selections = events.filter(item => item.event === 'selection');
  assert.equal(selections[0].introductoryOfferReturned, false);
  assert.equal(selections[0].introductoryOfferStatus, 'absent');
  assert.equal(selections[0].rejectionReason, 'offer_not_returned');
  assert.equal(selections[1].introductoryOfferReturned, true);
  assert.equal(selections[1].introductoryOfferStatus, 'rejected');
  assert.equal(events.find(item => item.event === 'validation').failedValidationCheck, 'intro_single_charge');
});

test('checkout compares actual tokens in memory and emits only equality booleans', () => {
  const { logger, events } = recorder();
  const selected = normalizeGooglePlaySubscriptionOffers(product).purchaseOffer;
  logger.checkout(product, selected, fakeToken);
  logger.checkout(product, selected, 'fake-mismatched-submitted-token');
  logger.checkout(product, { ...selected, offerToken: 'fake-unreturned-token' }, 'fake-unreturned-token');
  const checkout = events.filter(item => item.event === 'checkout');
  assert.deepEqual(checkout.map(item => [item.selectedTokenMatchesReturnedOffer, item.submittedTokenMatchesSelectedOffer]), [
    [true, true], [true, false], [false, true],
  ]);
  assert.equal(JSON.stringify(events).includes('fake-'), false);
});

test('raw/config objects cannot smuggle unknown fields or sensitive data into emitted diagnostics', () => {
  const { logger, events } = recorder();
  logger.rawProduct({ ...product, purchaseToken: 'private-purchase-token',
    subscriptionOfferDetailsAndroid: [{ ...rawOffer, purchaseToken: 'private-purchase-token',
      pricingPhases: { pricingPhaseList: [{ ...phases[0], formattedPrice: '₹9 private-secret',
        customerEmail: 'private-email', obfuscatedAccountId: 'private-hash' }, phases[1]] } }],
  });
  logger.selection(diagnoseGooglePlaySubscriptionOffers(product));
  assert.equal(JSON.stringify(events).includes('private-'), false);
  assert.equal(JSON.stringify(events).includes(fakeToken), false);
  assert.equal(events.find(item => item.event === 'raw_phase').formattedPrice, null);
});

test('a native diagnostic bridge failure cannot prevent checkout code from continuing', () => {
  const logger = createGooglePlayBillingDiagnostics({ enabled: true, logEvent() { throw new Error('unavailable'); },
    queryProduct() { throw new Error('unavailable'); } });
  assert.doesNotThrow(() => {
    logger.configuration({}, productId, offerId);
    logger.rawProduct(product);
    logger.selection(diagnoseGooglePlaySubscriptionOffers(product));
    logger.checkout(product, normalizeGooglePlaySubscriptionOffers(product).purchaseOffer, fakeToken);
  });
});
