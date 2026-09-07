# EduNex Scalability Analysis

Generated: 2026-06-17

## Executive Summary

EduNex has made major scalability progress. The project moved from failing at 1,000 concurrent complete safe-read users to passing cleanly at 1,800 concurrent safe-read users on a single local machine.

The current strongest clean local result is:

| Users | Failed | Checks | Avg | p95 | p99 | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,800 | 0.00% | 100.00% | 57.98 ms | 188.96 ms | 203.83 ms | PASS |

The local test environment becomes unstable between 1,900 and 2,000 users. The failures at 1,900, 2,000, 2,500, and 10,000 users are dominated by local networking and load-generator errors such as:

- `connect: can't assign requested address`
- `dial: i/o timeout`
- EOF/request timeout errors

Because the app recovered immediately after failed runs, those upper-range failures should not be treated as final proof that the application itself cannot support those user counts. They show that one local machine cannot reliably act as both the app host and high-concurrency load generator.

Current conservative conclusion:

EduNex is locally validated for **1,800 concurrent complete safe-read users** under the Nginx static frontend plus Express API architecture.

Current production-readiness conclusion:

EduNex is not yet certified for **10,000 concurrent users**. Reaching that target requires production-like hosting, external/distributed load generation, multiple API instances, shared Redis caching, monitoring, and broader tests for authenticated/write-heavy flows.

## Current Scalability Strengths

### 1. Public Course API Bottleneck Was Removed

The original `/api/courses` endpoint was the largest backend bottleneck. Before optimization, it had very high latency under 1,000 concurrent access.

| State | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Before optimization | 0.00% | 100.00% | 10,197.26 ms | 13,182.30 ms | 13,205.44 ms | FAIL |
| After optimization | 0.00% | 100.00% | 11.49 ms | 32.66 ms | 34.05 ms | PASS |

What improved:

- `.lean()` queries for public reads
- selected fields instead of full documents
- limited public course list response size
- short TTL cache
- public cache headers
- cache invalidation after course/category writes

### 2. Frontend/API Separation Improved Reliability

Earlier tests failed because frontend static serving competed with backend API traffic. The system improved once static frontend serving was separated from Express.

Best local architecture so far:

- Frontend production bundle served by Nginx
- Backend API served by Express
- API public reads optimized and cached

This setup passed 1,000, 1,200, 1,500, 1,700, and 1,800 concurrent safe-read users cleanly.

### 3. Redis-Ready Shared Cache Has Been Added

The backend now supports a cache adapter that uses Redis when `REDIS_URL` is configured and falls back to in-memory cache when Redis is not configured.

Cached public read paths:

- `GET /api/categories`
- `GET /api/courses`
- `GET /api/courses/checkout-summary`

Why this matters:

- In-memory cache is acceptable for one local process.
- Redis is required when running multiple API instances.
- Shared cache prevents every API instance from hitting MongoDB independently.
- Cache headers now expose whether responses are cache hits/misses.

Verification completed:

- `/api/health` reports current cache backend.
- Local cache fallback returned `cache: "memory"`.
- Public read routes showed miss then hit behavior.
- Checkout summary route showed miss then hit behavior.

### 4. MongoDB Index Coverage Has Improved

A MongoDB index audit/create script was added:

- `npm run db:index:audit`
- `npm run db:index:create`

The latest audit reports:

| Metric | Value |
| --- | ---: |
| Models audited | 19 |
| Missing schema indexes | 0 |

New or improved index coverage includes:

- published course list sorting/filtering
- course status/category/published date patterns
- active category ordering
- user subscription/admin dashboard filters
- optional unique email/mobile indexes with partial filters
- order status/type filters

This reduces the risk of MongoDB collection scans as data volume grows.

## Current Scalability Limits

### 1. Local Testing Is Now the Immediate Bottleneck

The local machine cannot reliably validate high concurrency beyond about 1,800 users. Evidence:

| Users | Failed | Result | Interpretation |
| ---: | ---: | --- | --- |
| 1,800 | 0.00% | PASS | Clean local pass |
| 1,900 | 79.97% | FAIL | Local socket exhaustion/noisy result |
| 1,950 | 0.19% | PASS | Passed thresholds but had dial timeouts |
| 2,000 | 56.34% | FAIL | Local socket exhaustion |
| 2,500 | 18.55% | FAIL | Local socket exhaustion |
| 10,000 | 78.86% | FAIL | Local socket/load-generator exhaustion |

The inconsistent 1,900 failure followed by a 1,950 pass means the local upper-bound tests are noisy. This is not a clean application capacity curve.

### 2. Current Tests Are Safe-Read Heavy

The current successful tests mainly prove public read scalability for:

- page shell/static HTML requests
- category list reads
- course list reads
- checkout summary reads

They do not yet prove full-product scalability for:

- login
- signup/OTP
- payments
- wishlist writes
- progress tracking writes
- admin dashboards
- AI tutor sessions
- notification delivery
- video streaming

This matters because write-heavy and external-service-heavy paths can bottleneck differently from cached public reads.

### 3. Single API Process Is Not a 10k Architecture

Even though local results are much better, a single Express process should not be treated as the production plan for 10,000 users.

To support 10,000 concurrent users, the API should run as multiple stateless instances behind a load balancer. Redis should provide shared cache/session/rate-limit state where needed.

### 4. Observability Is Still Limited

The current tests give k6 client-side metrics, but true scalability analysis also needs server-side metrics:

- API CPU
- API memory
- Node event-loop lag
- MongoDB query latency
- MongoDB connection pool usage
- Redis hit/miss/error rate
- load balancer status codes
- Nginx/CDN active connections
- per-route p95/p99 latency

Without these, it is harder to know exactly which layer is saturated during high load.

## 10,000-User Scalability Gap

EduNex is moving in the right direction, but there is still a gap between current validated capacity and the 10,000-user target.

Current validated state:

- 1,800 concurrent safe-read users locally
- fast cached public reads
- Nginx/static split proven locally
- Redis-ready cache code implemented
- MongoDB index audit clean

Still needed for 10,000:

- CDN/static hosting for frontend
- multiple backend API instances
- Redis deployed and configured with `REDIS_URL`
- load balancer in front of API instances
- external/distributed k6 generators
- production monitoring
- write-flow load tests
- soak tests
- rate limits on expensive endpoints
- background queues for slow work

## Recommended Scalability Roadmap

### Phase 1: Production-Like Read Scalability

Goal: prove stable 2,000 to 5,000 safe-read users outside the local machine.

Actions:

- Deploy frontend to CDN/static hosting.
- Deploy backend as at least 2 API instances.
- Deploy Redis and set `REDIS_URL`.
- Put API instances behind a load balancer.
- Run k6 from an external/cloud machine.
- Test 1,000, 1,800, 2,000, 2,500, and 5,000 safe-read users.

Pass criteria:

- failed request rate below 0.1%
- check pass rate above 99.9%
- p95 public reads below 500 ms
- p99 public reads below 1,500-2,500 ms
- no DB connection exhaustion
- Redis cache hit rate high for public reads

### Phase 2: Authenticated User Journey Scalability

Goal: prove real product behavior, not only cached public reads.

Add k6 journeys for:

- login
- signup/OTP test-mode flow
- course detail
- wishlist toggle
- progress update
- checkout summary
- payment sandbox callback
- AI tutor prompt

Important: run write flows at realistic ratios. For example, not all 10,000 users should be signing up or paying at the exact same second unless testing a launch spike.

### Phase 3: Backend Hardening

Goal: prevent expensive routes from hurting normal browsing.

Actions:

- Add rate limiting for auth, OTP, AI, payment, and admin routes.
- Move slow jobs to queues:
  - OTP/email sending
  - notifications
  - analytics aggregation
  - certificate generation
  - AI-related long tasks where possible
- Paginate all admin/list endpoints.
- Avoid heavy `populate()` chains on hot paths.
- Add request IDs and structured logs.
- Add per-route latency logging.

### Phase 4: 10,000-User Certification

Goal: certify the real target.

Recommended test sequence:

| Stage | Users | Duration | Purpose |
| --- | ---: | ---: | --- |
| Smoke | 100 | 5 min | verify deployment |
| Baseline | 500 | 10 min | confirm basic stability |
| Current local proof | 1,800 | 15 min | compare against local result |
| Growth | 2,500 | 15 min | verify scaling |
| High load | 5,000 | 20 min | validate API pool/cache |
| Target | 10,000 | 30 min | certify peak |
| Soak | expected peak | 2-4 hr | catch leaks and slow degradation |

## Highest-Risk Areas To Watch

### MongoDB

Even with indexes, MongoDB can still become the bottleneck if:

- cache hit rate is low
- API instances use too many connections
- admin dashboards run large aggregations during peak traffic
- write-heavy progress/analytics traffic grows

Recommended controls:

- enable slow query monitoring
- track connection pool usage
- set sane max pool sizes per API instance
- keep public read cache hit rate high
- run heavy analytics as background jobs

### Node/Express API

Node can scale well for I/O-heavy APIs, but one process is limited.

Recommended controls:

- run multiple stateless API instances
- avoid CPU-heavy synchronous work in request handlers
- monitor event-loop lag
- move slow external calls out of hot request paths
- add request timeout handling

### External Services

OTP, payment provider calls, push notifications, AI calls, and video/CDN operations can all bottleneck separately.

Recommended controls:

- isolate external-service traffic from public browsing
- add retries with backoff
- add circuit breakers where appropriate
- queue non-urgent work
- rate-limit abusive paths

## Final Assessment

EduNex is no longer blocked by the original public course-list bottleneck. The public-read layer is now much stronger, and the app has a clean local pass at 1,800 concurrent complete safe-read users.

The next scalability challenge is architecture and validation:

- Use Redis in production, not only memory fallback.
- Run multiple API instances.
- Serve frontend through CDN/static hosting.
- Generate load externally.
- Expand testing beyond safe reads.
- Add observability so bottlenecks are measurable.

Current confidence:

- **1,800 concurrent safe-read users:** locally validated
- **1,900-2,000 concurrent safe-read users:** inconclusive locally due to test-machine socket instability
- **2,500+ concurrent users:** requires external/cloud validation
- **10,000 concurrent users:** achievable only after production-like scaling and distributed testing

The best next engineering step is to deploy the Redis-backed multi-instance version and repeat the 1,800 to 5,000 safe-read tests from an external load generator.
