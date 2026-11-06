# Paid course protection for guests

6 November 2026. This policy supersedes the automatic free introductory lesson described in the earlier guest-access report and resubmission notes.

## Requested behavior

Guests may browse course titles, descriptions and lesson lists. Paid video lessons, including lesson 1, must not play without the required paid access. Account features continue to require sign-in.

## Changes

- The backend no longer makes the first lesson public automatically. Existing paid/legacy courses stay private even if publicPreviewEnabled was previously true. Only an explicitly free course (accessType: free) or explicitly free stored lesson (isFree: true) is public. Caller-supplied free flags cannot override the stored course data.
- Default preview settings are false. The old preview flag is retained for compatibility but does not authorize paid playback.
- Public lesson lists carry publicAccessPolicy: explicit-free-v1. The updated app strips playable sources and locks all lessons when an older backend omits this policy marker. Paid membership requests retain their authenticated endpoint.
- Guest Home and membership copy explain browsing and paid access. Tapping a locked introduction opens membership options, not the video player.
- Existing public CloudFront HLS grants are rechecked using the stricter backend policy when playlists are requested. Deployment is required for this server-side restriction. Already-issued short-lived CDN resource URLs retain their normal expiry.

## Verification

177 mobile tests passed. 10 public-access backend tests passed. Tests cover paid introductions, legacy preview flags, caller-provided free flags, anonymous grant denial, public policy negotiation and retained explicit free content. git diff --check passed.

On the actual iPhone 17 Pro simulator, the AI Influencer course lists lesson 1 and the remaining lessons as Premium. Tapping Introduction opens Your membership with Sign in / Create account and Browse courses as guest. No video starts.

## Backend release - verified live

DevOps has deployed the correction. Live verification on 6 November 2026 confirmed public browsing returns HTTP 200 for all 8 published courses, all 104 lessons are locked with no paid media/resources exposed, every course introduction rejects anonymous playback with HTTP 403, and private playback/download endpoints reject unauthenticated requests with HTTP 401. The simulator also confirmed that tapping the AI Influencer introduction opens membership options and starts no video. Detailed API results are saved in live-verification.json.

backend-paid-access.patch documents the backend correction relative to the prior a76bc52 source. This patch contains only the new paid-content policy, schema/create defaults, public policy marker and backend tests. It excludes the preceding client playback-cache changes.

Changed backend files: edunex-b/services/publicCourseAccess.js, edunex-b/models/Course.js, edunex-b/routes/mobileCompat.js, edunex-b/server.js, edunex-b/tests/public-course-access.test.cjs.

Verified release checks:

1. Verify all lessons of a paid course, including its introduction, have locked: true and contain no playable media URLs in GET /api/public/courses/:id/videos.
2. Anonymous POST /api/public/courses/:courseId/videos/:videoId/playback-access for a paid introduction must return 403 and no playback grant.
3. Verify account login and active paid membership playback continue to work.

The app-side restriction and production backend restriction are both verified. Deployment was performed by DevOps; this verification made no production configuration or account changes. Active paid-member playback was not exercised because no paid test account was used.

Do not use the previous App Review reply claiming that every course has a free introductory lesson. Describe the actual public browsing and paid membership behavior in the resubmission.
