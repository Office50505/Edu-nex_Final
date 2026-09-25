# Skillomate Direct

Website-distributed Android variant of Skillomate with Razorpay checkout enabled.

## Identity

- App name: `Skillomate Direct`
- Android package: `com.skillomate.direct`
- URL scheme: `skillomate-direct`
- Play Store app: `../appcopyai` (`com.skillomate.app`)

Both Android apps use the same Skillomate backend and account entitlements. Separate package IDs allow them to be installed on the same device.

## Development

```sh
npm ci
npm run android
```

## Distribution

Distribute only a release-signed APK over HTTPS. Keep the signing key private and reuse the same key for every update. The existing `production-apk` EAS profile can produce an installable APK after this directory is linked to its own EAS project.

Do not link to this APK or its Razorpay checkout from the Google Play version.
