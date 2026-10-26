# Skillomate release handoff - 2e380f3

## Delivered

- Source commit: `2e380f30872ae07e738730791f04554e4f743948`
- Branch: `main`
- Remote: `origin/main`
- Local Android test package: `output/android/skillomate-2e380f3-debug-arm64.apk`
- APK package: `com.skillomate.app.debug`
- APK version: `1.0-debug` (`versionCode` 24)
- APK SHA-256: `7eec6cd47ea4eb11ccc7ca2ddfabce985c402a0bfa66a1a33ef87e7edab4d8cb`

The debug APK is for local/internal testing and requires the Metro development
server. It is not a Google Play artifact and must not replace the production
package or signing key.

## Verified

- Frontend: 40 test files, 306 tests passed.
- Backend integrations: 47 tests passed.
- Android debug APK: built, installed, launched, and rendered on the emulator.
- Frontend S3/CloudFront deployment self-test: passed.
- Deployment shell syntax validation: passed.
- Database title corrections: live and verified through the API.

## Production web and backend

Prerequisite: an authorized AWS CLI profile named `skillomate-prod`.

```bash
cd /Users/zohershakir/Desktop/edunex-ai/Edu-nex_final
bash deployment/deploy-skillomate-production.sh
```

The guarded deployment pins `origin/main`, checks instance and target health,
and stops before continuing when a production validation fails.

The S3/CloudFront frontend publication also needs the existing production
bucket and distribution ID:

```bash
SKILLOMATE_FRONTEND_BUCKET=existing-production-bucket \
SKILLOMATE_FRONTEND_DISTRIBUTION_ID=existing-distribution-id \
bash deployment/deploy-frontend-s3.sh
```

Do not create replacement infrastructure when these values are unavailable.

## Android Play release

Prerequisite: authentication to the existing Skillomate Expo organization.

```bash
cd /Users/zohershakir/Desktop/edunex-ai/Edu-nex_final/appcopyai
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production
```

The production profile creates an Android App Bundle. Use only the existing
Skillomate Play signing identity managed by the authorized account.

## Required live verification after access is restored

1. Confirm `/api/health`, `/api/ready`, and `/api/courses` are healthy.
2. Confirm `FilmMaking` returns one published web course.
3. Confirm `AI Music` returns the matching planned course.
4. Confirm `Business Brief` returns one published course.
5. Confirm an unknown website route returns HTTP 404.
6. Confirm the homepage H1 accessible name includes the space in `turn into`.
7. Install the Play-distributed Android build and verify safe areas, search,
   playback authorization, and Google Play Billing on a licensed tester device.
