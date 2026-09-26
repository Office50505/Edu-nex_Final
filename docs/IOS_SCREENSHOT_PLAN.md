# Skillomate iOS App Store screenshot plan

Capture screenshots only after the final signed TestFlight build passes the physical-device checklist. Use the current production backend, an approved review/demo account, and real content for which rights are documented. Do not use fixture courses, fabricated notifications, placeholder earnings, mock purchases, or personal customer data.

## Device coverage

The current app config sets `supportsTablet: false` and the native target family is iPhone. Capture the current App Store Connect-required iPhone sizes from native-size Simulator or physical-device screenshots, prioritizing the largest listed iPhone display class. Do not stretch one screenshot to another aspect ratio.

No iPad screenshots are planned for this version. If iPad support is enabled later, validate the complete adaptive layout on physical/simulated iPads and create a separate iPad sequence rather than reusing iPhone art.

## Recommended six-image sequence

| Order | Screen/state | What the screenshot should prove | Preparation |
| --- | --- | --- | --- |
| 1 | Home | Real published learning catalog and Skillomate identity | Signed-in review account; stable thumbnails; no empty/error state; no unsupported earning guarantee |
| 2 | Course overview | Course description, instructor, lesson count, curriculum, and access state | Use an approved flagship course with rights-cleared thumbnail/instructor/content |
| 3 | Lesson/player | Protected lesson playback with clear title and curriculum context | Use a representative playable lesson; hide transient controls/errors; do not expose signed URLs or identifiers |
| 4 | Nex AI | Course-aware educational help and transparent AI experience | Capture either the consent disclosure or a safe, accurate post-consent answer; do not show private prompts or unsafe output |
| 5 | Progress | Authentic progress/resume state | Seed the review account through normal server data; show meaningful progress without fabricating recent events |
| 6 | Certificate/Profile | Completion record and account controls | Use a legitimate test completion/certificate or a profile/subscription view if no real certificate is available; avoid implying external accreditation |

## Optional seventh image

Use **Subscription Details** only after App Store Connect returns the real localized StoreKit product. Show benefits, localized price/period, auto-renewal disclosure, Restore Purchases, Terms of Use, and Privacy Policy. Never show a web checkout or hard-coded price that conflicts with Apple metadata.

## Capture checklist

- Use the same app version/build and production endpoints that will be submitted.
- Remove debug banners, Metro overlays, test menus, cursor/tap indicators, and status-bar anomalies.
- Use one consistent appearance and device locale across the set unless localization itself is being demonstrated.
- Ensure time, battery, connectivity, and notification status look deliberate and contain no personal data.
- Confirm all course artwork, people, instructor identity, logos, prompts, and certificates have rights sign-off.
- Confirm copy matches actual features, 13+ positioning, and current subscription behavior.
- Do not show provider secrets, transaction IDs, internal URLs, email/phone details, signed media grants, or another user's data.
- Leave safe margins for App Store crops and optional captions; keep text legible at listing size.
- Verify the screenshots remain accurate after the final build and metadata are uploaded.

## Suggested factual captions

1. “Learn from structured, practical courses”
2. “Follow every lesson in one clear curriculum”
3. “Watch protected lessons and continue your progress”
4. “Ask Nex for course-aware learning help”
5. “Track progress across your learning”
6. “Keep your Skillomate profile and completions together”

Avoid “guaranteed income,” “get rich,” “certified professional,” “best,” or other claims that are not substantiated by the product and legal review.
