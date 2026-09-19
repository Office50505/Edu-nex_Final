# Skillomate Certificate Implementation Plan

## Goal

Issue a polished, downloadable certificate after a learner completes every required lesson in a course. The certificate should follow the supplied Skillomate design while using verified course and learner data.

## Certificate content

- Skillomate logo, brand colors, border treatment and completion heading
- Learner's account name
- Course title and completion date
- Completed lesson count
- Unique, non-sequential public certificate ID
- Skillomate signature or authorized signatory
- Public verification URL and QR code
- Optional course metadata such as duration; omit ratings unless they represent a real, defined metric

## Completion and issuance rules

1. The backend calculates completion from required lessons. The browser cannot mark a course complete by itself.
2. A certificate is issued once per user and course when completion reaches 100% and any course-specific requirements are satisfied.
3. Repeated requests return the existing certificate rather than creating duplicates.
4. Name changes after issue require an explicit reissue flow and audit record.

## Data model

Create a `Certificate` record with `certificateId`, `userId`, `courseId`, `learnerName`, `courseTitle`, `lessonCount`, `completedAt`, `issuedAt`, `templateVersion`, `status`, and an immutable verification snapshot. Add a unique index on `(userId, courseId)` and on `certificateId`.

## Backend work

- Add an eligibility service that reads server-side progress and course requirements.
- Add an idempotent issuance endpoint for eligible learners.
- Generate the PDF on the server from a versioned template and store it in private object storage.
- Return short-lived signed download URLs.
- Add a public verification endpoint that exposes only certificate-safe fields.
- Record issue, download, revoke and reissue events for support and audit use.

## Web experience

- Keep **My certificates** on the learner dashboard.
- Show locked, eligible, generating, available and revoked states.
- Provide **View certificate**, **Download PDF**, **Copy verification link**, and **Share** actions.
- On mobile, render a readable preview and download the full landscape PDF without clipping.
- Add a completion celebration after the final required lesson, with a direct path to the certificate.

## Admin experience

- Search certificates by learner, course, phone/email, or certificate ID.
- Preview, download, revoke and reissue with an admin reason.
- Display progress evidence and the full issuance history.

## Security and quality

- Derive all names, course data and completion facts on the backend.
- Use opaque certificate IDs and rate-limit public verification.
- Sanitize displayed data and keep private account details out of public verification.
- Test duplicate issuance, incomplete courses, renamed users, revoked certificates, mobile preview, PDF rendering and QR verification.

## Delivery phases

1. Approve final wording, signatory, verification fields and design template.
2. Build the data model, eligibility logic, issuance API and verification API.
3. Build and visually verify the PDF template against the supplied design.
4. Add learner and admin interfaces.
5. Backfill certificates only for users whose historical progress can be verified.
6. Release behind a feature flag, monitor generation failures, then enable for all eligible courses.
