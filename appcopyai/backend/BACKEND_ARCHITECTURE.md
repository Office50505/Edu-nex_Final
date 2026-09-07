# EduNex Backend Architecture

This document maps the current `edunex-b` backend as it exists today.

## Current Verdict

`edunex-b` is a real Express + MongoDB backend. It is not just a proxy.

It already owns:

- Authentication and session checks
- Mobile OTP signup
- User profile APIs
- Course/category APIs
- Protected lesson/video access
- Wishlist
- Progress tracking
- Payment and subscription flows
- PhonePe callback/webhook handling
- Bunny video helpers
- Nex AI chat
- Admin analytics, users, and course management
- Redis-or-memory caching
- Background jobs

It is a solid backend foundation, but it still needs production hardening before live usage.

## High-Level System Map

```txt
Clients
  Web React app
  iOS app
  Android app
        |
        | HTTP JSON API
        | Authorization: Bearer <accessToken>
        v
Express API Server
  server.js
        |
        +-- Global middleware
        |     CORS
        |     JSON parser
        |     URL-encoded parser
        |     Raw parser for PhonePe webhook
        |     MongoDB connection guard
        |     Optional static frontend serving
        |
        +-- Auth middleware
        |     protect
        |       JWT verification
        |       User lookup
        |       activeSessionId validation
        |
        |     protectAdmin
        |       Admin JWT verification
        |
        |     checkSubscription
        |       Trial/subscription access check
        |
        +-- Route modules
        |     routes/auth.js
        |     routes/payment.js
        |     routes/sessions.js
        |     routes/content.js
        |     routes/ai.js
        |
        +-- Inline API routes
        |     health
        |     admin analytics
        |     admin users
        |     admin courses
        |     public courses/categories
        |     wishlist
        |     Bunny video listing
        |     image proxy
        |
        v
Services + Controllers
        |
        +-- services/otpService.js
        +-- services/phonePeService.js
        +-- services/cacheService.js
        +-- services/pushService.js
        +-- controllers/paymentController.js
        |
        v
MongoDB via Mongoose Models
```

## Runtime Startup Flow

1. Load environment variables from `.env` and `.env.local`.
2. Create the Express app.
3. Read core config:
   - `PORT`
   - `MONGODB_URI`
   - `FRONTEND_ORIGIN`
   - `FRONTEND_ORIGINS`
   - JWT secrets
   - admin secret/password
   - PhonePe config
   - Bunny config
   - Redis config
4. Require production-only environment variables when `NODE_ENV=production`.
5. Register global middleware.
6. Connect to MongoDB.
7. Start background jobs after MongoDB connects.
8. Register API routes.
9. Optionally serve frontend files if frontend build/source exists.
10. Listen on `PORT`, defaulting to `3000`.

## Main Route Map

### Health

```txt
GET /api/health
GET /api/health/db
```

`/api/health` is a lightweight process health check.

`/api/health/db` checks MongoDB connectivity and returns course collection counts.

### Auth

Mounted under:

```txt
/api/auth
```

Routes:

```txt
GET   /api/auth/me
PATCH /api/auth/me
POST  /api/auth/send-mobile-otp
POST  /api/auth/verify-mobile-otp
POST  /api/auth/signup
POST  /api/auth/login
POST  /api/auth/refresh
POST  /api/auth/logout
```

Responsibilities:

- Normalize mobile numbers
- Send OTP through MSG91 or development OTP mode
- Verify OTP and issue a short-lived signup token
- Create users
- Hash passwords with bcrypt
- Login with email/mobile plus password
- Issue access and refresh JWTs
- Store one active session ID on the user
- Invalidate the previous session when a new login happens
- Update editable profile fields

### Sessions

Mounted under:

```txt
/api
```

Route:

```txt
PATCH /api/sessions/ping
```

Responsibilities:

- Record latest user activity
- Track session pings by platform:
  - `web`
  - `ios`
  - `android`
  - `windows`
  - `macos`

### Public Content

Routes:

```txt
GET /api/categories
GET /api/courses
GET /api/courses/checkout-summary
```

Responsibilities:

- Return public category list
- Return published course list
- Return checkout summary for a selected or featured course
- Use cache headers and Redis/memory caching for hot public reads

### Protected Course Content

Mounted through `routes/content.js`.

Routes:

```txt
GET /api/courses/:id/lessons
GET /api/lessons/:id
```

Middleware:

```txt
protect -> checkSubscription
```

Responsibilities:

- Require valid JWT
- Require active trial or subscription
- Return course video data
- Resolve Bunny HLS URLs
- Return YouTube/Bunny embed metadata
- Include thumbnails and notes URLs

### Progress

Routes:

```txt
GET  /api/progress
POST /api/progress
```

Middleware:

```txt
protect -> checkSubscription
```

Responsibilities:

- Read user progress
- Upsert watched seconds, completion status, and last watched time

### Wishlist

Routes:

```txt
GET  /api/wishlist
POST /api/wishlist/toggle
```

Middleware:

```txt
protect
```

Responsibilities:

- Read a user's wishlisted courses
- Toggle a course in/out of wishlist
- Increment or decrement course wishlist count

### Payments And Subscriptions

Mounted through `routes/payment.js`.

Routes:

```txt
POST /api/payment/initiate-trial
GET  /api/payment/callback
POST /api/webhooks/phonepe
POST /api/payment/cancel-subscription
GET  /api/payment/subscription-status
GET  /api/payment/verify-app-access
POST /api/payment/verify-app-access
```

Responsibilities:

- Create PhonePe checkout requests
- Create pending orders
- Redirect users after callback
- Verify payment status
- Verify PhonePe webhook signature
- Mark orders paid or failed
- Create/update subscriptions
- Track subscription events
- Report current subscription status to frontend
- Verify a payment belongs to the current logged-in user

### AI

Mounted under:

```txt
/api/ai
```

Route:

```txt
POST /api/ai/chat
```

Responsibilities:

- Require logged-in user
- Build EduNex site/course context
- Call fal/OpenRouter chat completion endpoint
- Constrain Nex AI to EduNex platform/course context
- Return a tutor reply

There is also course-scoped AI tutor persistence under `routes/content.js`:

```txt
GET  /api/ai-tutor
POST /api/ai-tutor
```

These require subscription access.

### Admin

Routes include:

```txt
POST   /api/admin/login
GET    /api/admin/analytics
GET    /api/admin/users
GET    /api/admin/user-management
DELETE /api/admin/users/:id
GET    /api/admin/courses
PATCH  /api/admin/courses/:id
DELETE /api/admin/courses/:id
POST   /api/categories
POST   /api/courses
```

Responsibilities:

- Admin login
- Analytics dashboard data
- User management
- Course management
- Category creation
- Cascading cleanup when users/courses are deleted

## Data Model Map

```txt
User
  owns profile, auth state, activeSessionId, deviceToken, subscription summary

Session
  records activity by platform

Category
  groups courses

Course
  stores course metadata and embedded videos array

Lesson
  references course/video index for lesson-level access

Progress
  tracks user progress by lesson/course

CourseProgress
  stores course-level progress analytics

Wishlist
  stores user wishlisted courses

Subscription
  stores trial/monthly status and PhonePe mandate data

SubscriptionEvent
  stores subscription lifecycle events

Order
  stores PhonePe payment order state

Coupon
  stores payment discounts/offers

Review
  stores course reviews

AiTutorSession
  stores course-scoped tutor messages

LessonNote
  stores user/course lesson notes

Notification
  stores user notifications

ContactEnquiry
  stores support/contact form submissions

AnalyticsEvent
  stores video/activity analytics events

CourseAnalytics
  stores aggregated course statistics
```

## External Integrations

```txt
MongoDB
  Primary database

Redis
  Optional distributed cache
  Falls back to in-memory cache if REDIS_URL is missing

MSG91
  Sends and verifies mobile OTP in production

PhonePe
  Payment checkout
  Payment status verification
  Webhook/callback handling

Bunny
  Video storage/stream metadata
  HLS URL generation

Firebase Admin / FCM
  Silent logout push notification for mobile devices

fal/OpenRouter
  Nex AI chat completion provider
```

## Auth And Session Architecture

Current design:

```txt
User logs in
  |
  +-- Backend creates activeSessionId
  +-- Backend saves activeSessionId on User
  +-- Backend returns accessToken + refreshToken
  +-- accessToken contains userId + sessionId
```

Protected route:

```txt
Request with Authorization Bearer token
  |
  +-- Verify JWT signature
  +-- Load User
  +-- Compare token.sessionId with User.activeSessionId
  +-- Continue if they match
```

Important behavior:

- Only one active session is truly supported per user.
- A new login overwrites `User.activeSessionId`.
- Old access tokens become invalid once `activeSessionId` changes.
- If a previous mobile `deviceToken` exists, backend tries to send silent logout.

## Device-Specific Behavior

Most backend APIs work the same for web, iOS, and Android. The main differences are session tracking and push logout.

### Web

Expected auth:

```txt
Authorization: Bearer <accessToken>
```

Session ping:

```txt
PATCH /api/sessions/ping
```

If no platform is sent, backend defaults to:

```txt
platform = web
```

Typical web login does not send `deviceToken`.

Current limitation:

- If the same user logs in on mobile after web login, the old web token becomes invalid because there is one `activeSessionId` per user.

### Android

Expected auth:

```txt
Authorization: Bearer <accessToken>
```

Login may include:

```json
{
  "loginId": "9999999999",
  "password": "password",
  "deviceToken": "firebase-fcm-token"
}
```

Session ping:

```txt
PATCH /api/sessions/ping
```

With either:

```txt
x-platform: android
```

or:

```json
{
  "platform": "android"
}
```

Android-specific behavior:

- Backend stores the FCM `deviceToken`.
- If a different device logs in later, backend sends a silent logout push.
- Android push uses high priority.

### iOS

Expected auth:

```txt
Authorization: Bearer <accessToken>
```

Login may include:

```json
{
  "loginId": "9999999999",
  "password": "password",
  "deviceToken": "firebase-or-apns-backed-token"
}
```

Session ping:

```txt
PATCH /api/sessions/ping
```

With either:

```txt
x-platform: ios
```

or:

```json
{
  "platform": "ios"
}
```

iOS-specific behavior:

- Backend stores the mobile push token.
- If a different device logs in later, backend sends a silent logout push.
- iOS push uses APNs background notification settings.

## Frontend Connection Architecture

The frontend should call same-origin API paths:

```js
fetch("/api/auth/login")
fetch("/api/courses")
fetch("/api/payment/subscription-status")
fetch("/api/wishlist")
fetch("/api/ai/chat")
```

Recommended local setup:

```txt
edunex-f Vite dev server
  http://localhost:5173
        |
        | /api proxy
        v
edunex-b Express API
  http://localhost:3000
```

Recommended production setup:

```txt
CDN/static frontend hosting
        |
        | /api
        v
Load balancer / reverse proxy
        |
        v
edunex-b API instance(s)
        |
        +-- MongoDB
        +-- Redis
        +-- PhonePe
        +-- MSG91
        +-- Bunny
        +-- Firebase
        +-- AI provider
```

## Current Strengths

- Real backend exists and covers most product flows.
- Mongo models are already defined.
- Passwords are bcrypt-hashed.
- JWT access tokens include server-side session validation.
- PhonePe webhook signature verification exists.
- Public course/category APIs use lean queries and caching.
- Backend has k6 load-test scripts and reports.
- Course video access is protected behind auth and subscription checks.
- Payment verification confirms the purchase belongs to the logged-in user.

## Current Risks And Gaps

These should be fixed before production launch.

```txt
Public /api/users routes
  GET and POST are open and should be removed or admin-protected.

Admin auth
  Uses one shared password and lacks rate limiting/MFA.

OTP development mode
  forceDevelopmentOtp must be ignored in production.

Rate limiting
  Auth/OTP limits are in-memory and do not work across multiple API instances.

Token storage
  Frontend currently stores bearer tokens in browser storage.
  Long term, refresh tokens should move to HttpOnly Secure cookies.

Image proxy
  /api/image-proxy fetches arbitrary URLs and needs SSRF protection.

Bunny listing
  /api/bunny/videos should be admin-protected.

Validation
  Validation is scattered; use a shared schema validation layer.

Tests
  There are k6 tests, but no normal unit/integration API test suite.

Environment docs
  Add .env.example so setup/deployment is reproducible.
```

## Recommended Next Architecture Upgrade

The biggest structural upgrade is proper multi-device sessions.

Current:

```txt
User
  activeSessionId
  deviceToken
```

Recommended:

```txt
User
  profile/auth fields
        |
        +-- Session
              platform: web | ios | android | windows | macos
              deviceName
              deviceToken
              refreshTokenHash
              lastPingAt
              revokedAt
              createdAt
```

Benefits:

- Web and mobile can stay logged in at the same time.
- Users can log out one device.
- Admin/support can inspect active sessions.
- Refresh token rotation becomes cleaner.
- Push logout can target only the affected mobile device.
- `logout all devices` can still be supported.

## Production Readiness Checklist

- Protect/remove public `/api/users`.
- Protect `/api/bunny/videos` as admin-only.
- Add `.env.example`.
- Add startup guard: fail production if `AUTO_VERIFY_OTP=true`.
- Ignore `forceDevelopmentOtp` outside local development.
- Add admin login rate limiting.
- Move auth/OTP rate limiting to Redis.
- Add `helmet` security headers.
- Add SSRF protection to `/api/image-proxy`.
- Add request size limits per route.
- Add centralized validation with Zod/Joi.
- Add centralized error responses.
- Add backend integration tests for auth, courses, payment status, wishlist, and protected lessons.
- Add CI checks:
  - `node --check`
  - unit/integration tests
  - `npm audit`
  - Mongo index audit
- Update `edunex-f` proxy target to point to this backend.
