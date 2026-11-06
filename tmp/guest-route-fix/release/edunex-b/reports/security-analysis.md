# EduNex Security Vulnerability Analysis

Generated: 2026-06-17

## Executive Summary

This review analyzed EduNex for security risks across backend APIs, authentication, payments, frontend token handling, secrets/configuration, dependencies, and public attack surface.

Overall status:

- The app has a good foundation in several areas: JWT sessions include a server-side `activeSessionId`, passwords are bcrypt-hashed, production secrets are required for core auth config, PhonePe webhooks verify signatures, `.env` files are ignored by git, and MongoDB indexes are now clean.
- The most important risks are around admin authentication, token storage, dependency advisories, open public endpoints, rate limiting that does not work across multiple instances, and unsafe proxy/external-fetch behavior.
- Before production scale or 10,000-user testing, the security work should focus on admin hardening, Redis-backed rate limiting, secure token storage, dependency upgrades, SSRF protection, and API security headers.

## Risk Summary

| Severity | Finding | Area |
| --- | --- | --- |
| High | Admin login uses a single shared password, no rate limit, no lockout/MFA | Admin auth |
| High | Access and refresh tokens are stored in `localStorage`/`sessionStorage` | Frontend auth |
| High | Dependency audit reports high vulnerabilities in backend and frontend packages | Supply chain |
| High | Image proxy can fetch arbitrary URLs, creating SSRF/internal-network risk | Backend API |
| Medium | Auth/OTP rate limiting is in-memory and bypassable across API instances/restarts | Auth/OTP |
| Medium | Public Bunny video listing endpoint is not protected | Content/admin data exposure |
| Medium | AI/chat and contact/progress write endpoints lack dedicated rate limits | Abuse/cost control |
| Medium | Security headers are missing: CSP, HSTS, frame protection, no-sniff, referrer policy | HTTP hardening |
| Medium | Refresh tokens are long-lived bearer tokens with no token family/revocation tracking | Session security |
| Medium | Detailed operational errors are returned to clients in multiple routes | Info disclosure |
| Low | `.env` files exist locally but are ignored by git | Secrets hygiene |

## Detailed Findings

### 1. High: Admin Login Is Too Weak For Production

Evidence:

- `server.js` defines a single admin password fallback: `ADMIN_PASSWORD` defaults to a development value outside production.
- Admin login checks plain equality and issues an 8-hour JWT.
- No rate limiting, account lockout, IP throttling, MFA, password hashing, or admin user model exists.

Relevant code:

- `server.js:19`
- `server.js:143`
- `server.js:559`
- `server.js:566`
- `server.js:570`

Impact:

If the admin password is guessed, leaked, reused, or brute-forced, an attacker can access analytics, users, courses, and destructive admin routes.

Recommended fix:

- Replace shared admin password with real admin users stored in DB.
- Hash admin passwords with bcrypt/argon2.
- Add Redis-backed rate limiting to `/api/admin/login`.
- Add MFA/TOTP for admin.
- Shorten admin token lifetime or add refresh/rotation.
- Log admin login failures and sensitive admin actions.
- Consider IP allowlisting for admin routes.

### 2. High: Browser Storage Of Access And Refresh Tokens

Evidence:

The frontend stores bearer tokens in `localStorage` or `sessionStorage`.

Relevant code:

- `frontend/edunex-f/js/edunex-api.js:432`
- `frontend/edunex-f/js/edunex-api.js:440`
- `frontend/edunex-f/js/edunex-api.js:444`
- `frontend/edunex-f/js/edunex-api.js:457`
- `frontend/edunex-f/js/edunex-api.js:463`
- `frontend/edunex-f/js/edunex-api.js:464`
- `frontend/edunex-f/js/edunex-api.js:501`

Impact:

If any XSS occurs anywhere in the frontend, an attacker can read access and refresh tokens and take over the session.

Recommended fix:

- Move refresh tokens to `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` cookies.
- Keep access tokens short-lived.
- Add refresh token rotation and reuse detection.
- Add a strict Content Security Policy to reduce XSS exploitability.
- Avoid storing user/session secrets in `localStorage`.

### 3. High: Dependency Vulnerabilities

Backend npm audit:

- 10 total advisories
- 8 moderate
- 2 high

High backend advisories:

- `form-data`: CRLF injection advisory
- `protobufjs`: denial-of-service/runtime property shadowing advisories

Main dependency chain:

- `firebase-admin@13.10.0`
- `@google-cloud/firestore`
- `google-gax`
- `protobufjs`
- `uuid`
- `form-data`

Frontend npm audit:

- 2 high advisories

High frontend advisories:

- `vite` via `esbuild`
- recommended fix requires a major Vite upgrade according to audit output

Relevant package files:

- `backend/edunex-b/package.json:19`
- `backend/edunex-b/package.json:23`
- `frontend/edunex-f/package.json:15`
- `frontend/edunex-f/package.json:17`

Impact:

Supply-chain vulnerabilities can become exploitable depending on how the affected package is used. The frontend Vite/esbuild issue is mostly build/dev tooling risk, while backend Google/Firebase dependency issues can affect runtime if those paths are reachable.

Recommended fix:

- Test upgrade path for `firebase-admin` to the fixed major version.
- Run `npm audit fix` in a branch first; avoid blind production upgrades.
- Upgrade Vite/esbuild after testing build output.
- Add dependency audit to CI.

### 4. High: Image Proxy SSRF Risk

Evidence:

`/api/image-proxy` accepts an arbitrary `url` query parameter and fetches it if the scheme is `http:` or `https:`.

Relevant code:

- `server.js:585`
- `server.js:590`
- `server.js:595`
- `server.js:603`

Impact:

An attacker can potentially make the backend request internal services or cloud metadata endpoints. Even though response content must be an image, the outbound request itself can still hit internal network targets.

Recommended fix:

- Restrict proxy targets to an allowlist of known image/CDN hostnames.
- Block private IP ranges, loopback, link-local, and metadata service IPs.
- Resolve DNS and validate the resolved IP before fetching.
- Limit response size before buffering into memory.
- Add rate limiting.

### 5. Medium: Auth/OTP Rate Limiting Is In-Memory

Evidence:

Auth rate limit state is stored in a local `Map`.

Relevant code:

- `routes/auth.js:28`
- `routes/auth.js:30`
- `routes/auth.js:54`
- `routes/auth.js:62`
- `routes/auth.js:73`

Impact:

In-memory limits reset on process restart and do not coordinate across multiple API instances. This becomes a serious issue once the app scales horizontally.

Recommended fix:

- Move rate limits to Redis.
- Apply limits per IP, per account/mobile/email, and per route.
- Do not trust raw `x-forwarded-for` unless `app.set('trust proxy', ...)` is configured correctly behind a trusted load balancer.
- Add admin-login rate limiting too.

### 6. Medium: OTP Development Mode Can Leak OTPs If Misconfigured

Evidence:

OTP auto-verification/development OTP is enabled outside production, and callers can request development OTP behavior through `forceDevelopmentOtp`.

Relevant code:

- `routes/auth.js:27`
- `routes/auth.js:422`
- `routes/auth.js:430`
- `services/otpService.js:8`
- `services/otpService.js:107`

Impact:

This is acceptable for local development, but dangerous if `NODE_ENV` or `AUTO_VERIFY_OTP` is misconfigured in staging/production.

Recommended fix:

- In production, ignore `forceDevelopmentOtp` completely.
- Add startup checks that fail if `AUTO_VERIFY_OTP=true` in production.
- Never return `devOtp` outside explicit local development.

### 7. Medium: Public Bunny Video Listing Endpoint

Evidence:

`GET /api/bunny/videos` is public and can list stream/storage video metadata when Bunny credentials are configured.

Relevant code:

- `server.js:523`
- `server.js:525`
- `server.js:546`

Impact:

This can expose video metadata, storage zone details, pull-zone URL, folders, and potentially content inventory that should be admin-only.

Recommended fix:

- Protect this endpoint with `protectAdmin`.
- Remove storage zone/region details from public responses.
- Consider moving it under `/api/admin/bunny/videos`.

### 8. Medium: AI And Write Endpoints Need Abuse Controls

Evidence:

`/api/ai/chat` is authenticated but does not have a dedicated rate limit. It calls an external model provider and returns provider error details.

Relevant code:

- `routes/ai.js:160`
- `routes/ai.js:161`
- `routes/ai.js:165`

Progress and AI tutor message persistence accept user-controlled data with limited shape/size controls.

Relevant code:

- `routes/content.js:221`
- `routes/content.js:235`
- `routes/content.js:265`
- `routes/content.js:267`

Impact:

Attackers or abusive users can drive up AI costs, create noisy data, or stress write paths.

Recommended fix:

- Add Redis-backed per-user and per-IP rate limits for AI.
- Add strict size/shape validation for `messages`, `watchedSeconds`, and progress payloads.
- Cap saved AI tutor message count and message length.
- Return generic AI provider errors to clients; log details server-side.

### 9. Medium: Missing Security Headers

Evidence:

The Express app does not currently install `helmet` or explicitly set common browser security headers.

Relevant code:

- `server.js:1`
- `server.js:164`

Impact:

Missing headers increase exposure to XSS impact, clickjacking, MIME sniffing, insecure referrer leakage, and weaker browser isolation.

Recommended fix:

- Add `helmet`.
- Configure:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options` or CSP `frame-ancestors`
  - `Referrer-Policy`
  - `Cross-Origin-Opener-Policy`

### 10. Medium: Refresh Token Design Is Basic

Evidence:

Refresh tokens are JWT bearer tokens valid for 7 days. Refresh uses the token directly and issues a new refresh token without tracking token families or reuse.

Relevant code:

- `routes/auth.js:142`
- `routes/auth.js:546`
- `routes/auth.js:554`
- `routes/auth.js:561`

Impact:

If a refresh token is stolen, it can be reused until session invalidation or expiry. The server cannot detect token reuse or selectively revoke one refresh token while preserving another device/session.

Recommended fix:

- Store hashed refresh token IDs in the database.
- Rotate refresh tokens on every refresh.
- Detect reuse and invalidate the session family.
- Move refresh token to an HttpOnly cookie.

### 11. Medium: Operational Error Details Returned To Clients

Evidence:

Many handlers respond with `error.message`. Examples include admin/content/payment/AI routes.

Relevant code examples:

- `server.js:555`
- `routes/ai.js:165`
- `controllers/paymentController.js:451`
- `routes/content.js:244`

Impact:

Detailed internal errors can reveal provider behavior, DB validation internals, configuration hints, or stack-adjacent operational information.

Recommended fix:

- Return generic client-safe errors.
- Log detailed errors server-side with request IDs.
- Add centralized error handling.

## Positive Security Findings

These are good foundations already present:

- Passwords are hashed with bcrypt using cost 12.
- JWT access tokens expire after 15 minutes.
- User access tokens include `sessionId`, checked against `activeSessionId`.
- Admin production secrets are required at startup.
- PhonePe webhook signature verification uses `crypto.timingSafeEqual`.
- `.env` and `.env.local` are ignored by backend git.
- MongoDB missing index audit is clean.
- Public read cache has explicit invalidation after course/category changes.

## Priority Fix Plan

### Phase 1: Critical Hardening

1. Harden admin authentication:
   - DB-backed admin users
   - hashed passwords
   - Redis-backed rate limit
   - MFA

2. Protect token storage:
   - move refresh tokens to HttpOnly Secure cookies
   - rotate refresh tokens
   - add CSP

3. Fix high dependency advisories:
   - test `firebase-admin` major upgrade
   - upgrade frontend Vite/esbuild path

4. Lock down `/api/image-proxy`:
   - allowlist hostnames
   - block internal/private IPs
   - cap response size

### Phase 2: Abuse And Production Controls

1. Move auth/admin/OTP/AI rate limits to Redis.
2. Protect `/api/bunny/videos` with admin auth.
3. Add `helmet` and security headers.
4. Add strict validation for user-controlled write payloads.
5. Replace detailed client errors with generic errors plus server-side logs.

### Phase 3: Monitoring And Governance

1. Add security logs:
   - failed admin login
   - failed user login
   - OTP rate-limit hits
   - webhook signature failures
   - AI abuse/rate-limit hits

2. Add CI checks:
   - `npm audit`
   - secret scan
   - lint/security rules

3. Add incident controls:
   - admin token revocation
   - user session revocation
   - refresh token family invalidation

## Final Assessment

EduNex is not showing one single catastrophic flaw, but it has several production-relevant security gaps that should be fixed before serious public launch or 10,000-user scale testing.

The most urgent fixes are:

1. Admin login hardening.
2. Secure token storage and refresh token rotation.
3. Dependency upgrades.
4. SSRF protection for image proxy.
5. Redis-backed rate limiting.
6. Security headers/CSP.

Once these are addressed, the app will be much better positioned for production-scale testing and public exposure.
