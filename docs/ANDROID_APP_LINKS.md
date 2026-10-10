# Android App Links

Skillomate Android handles verified HTTPS lecture links with this shape:

```text
https://skillomate.in/videos?courseId=<course-id>&videoId=<video-id>
```

The Android package is `com.skillomate.app`. The app manifest and Expo config both declare verified links for `/videos` on the canonical `skillomate.in` host. The in-app parser also accepts legacy `www.skillomate.in` links after the app has received them, but automatic Android verification is intentionally limited to the canonical host.

## Required website association

Before releasing the App Link build, copy the **SHA-256 certificate fingerprint for the App signing key certificate** from Google Play Console:

`Setup → App integrity → App signing → App signing key certificate`

Do not use the upload-key fingerprint or the local diagnostics APK certificate.

Publish the following as JSON at the canonical app-link host:

- `https://skillomate.in/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.skillomate.app",
      "sha256_cert_fingerprints": [
        "<GOOGLE_PLAY_APP_SIGNING_SHA256_FINGERPRINT>"
      ]
    }
  }
]
```

Requirements:

- Return HTTP `200` directly, without a redirect.
- Return `Content-Type: application/json`.
- Keep the file publicly accessible without authentication.
- If direct and Play Store builds use different trusted signing certificates, include both fingerprints.

## Verification

After installing the Play-signed build and publishing the association file:

```bash
adb shell pm verify-app-links --re-verify com.skillomate.app
adb shell pm get-app-links com.skillomate.app
adb shell am start -a android.intent.action.VIEW -d "https://skillomate.in/videos?courseId=<course-id>&videoId=<video-id>"
```

The final command should open Skillomate directly. If the user is logged out, the app retains the link through login and opens the requested course afterward. Without an active course entitlement, the existing subscription gate is shown and access is not bypassed.
