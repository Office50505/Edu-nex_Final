# Existing failures and remaining limits

The full backend suite is not green. These exact 24 failures occurred before implementation under the same external-network-denied environment and remain afterward. There are no newly failing or newly skipped cases. They concern existing mobile/static-source expectations, billing/configuration mocks, PDF extraction and thumbnail behavior; this review does not assert that every failure is a production defect. They were preserved rather than changed outside scope.

| File | Pre-existing failure |
|---|---|
| android-hardening.test.cjs | appcopyai disables backups, cleartext traffic, overlays, and unverified deep links |
| annual-billing.test.cjs | annual checkout selects server-owned plan/price and returns annual checkout metadata |
| annual-billing.test.cjs | pending monthly checkout cannot be reused as annual; invalid types and wrong plans cannot create mandates |
| app-store-mobile-compliance.test.cjs | root page swipe is bidirectional and disabled while search is open |
| app-store-mobile-compliance.test.cjs | course detail back returns to the courses page instead of home |
| app-store-mobile-compliance.test.cjs | profile avatar picker keeps unique bundled choices and falls back from unknown legacy values |
| google-play-routes.test.cjs | server exposes authenticated Google config under /api exactly once with the confirmed defaults |
| google-play-routes.test.cjs | environment overrides control purchase configuration even when a stored purchase has an older product |
| google-play-routes.test.cjs | config, status and verification reject unauthenticated and revoked sessions before billing work |
| google-play-routes.test.cjs | verification uses the authenticated owner and token, ignoring client-claimed product/package/status |
| google-play-routes.test.cjs | verification rejects missing, malformed and oversized tokens and malformed JSON |
| google-play-routes.test.cjs | verification errors preserve safe client codes and hide provider internals |
| google-play-routes.test.cjs | verification rate limit applies before another verification call |
| google-play-routes.test.cjs | status returns authenticated entitlement state without caching |
| google-play-routes.test.cjs | notifications require Pub/Sub authentication and the correct package before processing |
| mobile-player.test.cjs | Back exits enrolled playback one level and keeps lessons |
| mobile-player.test.cjs | Back exits preview playback one level and keeps lessons |
| mobile-player.test.cjs | on-screen Back uses the same lesson-preserving transition |
| mobile-player.test.cjs | mute and playback speed changes do not trigger a source reload |
| mobile-player.test.cjs | Home displays course metadata before its playback request finishes |
| pdf-text-extraction.test.cjs | PDF extraction reads selectable text from a real PDF |
| phonepe-multi-instance.test.cjs | PhonePe amount mismatch never grants one-time access |
| phonepe-multi-instance.test.cjs | nonterminal callback state remains retryable for a later provider success event |
| thumbnail-cdn.test.cjs | blank vertical URL clears legacy storage while preserving the horizontal thumbnail |


No live provider response, production database, real catalog/purchase/trial account, browser UI or deployed environment was exercised. Final verification uses synthetic sessions and offline model transports. Real catalog metadata and transaction integration require a later authorized end-to-end check. A literal source-body guard cannot recognize arbitrary paraphrases or unknown pasted text; metadata/authorization-based filtering is the primary protection. Ordinary client history remains untrusted conversation, not authenticated evidence of course facts. No conversation-persistence redesign or migration was attempted.

Missing/ambiguous course context now withholds protected assets, and a foreign source body pasted directly into a question can produce the existing generic 502 instead of model inference. These are intentional fail-closed behavior changes, not claims of polished learner UX. Cross-course protected comparisons are unsupported; public descriptions remain available. Existing per-course purchase and trial access are now applied to tutoring, so previously overbroad trial access is intentionally denied. The mirrored trial-selection policy should be kept aligned with `checkSubscription.js` in future maintenance.

Recognized foreign approved history is removed; legacy incomplete course/conversation identifiers and textual product reset behavior are not redesigned. Same-course passes do not prove every multilingual or long conversation. The original four product fixes and Unicode protections pass existing checks, but a new independent evaluation is still necessary.
