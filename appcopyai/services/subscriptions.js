const PREMIUM_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  ACTIVE_CANCELS_AT_PERIOD_END: "ACTIVE_CANCELS_AT_PERIOD_END",
  GRACE_PERIOD: "GRACE_PERIOD",
  BILLING_RETRY: "BILLING_RETRY",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  REFUNDED: "REFUNDED",
  NONE: "NONE",
  UNKNOWN: "UNKNOWN",
});

const APPLE_SUBSCRIPTION_PRODUCT_IDS = Object.freeze({
  monthly: "com.skillomate.premium.monthly",
});

const GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS = Object.freeze({
  monthly: "skillomate_premium_monthly",
});

const GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS = Object.freeze({
  introductory: "intro-9rs-3days",
});

const ACCESS_STATES = new Set([
  PREMIUM_STATES.ACTIVE,
  PREMIUM_STATES.ACTIVE_CANCELS_AT_PERIOD_END,
  PREMIUM_STATES.GRACE_PERIOD,
]);

function normalizedPositiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizedPeriodUnit(value) {
  const unit = String(value || "").trim().toLowerCase();
  return ["day", "week", "month", "year"].includes(unit) ? unit : "month";
}

function periodLabel(value, unit) {
  const count = normalizedPositiveInteger(value);
  const normalizedUnit = normalizedPeriodUnit(unit);
  return `${count === 1 ? "" : `${count} `}${normalizedUnit}${count === 1 ? "" : "s"}`;
}

function parseGoogleBillingPeriod(value) {
  const match = String(value || "").toUpperCase().match(/^P(\d+)([DWMY])$/);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) return null;
  const units = { D: "day", W: "week", M: "month", Y: "year" };
  return { value: normalizedPositiveInteger(match[1]), unit: units[match[2]] || "month" };
}

// react-native-iap 14.7.20 exposes both the Android detail array and the
// standardized offers. Preserve raw entries for diagnostics; never log this
// helper's result, which includes the Google-returned purchase token.
function readGooglePlaySubscriptionOfferEntries(product) {
  const entries = [];
  for (const shape of ["subscriptionOfferDetailsAndroid", "subscriptionOffers"]) {
    const offers = Array.isArray(product?.[shape]) ? product[shape] : [];
    for (const offer of offers) {
      const standardized = shape === "subscriptionOffers";
      const basePlanId = standardized ? offer?.basePlanIdAndroid : offer?.basePlanId;
      const returnedOfferId = standardized ? offer?.id : offer?.offerId;
      // OpenIAP uses the base-plan ID as the standardized ID for base offers.
      const offerId = standardized && returnedOfferId === basePlanId ? null : returnedOfferId;
      const pricingPhases = standardized ? offer?.pricingPhasesAndroid : offer?.pricingPhases;
      entries.push({
        shape, offer, basePlanId, offerId, returnedOfferId,
        offerToken: standardized ? offer?.offerTokenAndroid : offer?.offerToken,
        phases: Array.isArray(pricingPhases?.pricingPhaseList) ? pricingPhases.pricingPhaseList : [],
      });
    }
  }
  return entries;
}

function googlePlayProductMatches(product, expectedProductId) {
  const identifiers = [product?.id, product?.productId].filter(value => value !== undefined && value !== null);
  return typeof expectedProductId === "string" && Boolean(expectedProductId.trim())
    && identifiers.length > 0 && identifiers.every(value => value === expectedProductId)
    && (!product?.platform || product.platform === "android");
}

function googlePlayPriceMicros(value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function googlePlayPhaseTermsKey(phases) {
  // Only compare billing fields, never raw objects or tokens. Android and the
  // standardized alias may represent micros as a number or decimal string.
  return JSON.stringify(phases.map(phase => [
    typeof phase?.billingPeriod === "string" ? phase.billingPeriod : null,
    Number.isSafeInteger(phase?.recurrenceMode) ? phase.recurrenceMode : null,
    Number.isSafeInteger(phase?.billingCycleCount) ? phase.billingCycleCount : null,
    typeof phase?.priceCurrencyCode === "string" ? phase.priceCurrencyCode : null,
    googlePlayPriceMicros(phase?.priceAmountMicros),
    typeof phase?.formattedPrice === "string" ? phase.formattedPrice : null,
  ]));
}

function validateGooglePlayOffer(entry, product, preferredIntroductoryOfferId, expectedProductId, entries) {
  const fail = (rejectionReason, failedValidationCheck, failedPhaseIndex = null) => ({
    rejectionReason, failedValidationCheck, failedPhaseIndex, phases: null,
  });
  if (!googlePlayProductMatches(product, expectedProductId)) return fail("wrong_product_id", "product_identity");
  if (entry.basePlanId !== "monthly") return fail("wrong_base_plan", "base_plan_identity");
  if (entry.shape === "subscriptionOffers" && (typeof entry.returnedOfferId !== "string"
    || !entry.returnedOfferId.trim())) return fail("wrong_offer_id", "offer_identity");
  const isIntro = typeof preferredIntroductoryOfferId === "string" && Boolean(preferredIntroductoryOfferId.trim())
    && entry.offerId === preferredIntroductoryOfferId;
  if (entry.offerId !== undefined && entry.offerId !== null && !isIntro) return fail("wrong_offer_id", "offer_identity");
  if (typeof entry.offerToken !== "string" || !entry.offerToken.trim()) return fail("missing_offer_token", "offer_token_present");
  if (entry.phases.length !== (isIntro ? 2 : 1)) return fail("wrong_phase_count", "phase_count");
  const phases = [];
  for (const [index, phase] of entry.phases.entries()) {
    if (!phase || typeof phase !== "object") return fail("invalid_phase", "phase_object", index);
    const amountMicros = googlePlayPriceMicros(phase.priceAmountMicros);
    if (amountMicros === null) return fail("invalid_price", "positive_price_micros", index);
    if (typeof phase.formattedPrice !== "string" || !phase.formattedPrice.trim()) return fail("missing_formatted_price", "formatted_price", index);
    if (typeof phase.priceCurrencyCode !== "string" || !/^[A-Z]{3}$/.test(phase.priceCurrencyCode)) return fail("invalid_currency", "currency_code", index);
    if (index > 0 && phase.priceCurrencyCode !== phases[0].priceCurrencyCode) return fail("currency_mismatch", "consistent_currency", index);
    if (typeof product.currency === "string" && product.currency && phase.priceCurrencyCode !== product.currency) return fail("currency_mismatch", "product_currency", index);
    const period = parseGoogleBillingPeriod(phase.billingPeriod);
    const introPhase = isIntro && index === 0;
    if (!period || phase.billingPeriod !== (introPhase ? "P3D" : "P1M")) return fail("wrong_period", introPhase ? "intro_period_p3d" : "renewal_period_p1m", index);
    // Do not coerce missing/null/blank values to zero. Both native fields are numbers.
    if (![1, 2, 3].includes(phase.recurrenceMode) || !Number.isSafeInteger(phase.billingCycleCount)
      || phase.billingCycleCount < 0) return fail("invalid_recurrence_fields", "recurrence_fields", index);
    const onePayment = (phase.recurrenceMode === 2 && phase.billingCycleCount === 1)
      || (phase.recurrenceMode === 3 && phase.billingCycleCount === 0);
    if (introPhase ? !onePayment : phase.recurrenceMode !== 1 || phase.billingCycleCount !== 0) {
      return fail("wrong_recurrence", introPhase ? "intro_single_charge" : "renewal_infinite_monthly", index);
    }
    phases.push({ ...phase, amountMicros, period });
  }
  if (isIntro && phases[0].amountMicros >= phases[1].amountMicros) return fail("intro_not_discounted", "intro_below_renewal", 0);
  const phaseTerms = googlePlayPhaseTermsKey(entry.phases);
  if (entries.some(other => other !== entry && other.basePlanId === entry.basePlanId
    && (other.offerId ?? null) === (entry.offerId ?? null) && other.offerToken === entry.offerToken
    && googlePlayPhaseTermsKey(other.phases) !== phaseTerms)) {
    return fail("conflicting_offer_metadata", "matching_token_phase_terms");
  }
  return { rejectionReason: null, failedValidationCheck: null, failedPhaseIndex: null, phases };
}

function normalizeGooglePlaySubscriptionOffers(
  product,
  preferredIntroductoryOfferId = GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory,
  expectedProductId = GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly,
) {
  const entries = readGooglePlaySubscriptionOfferEntries(product);
  const normalized = entries.map(entry => {
    const validation = validateGooglePlayOffer(entry, product, preferredIntroductoryOfferId, expectedProductId, entries);
    return validation.rejectionReason ? null : { ...entry, phases: validation.phases };
  }).filter(Boolean);
  const baseOffer = normalized.find(offer => offer.offerId == null) || null;
  const introductory = normalized.find(offer => offer.offerId === preferredIntroductoryOfferId) || null;
  const selected = introductory || baseOffer;
  const recurringPhase = selected?.phases?.[selected.phases.length - 1] || null;
  const introductoryPhase = introductory?.phases?.[0] || null;
  const recurring = recurringPhase ? {
    localizedPrice: recurringPhase.formattedPrice,
    period: periodLabel(recurringPhase.period.value, recurringPhase.period.unit),
    periodUnit: recurringPhase.period.unit,
    periodValue: recurringPhase.period.value,
  } : null;
  const introductoryOffer = introductory && introductoryPhase ? {
    basePlanId: introductory.basePlanId,
    displayText: `${introductoryPhase.formattedPrice} for the first ${periodLabel(introductoryPhase.period.value, introductoryPhase.period.unit)}`,
    localizedPrice: introductoryPhase.formattedPrice,
    offerId: introductory.offerId,
    offerToken: introductory.offerToken,
    periodCount: 1,
    periodUnit: introductoryPhase.period.unit,
    periodValue: introductoryPhase.period.value,
  } : null;
  return {
    introductoryOffer,
    purchaseOffer: selected ? {
      basePlanId: selected.basePlanId,
      offerId: selected.offerId || null,
      offerToken: selected.offerToken,
      // Compare the actual terms before checkout, without treating a rotated
      // Google token as a price change. Never send this key to Google.
      termsKey: JSON.stringify({
        basePlanId: selected.basePlanId,
        offerId: selected.offerId || null,
        phases: selected.phases.map(phase => ({
          amountMicros: phase.amountMicros,
          currency: phase.priceCurrencyCode,
          formattedPrice: phase.formattedPrice,
          period: phase.period,
          billingCycleCount: phase.billingCycleCount,
          recurrenceMode: phase.recurrenceMode,
        })),
      }),
    } : null,
    recurring,
  };
}

function googlePlayPhaseDiagnostic(phase) {
  if (!phase || typeof phase !== "object") return null;
  return {
    billingPeriod: typeof phase.billingPeriod === "string" ? phase.billingPeriod : null,
    formattedPrice: typeof phase.formattedPrice === "string" ? phase.formattedPrice : null,
    priceCurrencyCode: typeof phase.priceCurrencyCode === "string" ? phase.priceCurrencyCode : null,
    billingCycleCount: Number.isSafeInteger(phase.billingCycleCount) ? phase.billingCycleCount : null,
    recurrenceMode: Number.isSafeInteger(phase.recurrenceMode) ? phase.recurrenceMode : null,
    period: parseGoogleBillingPeriod(phase.billingPeriod),
  };
}

// Mirrors the VC20 introductory selector only for sanitized before/after evidence.
// No purchase decision uses this legacy check.
function oldGooglePlayIntroValidatorAccepted(entry, preferredIntroductoryOfferId) {
  if (entry.shape !== "subscriptionOfferDetailsAndroid" || entry.basePlanId !== "monthly"
    || entry.offerId !== preferredIntroductoryOfferId || entry.phases.length !== 2
    || typeof entry.offerToken !== "string" || !entry.offerToken.trim()) return false;
  if (entry.phases.some(phase => !phase || typeof phase !== "object"
    || !Number.isFinite(Number(phase.priceAmountMicros)) || Number(phase.priceAmountMicros) < 0
    || typeof phase.formattedPrice !== "string" || !phase.formattedPrice.trim())) return false;
  const [first, last] = entry.phases;
  const firstPeriod = parseGoogleBillingPeriod(first.billingPeriod);
  const lastPeriod = parseGoogleBillingPeriod(last.billingPeriod);
  return Number(first.priceAmountMicros) > 0 && Number(first.priceAmountMicros) < Number(last.priceAmountMicros)
    && firstPeriod?.value === 3 && firstPeriod?.unit === "day"
    && first.recurrenceMode === 3 && first.billingCycleCount === 0
    && lastPeriod?.value === 1 && lastPeriod?.unit === "month"
    && last.recurrenceMode === 1 && last.billingCycleCount === 0;
}

function diagnoseGooglePlaySubscriptionOffers(
  product,
  preferredIntroductoryOfferId = GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory,
  expectedProductId = GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS.monthly,
) {
  const entries = readGooglePlaySubscriptionOfferEntries(product);
  const normalized = normalizeGooglePlaySubscriptionOffers(product, preferredIntroductoryOfferId, expectedProductId);
  const selectedBasePlanId = normalized.purchaseOffer?.basePlanId || null;
  const selectedOfferId = normalized.purchaseOffer?.offerId || null;
  const productId = typeof product?.id === "string" ? product.id
    : typeof product?.productId === "string" ? product.productId : null;
  const offers = entries.map(entry => {
    const validation = validateGooglePlayOffer(entry, product, preferredIntroductoryOfferId, expectedProductId, entries);
    const phases = entry.phases.map(googlePlayPhaseDiagnostic);
    return {
      shape: entry.shape,
      basePlanId: typeof entry.basePlanId === "string" ? entry.basePlanId : null,
      offerId: typeof entry.offerId === "string" ? entry.offerId : null,
      returnedOfferId: typeof entry.returnedOfferId === "string" ? entry.returnedOfferId : null,
      phases,
      offerTokenPresent: typeof entry.offerToken === "string" && Boolean(entry.offerToken.trim()),
      rejectionReason: validation.rejectionReason,
      failedValidationCheck: validation.failedValidationCheck,
      failedPhaseIndex: validation.failedPhaseIndex,
      oldValidatorAccepted: oldGooglePlayIntroValidatorAccepted(entry, preferredIntroductoryOfferId),
      selectedBasePlanId,
      selectedOfferId,
    };
  });
  const preferred = offers.find(offer => offer.offerId === preferredIntroductoryOfferId);
  return {
    productId,
    configuredProductId: expectedProductId,
    configuredBasePlanId: "monthly",
    configuredIntroductoryOfferId: preferredIntroductoryOfferId,
    returnedSubscriptionOfferCount: entries.length,
    returnedOfferCountsByShape: {
      subscriptionOfferDetailsAndroid: entries.filter(entry => entry.shape === "subscriptionOfferDetailsAndroid").length,
      subscriptionOffers: entries.filter(entry => entry.shape === "subscriptionOffers").length,
    },
    introductoryOfferReturned: Boolean(preferred),
    introductoryOfferStatus: normalized.introductoryOffer ? "selected" : preferred ? "rejected" : "absent",
    selectedBasePlanId,
    selectedOfferId,
    // Absence does not establish whether account history, availability or the
    // native bridge caused the missing offer. Report only the observed fact.
    rejectionReason: normalized.introductoryOffer ? null : preferred?.rejectionReason || "offer_not_returned",
    offers,
  };
}

function validFutureTimestamp(value, serverNow = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > Number(serverNow);
}

function normalizeEntitlement(input, serverNow = Date.now()) {
  if (!input || typeof input !== "object") {
    return { state: PREMIUM_STATES.NONE, active: false, expiresAt: null };
  }

  const state = Object.values(PREMIUM_STATES).includes(input.entitlementState)
    ? input.entitlementState
    : PREMIUM_STATES.UNKNOWN;
  const expiresAt = state === PREMIUM_STATES.GRACE_PERIOD
    ? input.gracePeriodExpiresAt || null
    : input.expiresAt || input.subscriptionExpiry || input.currentPeriodEnd || null;
  const serverSaysActive = input.entitlementActive === true;
  const timeLimitedState = ACCESS_STATES.has(state);
  const active = serverSaysActive && timeLimitedState && validFutureTimestamp(expiresAt, serverNow);

  return { state, active, expiresAt };
}

function hasActivePremiumEntitlement(userOrSubscription, serverNow = Date.now()) {
  if (userOrSubscription?.entitlementState) {
    return normalizeEntitlement(userOrSubscription, serverNow).active;
  }

  // Backward compatibility for existing verified web/Android subscriptions. Explicitly
  // allow only known paid states and always honor an expiry when one is present.
  const status = String(userOrSubscription?.subscriptionStatus || "none").trim().toLowerCase();
  const expiry = userOrSubscription?.subscriptionExpiry;
  if (!["active", "subscribed", "trial", "1rs trial"].includes(status)) return false;
  return expiry ? validFutureTimestamp(expiry, serverNow) : ["active", "subscribed"].includes(status);
}

module.exports = {
  ACCESS_STATES,
  APPLE_SUBSCRIPTION_PRODUCT_IDS,
  GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS,
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS,
  PREMIUM_STATES,
  diagnoseGooglePlaySubscriptionOffers,
  hasActivePremiumEntitlement,
  normalizeGooglePlaySubscriptionOffers,
  readGooglePlaySubscriptionOfferEntries,
  normalizeEntitlement,
  periodLabel,
  validFutureTimestamp,
};
