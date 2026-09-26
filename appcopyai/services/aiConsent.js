const AI_CONSENT_POLICY_VERSION = "2026-09-25";

function isAiConsentCurrent(consent) {
  return Boolean(
    consent?.granted === true
    && consent?.policyVersion === AI_CONSENT_POLICY_VERSION
    && typeof consent?.providerVersion === "string"
    && consent.providerVersion.length > 0
  );
}

function consentDecision(granted, providerVersion = "fal-openrouter-gemini-v1", now = new Date()) {
  return {
    granted: granted === true,
    policyVersion: AI_CONSENT_POLICY_VERSION,
    providerVersion,
    decidedAt: now.toISOString(),
  };
}

module.exports = { AI_CONSENT_POLICY_VERSION, consentDecision, isAiConsentCurrent };
