# Apple 5.1.1(v): guest course access

Date: 6 November 2026 (India)

## Implemented behavior

The App Store app in `appcopyai` now opens Home without requiring login after the existing session restore finishes. Guests can browse/search published courses, open course descriptions and lesson lists, and play public lessons. Login is optional, with a visible **Continue as Guest** exit.

By default, the first lesson by order in every published course is a free introduction. Full public courses use `accessType: "free"`; additional public lessons use `videos[].isFree: true`. An explicit `publicPreviewEnabled: false` disables the automatic first-lesson preview, while explicitly free lessons remain public. Existing course documents need no migration for default introductions. This intentionally changes the first lesson from protected content to a public preview.

Paid lessons remain paid and are labelled **Premium lesson**. Guests choosing those lessons see a membership explanation; free lessons remain accessible. Profile, synced wishlist/progress, membership management, certificates, personalized AI/chat and account-owned offline downloads retain account access.

The shared backend in `edunex-b` adds `GET /api/public/courses/:id/videos` and `POST /api/public/courses/:courseId/videos/:videoId/playback-access`. These endpoints require no personal information, session or anonymous account. Paid lesson payloads contain display metadata only. CloudFront public grants are scoped to course/lesson, expire normally, and recheck publication, free-preview policy and exact media reference before fetching HLS playlists. Private playback/download/admin authentication remains in place.

Public course projections exclude embedded image blobs. Members-only Home media enrichment is no longer stored in the shared public catalogue cache. Late public course responses cannot overwrite a different account's view. Guest playback does not call account progress-saving callbacks.

The admin create/update APIs validate and preserve `accessType`, `publicPreviewEnabled` and per-lesson `isFree`. These are API fields; no new admin form controls were added. The legacy direct-billing app in `razorpay-app` is outside this App Store app change.

## Verification

- Complete mobile suite: 168 tests passed, including 10 guest access/navigation/rendering checks.
- Focused backend suite: 58 tests passed, including 8 public-content policy and route checks, plus CloudFront, private session, download-grant, subscription, course-playlist, admin list and video-import regressions.
- Production iOS JavaScript/Hermes export: passed (`expo export --platform ios`).
- This is source and bundle validation. No signed IPA was generated, no backend deployment was performed, and no App Store submission was sent. Native-device visual QA and end-to-end media delivery against the deployed backend remain to be completed. The installed simulator app was an older EduNex app, unsuitable for verifying this current native build.

## Release order and device checks

1. Deploy the changed `edunex-b` backend before shipping the updated `appcopyai` app. A backend without the new public endpoints cannot support the guest playback flow.
2. Create the next signed iOS build using the established release process and a fresh build number. This source fix does not change the existing build number (33).
3. On a fresh install with no saved account, confirm Home and course search work, open a published course, and watch a lesson labelled **Free - No sign-in required**. Verify audio, video, seeking, background/foreground and back navigation on an actual iPhone and iPad.
4. Confirm paid lessons display membership options and cannot be played by guests. Confirm signing in, an existing paid membership, restore purchases, downloads and account deletion continue to work. Confirm logging out returns to public browsing with no previous account progress or downloads visible.
5. From Profile, open sign-in, then select **Continue as Guest**. Confirm free playback still works without providing mobile number, password, name or other personal information.
6. Confirm at least one published course has an available free lesson and the backend can issue working CloudFront grants. Keep those services available during review.

## Suggested App Review reply (send after deployment and device verification)

Thank you for identifying the issue under Guideline 5.1.1(v). We have revised the app so registration and login are optional for public course access. On a fresh launch, users can browse courses, open course details and watch lessons marked Free without entering personal information. The sign-in screen also includes Continue as Guest.

To verify: launch the app without signing in, open Courses, choose a published course and tap its free introductory lesson. Registration remains limited to account features such as synced learning progress, profile and membership management. Paid lessons remain subject to purchase access.

Please use the updated build for review.

## Comparison baseline

The previous version means the local working-tree source immediately before this task, including pre-existing uncommitted changes. Existing unrelated work was preserved. This report does not represent a comparison against the exact binary reviewed by Apple; that binary was not supplied or inspected. No approval outcome is guaranteed by the source changes alone.
