const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  diagnoseGooglePlaySubscriptionOffers,
  normalizeGooglePlaySubscriptionOffers,
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
  offerToken: "base-token-from-google",
  pricingPhases: {
    pricingPhaseList: [
      phase({ period: "P1M", price: "₹499.00", micros: 499000000, cycles: 0, recurrence: 1 }),
    ],
  },
};

const introOffer = {
  basePlanId: "monthly",
  offerId: "intro-9rs-3days",
  offerToken: "intro-token-from-google",
  pricingPhases: {
    pricingPhaseList: [
      phase({ period: "P3D", price: "₹9.00", micros: 9000000, cycles: 0, recurrence: 3 }),
      phase({ period: "P1M", price: "₹499.00", micros: 499000000, cycles: 0, recurrence: 1 }),
    ],
  },
};

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
  assert.strictEqual(result.purchaseOffer.offerToken, "intro-token-from-google");
  assert.strictEqual(result.purchaseOffer.offerId, "intro-9rs-3days");
}

{
  const result = normalizeGooglePlaySubscriptionOffers(product([monthlyBasePlan]));
  assert.strictEqual(result.introductoryOffer, null);
  assert.strictEqual(result.purchaseOffer.offerToken, "base-token-from-google");
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
  assert.strictEqual(result.purchaseOffer.offerToken, "base-token-from-google");
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
  assert.strictEqual(baseOnly.rejectionReason, "account_not_eligible_or_offer_unavailable");
  const noOffers = diagnoseGooglePlaySubscriptionOffers(product([]));
  assert.strictEqual(noOffers.rejectionReason, "offer_not_returned");
}

{
  const differentOffer = { ...introOffer, offerId: "different-intro" };
  const diagnostics = diagnoseGooglePlaySubscriptionOffers(product([monthlyBasePlan, differentOffer]));
  assert.strictEqual(diagnostics.rejectionReason, "wrong_offer_id");
}

{
  const hookSource = fs.readFileSync(
    path.join(__dirname, "../services/useGooglePlaySubscriptions.js"),
    "utf8",
  );
  assert.match(hookSource, /product \? "not_returned" : "unknown"/);
  assert.doesNotMatch(hookSource, /product \? "ineligible" : "unknown"/);
}

console.log("Google Play subscription offer regression tests passed.");
