const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  diagnoseGooglePlaySubscriptionOffers,
  normalizeGooglePlaySubscriptionOffers,
  readGooglePlaySubscriptionOfferEntries,
} = require("../services/subscriptions");

function phase({ period, price, micros, cycles, recurrence }) {
  return {
    billingPeriod: period,
    formattedPrice: price,
    priceAmountMicros: micros,
    priceCurrencyCode: "INR",
    billingCycleCount: cycles,
    recurrenceMode: recurrence,
  };
}

function product(offers) {
  return {
    id: "skillomate_premium_monthly",
    subscriptionOfferDetailsAndroid: offers,
  };
}

const monthlyBasePlan = {
  basePlanId: "monthly",
  offerToken: "FAKE_UNIT_TEST_BASE_TOKEN",
  pricingPhases: {
    pricingPhaseList: [
      phase({ period: "P1M", price: "₹499.00", micros: 499000000, cycles: 0, recurrence: 1 }),
    ],
  },
};

const introOffer = {
  basePlanId: "monthly",
  offerId: "intro-9rs-3days",
  offerToken: "FAKE_UNIT_TEST_INTRO_TOKEN",
  pricingPhases: {
    pricingPhaseList: [
      phase({ period: "P3D", price: "₹9.00", micros: 9000000, cycles: 0, recurrence: 3 }),
      phase({ period: "P1M", price: "₹499.00", micros: 499000000, cycles: 0, recurrence: 1 }),
    ],
  },
};

// Regression: Play can represent a single paid P3D intro as FINITE_RECURRING
// for exactly one billing cycle, before the infinite monthly renewal.
{
  const finiteIntro = {
    ...introOffer,
    offerToken: "FAKE_UNIT_TEST_FINITE_INTRO_TOKEN",
    pricingPhases: {
      pricingPhaseList: [
        phase({ period: "P3D", price: "₹9.00", micros: "9000000", cycles: 1, recurrence: 2 }),
        phase({ period: "P1M", price: "₹499.00", micros: "499000000", cycles: 0, recurrence: 1 }),
      ],
    },
  };
  const result = normalizeGooglePlaySubscriptionOffers(product([monthlyBasePlan, finiteIntro]));
  assert.strictEqual(result.purchaseOffer?.offerId, "intro-9rs-3days",
    "A single FINITE_RECURRING P3D cycle must select the paid introductory offer");
  assert.strictEqual(result.purchaseOffer.offerToken, "FAKE_UNIT_TEST_FINITE_INTRO_TOKEN");
  assert.strictEqual(result.introductoryOffer.localizedPrice, "₹9.00");
  assert.strictEqual(result.recurring.localizedPrice, "₹499.00");
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(product([monthlyBasePlan, finiteIntro]));
  assert.strictEqual(diagnostics.introductoryOfferStatus, "selected");
  assert.strictEqual(diagnostics.introductoryOfferReturned, true);
  assert.strictEqual(diagnostics.rejectionReason, null);
  assert.strictEqual(diagnostics.offers[1].oldValidatorAccepted, false);
  assert.strictEqual(diagnostics.offers[1].rejectionReason, null);
  assert.strictEqual(diagnostics.offers[1].phases[0].recurrenceMode, 2);
  assert.strictEqual(diagnostics.offers[1].phases[0].billingCycleCount, 1);
  assert.strictEqual(diagnostics.offers[1].phases[1].priceCurrencyCode, "INR");
}

{
  const result = normalizeGooglePlaySubscriptionOffers(product([monthlyBasePlan, introOffer]));
  assert.strictEqual(result.introductoryOffer.offerId, "intro-9rs-3days");
  assert.strictEqual(result.introductoryOffer.basePlanId, "monthly");
  assert.strictEqual(result.introductoryOffer.localizedPrice, "₹9.00");
  assert.strictEqual(result.introductoryOffer.periodValue, 3);
  assert.strictEqual(result.introductoryOffer.periodUnit, "day");
  assert.strictEqual(result.recurring.localizedPrice, "₹499.00");
  assert.strictEqual(result.recurring.periodValue, 1);
  assert.strictEqual(result.recurring.periodUnit, "month");
  assert.strictEqual(result.purchaseOffer.offerToken, "FAKE_UNIT_TEST_INTRO_TOKEN");
  assert.strictEqual(result.purchaseOffer.offerId, "intro-9rs-3days");
}

{
  const result = normalizeGooglePlaySubscriptionOffers(product([monthlyBasePlan]));
  assert.strictEqual(result.introductoryOffer, null);
  assert.strictEqual(result.purchaseOffer.offerToken, "FAKE_UNIT_TEST_BASE_TOKEN");
  assert.strictEqual(result.recurring.localizedPrice, "₹499.00");
}

{
  const invalidIntro = {
    ...introOffer,
    pricingPhases: {
      pricingPhaseList: [
        phase({ period: "P1D", price: "₹1.00", micros: 1000000, cycles: 0, recurrence: 3 }),
        phase({ period: "P1M", price: "₹499.00", micros: 499000000, cycles: 0, recurrence: 1 }),
      ],
    },
  };
  const result = normalizeGooglePlaySubscriptionOffers(product([monthlyBasePlan, invalidIntro]));
  assert.strictEqual(result.introductoryOffer, null);
  assert.strictEqual(result.purchaseOffer.offerToken, "FAKE_UNIT_TEST_BASE_TOKEN");
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(product([monthlyBasePlan, invalidIntro]));
  assert.strictEqual(diagnostics.selectedOfferId, null);
  assert.strictEqual(
    diagnostics.offers.find(offer => offer.offerId === "intro-9rs-3days").rejectionReason,
    "wrong_period",
  );
  assert.strictEqual(diagnostics.rejectionReason, "wrong_period");
}

{
  const missingToken = { ...introOffer, offerToken: "" };
  const result = normalizeGooglePlaySubscriptionOffers(product([missingToken]));
  assert.strictEqual(result.purchaseOffer, null);
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(product([missingToken]));
  assert.strictEqual(diagnostics.offers[0].offerTokenPresent, false);
  assert.strictEqual(diagnostics.offers[0].rejectionReason, "missing_offer_token");
  assert.strictEqual(diagnostics.rejectionReason, "missing_offer_token");
}

{
  const baseOnly = diagnoseGooglePlaySubscriptionOffers(product([monthlyBasePlan]));
  assert.strictEqual(baseOnly.rejectionReason, "offer_not_returned");
  assert.strictEqual(baseOnly.introductoryOfferStatus, "absent");
  assert.strictEqual(baseOnly.introductoryOfferReturned, false);
  const noOffers = diagnoseGooglePlaySubscriptionOffers(product([]));
  assert.strictEqual(noOffers.rejectionReason, "offer_not_returned");
}

{
  const differentOffer = { ...introOffer, offerId: "different-intro" };
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(product([monthlyBasePlan, differentOffer]));
  assert.strictEqual(diagnostics.rejectionReason, "offer_not_returned");
  assert.strictEqual(diagnostics.offers[1].rejectionReason, "wrong_offer_id");
}

function withIntroPhase(overrides, index = 0) {
  return {
    ...introOffer,
    pricingPhases: {
      pricingPhaseList: introOffer.pricingPhases.pricingPhaseList.map((item, phaseIndex) => (
        phaseIndex === index ? { ...item, ...overrides } : { ...item }
      )),
    },
  };
}

// Every fail-closed check reports the same reason used by the actual selector.
const invalidIntroCases = [
  [withIntroPhase({ recurrenceMode: 2, billingCycleCount: 2 }), "wrong_recurrence", "intro_single_charge", 0],
  [withIntroPhase({ recurrenceMode: 2, billingCycleCount: 0 }), "wrong_recurrence", "intro_single_charge", 0],
  [withIntroPhase({ recurrenceMode: 3, billingCycleCount: 1 }), "wrong_recurrence", "intro_single_charge", 0],
  [withIntroPhase({ recurrenceMode: 1 }), "wrong_recurrence", "intro_single_charge", 0],
  [withIntroPhase({ billingPeriod: "P1D" }), "wrong_period", "intro_period_p3d", 0],
  [withIntroPhase({ billingPeriod: "P1W" }, 1), "wrong_period", "renewal_period_p1m", 1],
  [withIntroPhase({ recurrenceMode: 3 }, 1), "wrong_recurrence", "renewal_infinite_monthly", 1],
  [withIntroPhase({ recurrenceMode: 2, billingCycleCount: 1 }, 1), "wrong_recurrence", "renewal_infinite_monthly", 1],
  [withIntroPhase({ priceCurrencyCode: "USD" }, 1), "currency_mismatch", "consistent_currency", 1],
  [withIntroPhase({ priceAmountMicros: "499000000" }), "intro_not_discounted", "intro_below_renewal", 0],
  [{ ...introOffer, offerToken: " " }, "missing_offer_token", "offer_token_present", null],
  [{ ...introOffer, basePlanId: "annual" }, "wrong_base_plan", "base_plan_identity", null],
  [{ ...introOffer, pricingPhases: { pricingPhaseList: [...introOffer.pricingPhases.pricingPhaseList, ...introOffer.pricingPhases.pricingPhaseList] } }, "wrong_phase_count", "phase_count", null],
];
for (const invalidValue of [undefined, null, "", " ", false, "0", -1, 0.5, NaN]) {
  invalidIntroCases.push([withIntroPhase({ billingCycleCount: invalidValue }), "invalid_recurrence_fields", "recurrence_fields", 0]);
  invalidIntroCases.push([withIntroPhase({ recurrenceMode: invalidValue }), "invalid_recurrence_fields", "recurrence_fields", 0]);
  invalidIntroCases.push([withIntroPhase({ billingCycleCount: invalidValue }, 1), "invalid_recurrence_fields", "recurrence_fields", 1]);
  invalidIntroCases.push([withIntroPhase({ recurrenceMode: invalidValue }, 1), "invalid_recurrence_fields", "recurrence_fields", 1]);
}
for (const invalidValue of [undefined, null, "", " ", false, 0, "0", -1, 0.5, "NaN", "1e6", Number.MAX_SAFE_INTEGER + 1]) {
  invalidIntroCases.push([withIntroPhase({ priceAmountMicros: invalidValue }), "invalid_price", "positive_price_micros", 0]);
}
for (const invalidValue of [undefined, null, "", " ", false, "inr", "RUPEES"]) {
  invalidIntroCases.push([withIntroPhase({ priceCurrencyCode: invalidValue }), "invalid_currency", "currency_code", 0]);
}
for (const [invalidIntro, reason, check, index] of invalidIntroCases) {
  const returned = product([monthlyBasePlan, invalidIntro]);
  const result = normalizeGooglePlaySubscriptionOffers(returned);
  assert.strictEqual(result.introductoryOffer, null, check);
  assert.strictEqual(result.purchaseOffer.offerToken, monthlyBasePlan.offerToken, check);
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(returned);
  assert.strictEqual(diagnostics.introductoryOfferStatus, "rejected", check);
  assert.strictEqual(diagnostics.introductoryOfferReturned, true, check);
  assert.strictEqual(diagnostics.rejectionReason, reason, check);
  assert.strictEqual(diagnostics.offers[1].failedValidationCheck, check);
  assert.strictEqual(diagnostics.offers[1].failedPhaseIndex, index, check);
}

// Native number fields must not acquire valid zeroes through coercion.
for (const field of ["billingCycleCount", "recurrenceMode"]) {
  const invalidIntro = withIntroPhase({ [field]: null });
  assert.strictEqual(diagnoseGooglePlaySubscriptionOffers(product([invalidIntro])).offers[0].phases[0][field], null);
}

{
  for (const returned of [
    { ...product([introOffer]), id: undefined },
    { ...product([introOffer]), id: "different.product" },
    { ...product([introOffer]), productId: "conflicting.product" },
    { ...product([introOffer]), platform: "ios" },
  ]) {
    assert.strictEqual(normalizeGooglePlaySubscriptionOffers(returned).purchaseOffer, null);
    assert.strictEqual(diagnoseGooglePlaySubscriptionOffers(returned).rejectionReason, "wrong_product_id");
  }
  const configured = { ...product([introOffer]), id: "configured.product" };
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers(configured, "intro-9rs-3days", "configured.product")
    .purchaseOffer.offerToken, introOffer.offerToken);
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers({ ...product([introOffer]), currency: "USD" }).purchaseOffer, null);
}

function standardized(offer) {
  return {
    id: offer.offerId || offer.basePlanId,
    basePlanIdAndroid: offer.basePlanId,
    offerTokenAndroid: offer.offerToken,
    pricingPhasesAndroid: offer.pricingPhases,
  };
}

// Both fields describe the same native response. A valid alias must not conceal
// extra charges for the same returned token in the other representation.
{
  const finiteIntro = withIntroPhase({ recurrenceMode: 2, billingCycleCount: 1 });
  const extraCharge = withIntroPhase({ recurrenceMode: 2, billingCycleCount: 2 });
  const conflicting = {
    ...product([monthlyBasePlan, extraCharge]),
    subscriptionOffers: [standardized(finiteIntro)],
  };
  const result = normalizeGooglePlaySubscriptionOffers(conflicting);
  assert.strictEqual(result.introductoryOffer, null,
    "Conflicting phase metadata for the same Google token must not advertise a single-charge intro");
  assert.strictEqual(result.purchaseOffer.offerToken, monthlyBasePlan.offerToken);
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(conflicting);
  assert.strictEqual(diagnostics.introductoryOfferStatus, "rejected");
  assert(diagnostics.offers.some(offer => offer.rejectionReason === "conflicting_offer_metadata"));
  assert(diagnostics.offers.some(offer => offer.failedValidationCheck === "matching_token_phase_terms"));
  const identical = {
    ...product([finiteIntro]), subscriptionOffers: [standardized(finiteIntro)],
  };
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers(identical).purchaseOffer.offerToken, finiteIntro.offerToken);
  // A lossless numeric/string micros mapping is not a terms conflict.
  const stringMicros = {
    ...finiteIntro,
    pricingPhases: { pricingPhaseList: finiteIntro.pricingPhases.pricingPhaseList.map(item => ({
      ...item, priceAmountMicros: String(item.priceAmountMicros),
    })) },
  };
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers({
    ...identical, subscriptionOffers: [standardized(stringMicros)],
  }).purchaseOffer.offerToken, finiteIntro.offerToken);
  const priceConflict = {
    ...product([monthlyBasePlan, introOffer]),
    subscriptionOffers: [standardized(withIntroPhase({ priceAmountMicros: 10000000, formattedPrice: "₹10.00" }))],
  };
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers(priceConflict).introductoryOffer, null);
  assert.strictEqual(diagnoseGooglePlaySubscriptionOffers(priceConflict).rejectionReason, "conflicting_offer_metadata");
}

{
  const finiteIntro = withIntroPhase({ recurrenceMode: 2, billingCycleCount: 1 });
  const returned = { ...product([]), subscriptionOffers: [standardized(monthlyBasePlan), standardized(finiteIntro)] };
  const result = normalizeGooglePlaySubscriptionOffers(returned);
  assert.strictEqual(result.purchaseOffer.offerId, "intro-9rs-3days");
  assert.strictEqual(result.purchaseOffer.offerToken, finiteIntro.offerToken);
  const entries = readGooglePlaySubscriptionOfferEntries(returned);
  assert.strictEqual(entries[1].offer, returned.subscriptionOffers[1]);
  assert.strictEqual(entries[1].phases, finiteIntro.pricingPhases.pricingPhaseList);
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(returned);
  assert.deepStrictEqual(diagnostics.returnedOfferCountsByShape, { subscriptionOfferDetailsAndroid: 0, subscriptionOffers: 2 });
  assert.strictEqual(diagnostics.offers[0].offerId, null);
  assert.strictEqual(diagnostics.offers[0].returnedOfferId, "monthly");
  assert.strictEqual(diagnostics.offers[1].shape, "subscriptionOffers");
  assert.strictEqual(diagnostics.offers[1].oldValidatorAccepted, false);
  const base = normalizeGooglePlaySubscriptionOffers({ ...returned, subscriptionOffers: [standardized(monthlyBasePlan)] });
  assert.strictEqual(base.purchaseOffer.offerToken, monthlyBasePlan.offerToken);
  assert.strictEqual(base.purchaseOffer.offerId, null);
  for (const id of [undefined, null, "", " "]) {
    assert.strictEqual(normalizeGooglePlaySubscriptionOffers({
      ...returned, subscriptionOffers: [{ ...standardized(monthlyBasePlan), id }],
    }).purchaseOffer, null);
  }
  const mixed = { ...product([monthlyBasePlan]), subscriptionOffers: [standardized(finiteIntro)] };
  assert.strictEqual(normalizeGooglePlaySubscriptionOffers(mixed).purchaseOffer.offerToken, finiteIntro.offerToken);
  for (const [invalidIntro, reason] of invalidIntroCases) {
    const malformed = { ...product([]), subscriptionOffers: [standardized(invalidIntro)] };
    assert.strictEqual(normalizeGooglePlaySubscriptionOffers(malformed).purchaseOffer, null);
    assert.strictEqual(diagnoseGooglePlaySubscriptionOffers(malformed).rejectionReason, reason);
  }
}

{
  const result = normalizeGooglePlaySubscriptionOffers(product([introOffer]));
  const rotatedToken = { ...introOffer, offerToken: "FAKE_UNIT_TEST_ROTATED_TOKEN" };
  assert.strictEqual(result.purchaseOffer.termsKey,
    normalizeGooglePlaySubscriptionOffers(product([rotatedToken])).purchaseOffer.termsKey);
  const differentPrice = withIntroPhase({ priceAmountMicros: "12000000", formattedPrice: "₹12.00" });
  assert.notStrictEqual(result.purchaseOffer.termsKey,
    normalizeGooglePlaySubscriptionOffers(product([differentPrice])).purchaseOffer.termsKey);
  const privateMarker = "FAKE_PRIVATE_FIELD_MUST_NOT_APPEAR";
  const polluted = {
    ...product([{ ...introOffer, offerToken: privateMarker, userId: privateMarker }]),
    purchaseToken: privateMarker, accountHash: privateMarker, credentials: privateMarker,
  };
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(polluted);
  assert.strictEqual(diagnostics.offers[0].offerTokenPresent, true);
  assert.strictEqual(diagnostics.offers[0].oldValidatorAccepted, true);
  assert(!JSON.stringify(diagnostics).includes(privateMarker));
}

{
  const hookSource = fs.readFileSync(
    path.join(__dirname, "../services/useGooglePlaySubscriptions.js"),
    "utf8",
  );
  assert.match(hookSource, /product \? "not_returned" : "unknown"/);
  assert.doesNotMatch(hookSource, /product \? "ineligible" : "unknown"/);
}

console.log(`Google Play subscription offer regression tests passed (${invalidIntroCases.length} rejection cases checked in both supported shapes).`);
