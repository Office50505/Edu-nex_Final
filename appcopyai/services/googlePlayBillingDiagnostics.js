// This adapter has no console fallback: production console stripping must not
// silently disable a requested local diagnostic build. The native module owns
// the explicit Gradle flag and applies a second, independent field allowlist.
const { readGooglePlaySubscriptionOfferEntries } = require("./subscriptions");

const identifier = value => typeof value === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : null;
const integer = value => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const hasToken = value => typeof value === "string" && Boolean(value.trim());
const formattedPrice = value => typeof value === "string" && value.length <= 64
  && /^(?:[A-Z]{0,3}\s*)?[\p{Sc}\s]*[\p{N}\s.,'’\u066b\u066c]+[\p{Sc}\s]*(?:[A-Z]{0,3})$/u.test(value)
  ? value : null;

function createGooglePlayBillingDiagnostics(bridge) {
  let enabled = false;
  try {
    enabled = bridge?.enabled === true && typeof bridge?.logEvent === "function";
  } catch (_) { /* An unavailable native bridge must not block checkout. */ }
  const emit = (event, fields) => {
    if (!enabled) return;
    try { bridge.logEvent(event, fields); } catch (_) { /* Diagnostics never change billing state. */ }
  };
  emit("js_startup", { diagnosticsEnabled: true });
  return {
    enabled,
    configuration(configuration, effectiveProductId, effectiveOfferId) {
      emit("configuration", {
        packageName: identifier(configuration?.packageName),
        productId: identifier(configuration?.productId),
        introductoryOfferId: identifier(configuration?.introductoryOfferId),
        configuredProductId: identifier(effectiveProductId),
        configuredBasePlanId: "monthly",
        configuredIntroductoryOfferId: identifier(effectiveOfferId),
        accountBindingPresent: hasToken(configuration?.obfuscatedAccountId),
      });
    },
    rawProduct(product, requestedProductId) {
      if (!enabled) return;
      const entries = readGooglePlaySubscriptionOfferEntries(product);
      const productId = identifier(product?.id || product?.productId);
      emit("raw_product", {
        productId,
        returnedSubscriptionOfferCount: entries.length,
        androidOfferCount: Array.isArray(product?.subscriptionOfferDetailsAndroid) ? product.subscriptionOfferDetailsAndroid.length : 0,
        unifiedOfferCount: Array.isArray(product?.subscriptionOffers) ? product.subscriptionOffers.length : 0,
      });
      // This read-only probe runs once in the native module per diagnostic run.
      // It establishes whether an absent JS offer was also absent natively.
      const probeProductId = identifier(requestedProductId) || productId;
      if (probeProductId && typeof bridge.queryProduct === "function") {
        try { bridge.queryProduct(probeProductId); } catch (_) { /* Do not affect checkout. */ }
      }
      entries.forEach((entry, offerIndex) => {
        emit("raw_offer", {
          productId, shape: entry.shape, offerIndex,
          basePlanId: identifier(entry.basePlanId), offerId: identifier(entry.offerId),
          returnedOfferId: identifier(entry.returnedOfferId),
          offerTokenPresent: hasToken(entry.offerToken), phaseCount: entry.phases.length,
        });
        entry.phases.forEach((phase, phaseIndex) => emit("raw_phase", {
          shape: entry.shape, offerIndex, phaseIndex,
          billingPeriod: identifier(phase?.billingPeriod),
          priceCurrencyCode: typeof phase?.priceCurrencyCode === "string" && /^[A-Z]{3}$/.test(phase.priceCurrencyCode)
            ? phase.priceCurrencyCode : null,
          formattedPrice: formattedPrice(phase?.formattedPrice),
          recurrenceMode: integer(phase?.recurrenceMode),
          billingCycleCount: integer(phase?.billingCycleCount),
        }));
      });
    },
    selection(diagnostics) {
      if (!enabled || !diagnostics) return;
      emit("selection", {
        productId: identifier(diagnostics.productId),
        configuredIntroductoryOfferId: identifier(diagnostics.configuredIntroductoryOfferId),
        selectedBasePlanId: identifier(diagnostics.selectedBasePlanId),
        selectedOfferId: identifier(diagnostics.selectedOfferId),
        introductoryOfferReturned: diagnostics.introductoryOfferReturned === true,
        introductoryOfferStatus: identifier(diagnostics.introductoryOfferStatus),
        rejectionReason: identifier(diagnostics.rejectionReason),
      });
      (diagnostics.offers || []).forEach((offer, offerIndex) => emit("validation", {
        shape: offer.shape, offerIndex,
        basePlanId: identifier(offer.basePlanId), offerId: identifier(offer.offerId),
        rejectionReason: identifier(offer.rejectionReason),
        failedValidationCheck: identifier(offer.failedValidationCheck),
        failedPhaseIndex: integer(offer.failedPhaseIndex),
        oldValidatorAccepted: offer.oldValidatorAccepted === true,
      }));
    },
    checkout(product, selectedOffer, submittedToken) {
      if (!enabled) return;
      const entries = readGooglePlaySubscriptionOfferEntries(product);
      const sameReturnedOffer = entries.some(entry => entry.basePlanId === selectedOffer?.basePlanId
        && (entry.offerId || null) === (selectedOffer?.offerId || null)
        && hasToken(entry.offerToken) && entry.offerToken === selectedOffer?.offerToken);
      emit("checkout", {
        productId: identifier(product?.id || product?.productId),
        selectedBasePlanId: identifier(selectedOffer?.basePlanId),
        selectedOfferId: identifier(selectedOffer?.offerId),
        offerTokenPresent: hasToken(submittedToken),
        selectedTokenMatchesReturnedOffer: sameReturnedOffer,
        submittedTokenMatchesSelectedOffer: hasToken(submittedToken) && submittedToken === selectedOffer?.offerToken,
      });
    },
  };
}

module.exports = { createGooglePlayBillingDiagnostics };
