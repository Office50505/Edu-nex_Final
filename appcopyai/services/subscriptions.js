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

function normalizeGooglePlaySubscriptionOffers(
  product,
  preferredIntroductoryOfferId = GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory,
) {
  if (!product || typeof product !== "object") {
    return { introductoryOffer: null, purchaseOffer: null, recurring: null };
  }
  const offers = Array.isArray(product.subscriptionOfferDetailsAndroid)
    ? product.subscriptionOfferDetailsAndroid
    : [];
  const normalized = offers
    .map(offer => {
      if (offer?.basePlanId !== "monthly") return null;
      const phases = Array.isArray(offer?.pricingPhases?.pricingPhaseList)
        ? offer.pricingPhases.pricingPhaseList
        : [];
      if (typeof offer?.offerToken !== "string" || !offer.offerToken.trim() || !phases.length) return null;
      const normalizedPhases = phases.map(phase => {
        if (!phase || typeof phase !== "object") return null;
        const amountMicros = Number(phase.priceAmountMicros);
        const period = parseGoogleBillingPeriod(phase.billingPeriod);
        if (!Number.isFinite(amountMicros) || amountMicros < 0 || !period
          || typeof phase.formattedPrice !== "string" || !phase.formattedPrice.trim()) return null;
        return { ...phase, amountMicros, period };
      });
      if (normalizedPhases.some(phase => !phase)) return null;
      return { ...offer, phases: normalizedPhases };
    })
    .filter(Boolean);

  const isMonthlyRecurringPhase = phase => phase.amountMicros > 0
    && phase.period.value === 1 && phase.period.unit === "month"
    && phase.recurrenceMode === 1 && phase.billingCycleCount === 0;
  const baseOffer = normalized.find(offer => !offer.offerId
    && offer.phases.length === 1 && isMonthlyRecurringPhase(offer.phases[0])) || null;
  const introductory = normalized.find(offer => {
    if (offer.offerId !== preferredIntroductoryOfferId || offer.phases.length !== 2) return false;
    const first = offer.phases[0];
    const last = offer.phases[1];
    // Play's confirmed offer is one paid, non-recurring P3D phase followed
    // by the auto-renewing monthly base plan. Amounts remain store-localized.
    const onePayment = first.billingCycleCount === 0 && first.recurrenceMode === 3;
    return first.amountMicros > 0
      && first.amountMicros < last.amountMicros
      && first.period.value === 3
      && first.period.unit === "day"
      && onePayment
      && isMonthlyRecurringPhase(last);
  }) || null;
  const selected = introductory || baseOffer;
  const recurringPhase = selected?.phases?.[selected.phases.length - 1] || null;
  const introductoryPhase = introductory?.phases?.[0] || null;
  const recurring = recurringPhase ? {
    localizedPrice: recurringPhase.formattedPrice || product.displayPrice || "",
    period: periodLabel(recurringPhase.period.value, recurringPhase.period.unit),
    periodUnit: recurringPhase.period.unit,
    periodValue: recurringPhase.period.value,
  } : null;
  const introductoryOffer = introductory && introductoryPhase ? {
    basePlanId: introductory.basePlanId || null,
    displayText: `${introductoryPhase.formattedPrice} for the first ${periodLabel(introductoryPhase.period.value, introductoryPhase.period.unit)}`,
    localizedPrice: introductoryPhase.formattedPrice || "",
    offerId: introductory.offerId || null,
    offerToken: introductory.offerToken,
    periodCount: normalizedPositiveInteger(introductoryPhase.billingCycleCount),
    periodUnit: introductoryPhase.period.unit,
    periodValue: introductoryPhase.period.value,
  } : null;
  return {
    introductoryOffer,
    purchaseOffer: selected ? {
      basePlanId: selected.basePlanId || null,
      offerId: selected.offerId || null,
      offerToken: selected.offerToken,
      // Compare the actual terms before checkout, without treating a rotated
      // Google token as a price change. Never send this key to Google.
      termsKey: JSON.stringify({
        basePlanId: selected.basePlanId,
        offerId: selected.offerId || null,
        phases: selected.phases.map(phase => ({
          amountMicros: phase.amountMicros,
          currency: phase.priceCurrencyCode || product.currency || null,
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
  const period = parseGoogleBillingPeriod(phase.billingPeriod);
  return {
    billingPeriod: phase.billingPeriod || null,
    formattedPrice: phase.formattedPrice || null,
    billingCycleCount: Number.isFinite(Number(phase.billingCycleCount)) ? Number(phase.billingCycleCount) : null,
    recurrenceMode: Number.isFinite(Number(phase.recurrenceMode)) ? Number(phase.recurrenceMode) : null,
    period,
  };
}

function diagnoseGooglePlaySubscriptionOffers(
  product,
  preferredIntroductoryOfferId = GOOGLE_PLAY_SUBSCRIPTION_OFFER_IDS.introductory,
) {
  const offers = Array.isArray(product?.subscriptionOfferDetailsAndroid)
    ? product.subscriptionOfferDetailsAndroid
    : [];
  const productId = product?.id || product?.productId || null;
  const diagnostics = offers.map(offer => {
    const phases = Array.isArray(offer?.pricingPhases?.pricingPhaseList)
      ? offer.pricingPhases.pricingPhaseList
      : [];
    const introPhase = googlePlayPhaseDiagnostic(phases[0]);
    const renewalPhase = googlePlayPhaseDiagnostic(phases[phases.length - 1]);
    let rejectionReason = null;
    if (offer?.offerId && offer.offerId !== preferredIntroductoryOfferId) rejectionReason = "wrong_offer_id";
    else if (offer?.basePlanId !== "monthly") rejectionReason = "wrong_base_plan";
    else if (offer?.offerId === preferredIntroductoryOfferId) {
      if (phases.length !== 2) rejectionReason = "wrong_phase_count";
      else if (!introPhase?.period || introPhase.period.value !== 3 || introPhase.period.unit !== "day"
        || !renewalPhase?.period || renewalPhase.period.value !== 1 || renewalPhase.period.unit !== "month") {
        rejectionReason = "wrong_period";
      } else if (introPhase.recurrenceMode !== 3 || introPhase.billingCycleCount !== 0
        || renewalPhase.recurrenceMode !== 1 || renewalPhase.billingCycleCount !== 0) {
        rejectionReason = "wrong_recurrence";
      } else if (typeof offer?.offerToken !== "string" || !offer.offerToken.trim()) {
        rejectionReason = "missing_offer_token";
      }
    }
    return {
      productId,
      configuredIntroductoryOfferId: preferredIntroductoryOfferId,
      returnedSubscriptionOfferCount: offers.length,
      basePlanId: offer?.basePlanId || null,
      offerId: offer?.offerId || null,
      introductoryPhaseBillingPeriod: introPhase?.billingPeriod || null,
      introductoryPhaseFormattedPrice: introPhase?.formattedPrice || null,
      billingCycleCount: introPhase?.billingCycleCount,
      recurrenceMode: introPhase?.recurrenceMode,
      offerTokenPresent: typeof offer?.offerToken === "string" && Boolean(offer.offerToken.trim()),
      selectedBasePlanId: null,
      selectedOfferId: null,
      rejectionReason,
    };
  });
  const normalized = normalizeGooglePlaySubscriptionOffers(product, preferredIntroductoryOfferId);
  const selectedBasePlanId = normalized.purchaseOffer?.basePlanId || null;
  const selectedOfferId = normalized.purchaseOffer?.offerId || null;
  return {
    productId,
    configuredIntroductoryOfferId: preferredIntroductoryOfferId,
    returnedSubscriptionOfferCount: offers.length,
    selectedBasePlanId,
    selectedOfferId,
    rejectionReason: normalized.introductoryOffer
      ? null
      : (offers.length ? "account_not_eligible_or_offer_unavailable" : "offer_not_returned"),
    offers: diagnostics.map(item => ({
      ...item,
      selectedBasePlanId,
      selectedOfferId,
    })),
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
  normalizeEntitlement,
  periodLabel,
  validFutureTimestamp,
};
