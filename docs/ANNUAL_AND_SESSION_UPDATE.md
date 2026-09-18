# Annual checkout, native tutor sessions and description cleanup

Implemented on top of `361a6aa`, pulled from `origin/main` after the user's approval.
The pre-pull revision was `9ff0e11`. No commits or production deployments were made.

## Annual checkout

- `/pricing` links the annual card to `/payment?plan=annual`; login/signup continuation retains that selection.
- The checkout offers monthly/trial and annual billing. The API determines the price, currency and provider plan; client-supplied amounts cannot select another price.
- Live annual plan `plan_TdSoXLQTCRrb7P` was verified through a read-only Razorpay request as INR 499900 paise, yearly, interval 1. Its ID is configured in the local ignored backend `.env` and documented in `.env.example`.
- Annual purchases create immediate subscriptions without trial add-ons. Existing monthly billing remains compatible. Annual grants use captured invoice periods rather than an assumed number of days.
- Profile > Subscription History now supports confirmation before cancelling renewal or an unfinished checkout. Cancellation retains already-paid access. A previous trial expiry no longer masks the current annual expiry in this view.
- The API-served document CSP permits the required Razorpay checkout script and frame origins. The checkout now uses the shared web refresh implementation so rotated refresh tokens are retained.
- Annual Test checkout remains unavailable until a separate Test plan is configured. Live plan IDs are not shared into Test mode. See `edunex-b/docs/PAYMENTS_AND_OTP.md` for deployment variables.

## Native tutor continuity

`appcopyai/services/nativeSession.js` owns the current native session and serializes AsyncStorage writes. On a tutor 401 it shares one refresh across concurrent requests, persists the rotated access/refresh tokens, and retries once. Profile/WebSocket updates preserve the latest credentials. Logout or account changes invalidate late responses; refresh responses cannot resurrect or erase a different session.

Temporary network errors, malformed success responses and service outages retain login. A confirmed refresh rejection, missing refresh credentials or a second authenticated 401 requires sign-in. Access-token lifetime stays 15 minutes. The general and dedicated course tutor screens use the same session helper. The in-player course assistant already uses the compatible session ID path and remains unchanged.

Requests and body reads are bounded (30 seconds per tutor attempt, 15 seconds for refresh). The UI prevents duplicate sends, ignores responses after unmount, and restores failed questions for retry. Native compilation and physical-device resume/restart testing remain outstanding; only syntax and transport/storage behavior were checked locally.

## Skillomate OTP

The real auth key and new template values were already present in the local environment and were preserved. The configuration checker reports presence without printing secrets. The example and setup documentation now record the new template, sender and DLT IDs. A mocked send/resend/verify test confirms the new OTP template is selected.

Sender/DLT association is configured in MSG91's OTP template, not by adding unsupported parameters to v5 send requests. Live SMS delivery, template approval/mapping and auth-key acceptance were not verified; no SMS was sent.

## Course descriptions

Extended the team's existing display-only Markdown cleanup to native course descriptions, web course lists and lesson/library descriptions. Heading/emphasis markers are removed, paragraphs and bullet lists retained, and ordinary C#, hashtags, underscore identifiers and arithmetic are preserved. Original descriptions and admin authoring content remain unchanged. Both platform utilities have parity tests. No raw HTML rendering was introduced.

## Verification

- Backend/cross-app: `node --test tests/*.test.cjs` - 163 passed.
- Web: `vitest run tests/player` - 81 passed in 16 files.
- Full web build: `npm run build` passed, including page generation and static copying. Existing HLS chunk exceeds the 500 kB warning threshold.
- Native App and new service modules: Babel syntax parsing passed; no native binary built.
- Local API restarted with background jobs disabled. Database health succeeded; public pricing reports Live annual checkout available at 499900 paise. The annual page returns HTTP 200. The final API-served checkout document permits Razorpay in its CSP.
- Browser page identity, screenshots, visual mobile layout and interactions: not verified. Browser startup failed with a sandbox metadata error; the user declined standalone-browser fallback.
- No live charge, mandate, subscription cancellation, OTP send, database migration or Test-plan creation was performed.

Deploy the primary API and web changes together and supply the documented environment variables to the deployment. Build/release the native app separately to deliver tutor refresh and description cleanup to installed users. Complete mobile visual and provider sandbox checks before production sign-off.
