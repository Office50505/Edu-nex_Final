# EduNex Backend Architecture Visual

This is the quick visual map of the current `edunex-b` backend.

## 1. Big Picture

```mermaid
flowchart TB
  subgraph Clients["Client Apps"]
    Web["React Web"]
    IOS["iOS App"]
    Android["Android App"]
  end

  Web --> API["Express API\nserver.js"]
  IOS --> API
  Android --> API

  API --> MW["Global Middleware\nCORS, body parsing,\nDB guard, static serving"]
  MW --> Routes["API Routes\n/api/*"]

  Routes --> Auth["Auth\nlogin, signup, OTP,\nrefresh, profile"]
  Routes --> Content["Content\ncourses, lessons,\nprogress, wishlist"]
  Routes --> Pay["Payments\nPhonePe trial,\nsubscription, webhook"]
  Routes --> AI["Nex AI\nchat + tutor sessions"]
  Routes --> Admin["Admin\nanalytics, users,\ncourses, categories"]

  Auth --> Mongo[(MongoDB)]
  Content --> Mongo
  Pay --> Mongo
  AI --> Mongo
  Admin --> Mongo

  Routes --> Redis[(Redis Cache\noptional)]
  Routes --> MSG91["MSG91\nOTP SMS"]
  Pay --> PhonePe["PhonePe\nCheckout + Webhooks"]
  Content --> Bunny["Bunny\nVideo/CDN"]
  Auth --> Firebase["Firebase FCM\nsilent logout"]
  AI --> Model["fal/OpenRouter\nAI Provider"]
```

## 2. Backend Layers

```txt
server.js
  |
  +-- Config
  |     .env / .env.local
  |     production env checks
  |
  +-- Express middleware
  |     CORS
  |     JSON parser
  |     raw PhonePe webhook parser
  |     MongoDB connection guard
  |
  +-- Security middleware
  |     protect
  |     protectAdmin
  |     checkSubscription
  |
  +-- Routes
  |     auth
  |     courses/categories
  |     lessons/progress
  |     wishlist
  |     payment
  |     AI
  |     admin
  |
  +-- Services
  |     OTP
  |     PhonePe
  |     cache
  |     push notifications
  |
  +-- Models
        User, Course, Subscription, Order, Wishlist, Progress, etc.
```

## 3. Request Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Express server.js
  participant M as Middleware
  participant R as Route Handler
  participant DB as MongoDB
  participant X as External Service

  C->>S: HTTP request /api/...
  S->>M: CORS + body parsing
  M->>M: DB connected?
  M->>R: route handler
  R->>DB: read/write app data
  R->>X: optional MSG91/PhonePe/Bunny/AI call
  X-->>R: external response
  DB-->>R: database response
  R-->>C: JSON response
```

## 4. Main API Map

```mermaid
mindmap
  root((EduNex API))
    Auth
      send-mobile-otp
      verify-mobile-otp
      signup
      login
      refresh
      logout
      me
    Courses
      categories
      courses
      checkout-summary
      course lessons
      lesson detail
    User App
      wishlist
      progress
      sessions ping
      contact enquiries
    Payments
      initiate trial
      callback
      PhonePe webhook
      cancel subscription
      subscription status
      verify app access
    AI
      chat
      ai tutor session
    Admin
      login
      analytics
      users
      user management
      courses
      categories
```

## 5. Auth Flow

```mermaid
flowchart LR
  Login["Login Request\nemail/mobile + password"] --> FindUser["Find User"]
  FindUser --> CheckPass["bcrypt password check"]
  CheckPass --> Session["Create activeSessionId"]
  Session --> Save["Save activeSessionId\nand optional deviceToken"]
  Save --> Tokens["Return accessToken\n+ refreshToken"]
  Tokens --> ClientStore["Client stores tokens"]

  Protected["Protected API Request"] --> VerifyJWT["Verify JWT"]
  VerifyJWT --> LoadUser["Load User"]
  LoadUser --> MatchSession["Compare token sessionId\nwith User.activeSessionId"]
  MatchSession --> Allow["Allow request"]
```

Current behavior:

```txt
One user = one active session.
New login invalidates the old login.
```

## 6. Course Access Flow

```mermaid
flowchart TB
  Client["Client opens course video"] --> API["GET /api/courses/:id/lessons"]
  API --> JWT["protect\nvalid JWT?"]
  JWT --> Sub["checkSubscription\ntrial or subscribed?"]
  Sub --> Course["Load Course from MongoDB"]
  Course --> Video["Attach video metadata\nBunny HLS / YouTube embed"]
  Video --> Response["Return lessons/videos"]

  JWT -. fail .-> Login["401: login again"]
  Sub -. fail .-> Payment["403: go to payment"]
```

## 7. Payment Flow

```mermaid
sequenceDiagram
  participant U as User
  participant API as EduNex API
  participant PP as PhonePe
  participant DB as MongoDB

  U->>API: POST /api/payment/initiate-trial
  API->>PP: create checkout request
  API->>DB: create pending Order
  API-->>U: PhonePe redirectUrl
  U->>PP: completes payment
  PP->>API: callback/webhook
  API->>PP: verify payment status/signature
  API->>DB: update Order, Subscription, User
  API-->>U: redirect to success/failure page
```

## 8. Device Behavior

| Device | Login API | Session Ping | Device Token | Special Behavior |
| --- | --- | --- | --- | --- |
| Web | `POST /api/auth/login` | defaults to `web` | usually none | Uses bearer token. New mobile login invalidates old web token. |
| Android | `POST /api/auth/login` | `platform=android` | FCM token | Can receive silent logout push. |
| iOS | `POST /api/auth/login` | `platform=ios` | FCM/APNs-backed token | Can receive APNs background silent logout. |

Supported session platforms:

```txt
web
ios
android
windows
macos
```

## 9. Data Model Map

```mermaid
erDiagram
  USER ||--o| SUBSCRIPTION : has
  USER ||--o{ ORDER : creates
  USER ||--o{ PROGRESS : tracks
  USER ||--o| WISHLIST : owns
  USER ||--o{ SESSION : pings
  USER ||--o{ AI_TUTOR_SESSION : chats

  CATEGORY ||--o{ COURSE : groups
  COURSE ||--o{ LESSON : contains
  COURSE ||--o{ PROGRESS : has
  COURSE ||--o{ REVIEW : receives
  COURSE ||--o{ AI_TUTOR_SESSION : contextualizes

  SUBSCRIPTION ||--o{ SUBSCRIPTION_EVENT : logs
  SUBSCRIPTION ||--o{ ORDER : linked_to
```

## 10. Frontend Connection

Local development:

```txt
React/Vite frontend
http://localhost:5173
        |
        | /api proxy
        v
EduNex backend
http://localhost:3000
```

Production:

```txt
CDN/static frontend
        |
        | /api
        v
Reverse proxy / load balancer
        |
        v
EduNex API instances
        |
        +-- MongoDB
        +-- Redis
        +-- PhonePe
        +-- MSG91
        +-- Bunny
        +-- Firebase
        +-- AI provider
```

React should call same-origin paths:

```js
fetch("/api/auth/login")
fetch("/api/courses")
fetch("/api/payment/subscription-status")
fetch("/api/wishlist")
fetch("/api/ai/chat")
```

## 11. Current Production Readiness

```mermaid
flowchart LR
  A["Current Backend"] --> B["Good Foundation"]
  B --> C["Needs Hardening"]
  C --> D["Production Ready"]

  B --> B1["Auth exists"]
  B --> B2["Payments exist"]
  B --> B3["Courses exist"]
  B --> B4["Mongo models exist"]
  B --> B5["Caching exists"]

  C --> C1["Protect public /api/users"]
  C --> C2["Harden admin login"]
  C --> C3["Move rate limits to Redis"]
  C --> C4["Secure image proxy"]
  C --> C5["Add .env.example"]
  C --> C6["Add API tests"]
```

## 12. Best Next Architecture Upgrade

Current session model:

```txt
User
  activeSessionId
  deviceToken
```

Better multi-device model:

```txt
User
  |
  +-- Session: web
  |     refreshTokenHash
  |     lastPingAt
  |     revokedAt
  |
  +-- Session: android
  |     deviceToken
  |     refreshTokenHash
  |     lastPingAt
  |     revokedAt
  |
  +-- Session: ios
        deviceToken
        refreshTokenHash
        lastPingAt
        revokedAt
```

Why this matters:

- Web and mobile can stay logged in together.
- Logout can target one device.
- Refresh tokens can rotate per device.
- Silent logout can target only the old mobile device.
- `logout all devices` remains possible.
