# EduNex Master Scalability Report

Generated: 2026-06-17

## Executive Summary

EduNex now has a clean local proof point for **1,700 concurrent complete safe-read users** when using the corrected architecture:

- Frontend static bundle served separately by Nginx.
- Backend API served separately by Express.
- Public read APIs optimized with lean queries, smaller payloads, and short TTL cache.

The best validated local result is:

| Test | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Complete journey, Nginx static + API | 1,700 | 0.00% | 100.00% | 50.01 ms | 134.13 ms | 157.00 ms | PASS |

The same single-machine local setup failed at 2,000, 2,500, and 10,000 VUs with `connect: can't assign requested address`, `dial: i/o timeout`, EOF, and request timeout errors. Those errors indicate local load-generator/loopback socket exhaustion, so the 2,000+ local failures should not be treated as final production capacity verdicts.

Current conclusion:

- 1,700 concurrent users: locally validated pass with Nginx static + API split.
- 2,000 concurrent users: local test environment becomes unreliable.
- 2,500 concurrent users: local test environment is already unreliable.
- 10,000 concurrent users: cannot be certified from this single local machine.
- To validate 10,000 users, run k6 from separate load generator machine(s) against a production-like deployment with CDN/static hosting, load-balanced API instances, shared cache, and monitoring.

## Test Scope

The complete safe-read journey includes 8 requests per virtual user:

- `GET /`
- `GET /login.html`
- `GET /signup.html`
- `GET /courses.html`
- `GET /about.html`
- `GET /api/categories`
- `GET /api/courses`
- `GET /api/courses/checkout-summary`

Excluded from these tests:

- Login submissions
- Signup/OTP writes
- Payment writes
- AI chat calls
- Admin mutations
- Wishlist toggles
- Deletes
- Real browser JavaScript execution
- Video streaming throughput

Thresholds used by the k6 complete journey script:

- Failed request rate below 1%
- Check pass rate above 99%
- p95 below 2,000 ms
- p99 below 5,000 ms

## Chronological Results

### 1. Early Gradual Complete Journey Baseline

Source: `reports/k6/complete-local-compiled-report.md`

This older step test used lower VU counts and increasing journey counts.

| Step | VUs | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 journeys | 10 | 8,000 | 0.00% | 100.00% | 24.55 ms | 114.40 ms | 145.84 ms | PASS |
| 5,000 journeys | 50 | 40,000 | 0.00% | 100.00% | 71.81 ms | 764.61 ms | 870.82 ms | PASS |
| 10,000 journeys | 100 | 80,000 | 0.00% | 100.00% | 208.68 ms | 1,234.79 ms | 1,986.73 ms | PASS |
| 25,000 journeys | 250 | 200,000 | 0.00% | 100.00% | 753.38 ms | 4,015.97 ms | 4,972.39 ms | FAIL: p95 |
| 50,000 journeys | 500 | 400,000 | 0.01% | 99.99% | 1,715.08 ms | 9,030.76 ms | 9,991.97 ms | FAIL: p95, p99 |

Interpretation:

The app behaved well at lower concurrency and lower pressure. Latency started failing around the 250 VU / 25,000 journey tier and became clearly saturated by 500 VUs.

### 2. API Step Tests

Source: `reports/k6/common-api-index.md`

| Endpoint | Load | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /api/health/db` | 10 | 1 | 0.00% | 100.00% | 116.96 ms | 302.28 ms | 304.65 ms | PASS |
| `GET /api/health/db` | 100 | 10 | 0.00% | 100.00% | 67.90 ms | 219.99 ms | 520.02 ms | PASS |
| `GET /api/health/db` | 1,000 | 100 | 0.00% | 100.00% | 851.00 ms | 1,006.70 ms | 1,975.85 ms | PASS |
| `GET /api/health/db` | 10,000 | 250 | 0.00% | 100.00% | 2,552.24 ms | 3,017.06 ms | 3,936.28 ms | FAIL: latency |
| `GET /api/categories` | 10,000 | 250 | 0.00% | 100.00% | 675.69 ms | 1,007.43 ms | 1,017.47 ms | PASS |
| `GET /api/courses` | 1,000 | 100 | 0.00% | 100.00% | 736.20 ms | 1,286.21 ms | 1,786.16 ms | PASS |

Interpretation:

The public read endpoints returned correct responses, but `/api/health/db` was too heavy for repeated diagnostic use at high volume. A lightweight `/api/health` endpoint was added later.

### 3. Initial True 1,000 Concurrent Complete Test

Source: `reports/k6/complete-local-complete-1000-concurrent-users.md`

| Metric | Value |
| --- | ---: |
| VUs | 1,000 |
| User journeys | 1,000 |
| HTTP requests | 8,000 |
| Failed request rate | 2.44% |
| Check pass rate | 97.56% |
| Avg | 4,443.13 ms |
| p95 | 25,129.07 ms |
| p99 | 26,862.26 ms |
| Max | 28,192.08 ms |
| Result | FAIL |

Interpretation:

The first real 1,000 concurrent complete test failed. Main issues were Vite dev-server/static timeouts and backend public read latency.

### 4. Initial `/api/courses` 1,000 Concurrent Isolation Test

Source: `reports/k6/common-api-api-courses-1000-concurrent.md`

| Metric | Value |
| --- | ---: |
| VUs | 1,000 |
| Requests | 1,000 |
| Failed request rate | 0.00% |
| Check pass rate | 100.00% |
| Avg | 10,197.26 ms |
| p95 | 13,182.30 ms |
| p99 | 13,205.44 ms |
| Max | 15,868.89 ms |
| Result | FAIL: latency |

Interpretation:

`GET /api/courses` did not fail functionally, but it was far too slow. This endpoint became the first backend optimization target.

## Optimization Progress

### Public Read API Optimization

Implemented:

- Short TTL in-process cache for public read endpoints.
- Cache headers for public course/category reads.
- `GET /api/categories` changed to `.lean()`.
- `GET /api/courses` changed to:
  - projection instead of full course documents
  - category field projection
  - sorting by publish/create date
  - limit 100
  - `.lean()`
  - short TTL cache
- Lightweight `GET /api/health`.
- Course create/update/delete clears public read caches.

Before/after for `GET /api/courses` at 1,000 VUs:

| Test | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Before optimization | 0.00% | 100.00% | 10,197.26 ms | 13,182.30 ms | 13,205.44 ms | FAIL |
| After optimization | 0.00% | 100.00% | 11.49 ms | 32.66 ms | 34.05 ms | PASS |

Source after optimization: `reports/k6/common-api-api-courses-1000-concurrent-after-public-read-cache.md`

Interpretation:

The hot public course API bottleneck was removed from the immediate critical path.

### Complete Journey After API Optimization

Sources:

- `reports/k6/complete-local-complete-1000-concurrent-after-public-read-cache.md`
- `reports/k6/complete-local-complete-1000-concurrent-express-static-after-public-read-cache.md`

| Frontend/API setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Vite dev server on `:5173`, API on `:3000` | 1,000 | 8.63% | 91.38% | 62.74 ms | 173.45 ms | 398.55 ms | FAIL |
| Express static + API on `:3000` | 1,000 | 6.11% | 93.89% | 1,404.06 ms | 12,956.76 ms | 15,782.59 ms | FAIL |

Interpretation:

After API optimization, the remaining failures shifted to serving architecture: dev/static serving path and single-process static+API serving.

### Production Frontend Bundle Through Express

Source: `reports/k6/complete-local-complete-1000-concurrent-prod-static-after-public-read-cache.md`

| Setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Express serving production `dist` + API on `:3000` | 1,000 | 2.81% | 97.19% | 253.37 ms | 1,865.47 ms | 4,736.62 ms | FAIL |

Interpretation:

The production bundle improved latency dramatically, but the single Express process still dropped too many requests under the burst.

### Split Frontend/API With Vite Preview

Source: `reports/k6/complete-local-complete-1000-concurrent-split-preview-api.md`

| Setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Vite preview `:4173`, API `:3000` | 1,000 | 1.81% | 98.19% | 20.85 ms | 75.79 ms | 175.54 ms | FAIL |

Interpretation:

Splitting static and API serving made latency excellent, but Vite preview still failed reliability thresholds.

### Split Frontend/API With Nginx Static Serving

Source: `reports/k6/complete-local-complete-1000-concurrent-nginx-static-api.md`

| Setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Nginx static `:8080`, API `:3000` | 1,000 | 0.00% | 100.00% | 52.24 ms | 113.47 ms | 144.46 ms | PASS |

Interpretation:

This is the first clean 1,000 concurrent complete-user pass. It validates the architecture direction:

- Static frontend should be served by CDN/static server.
- API should be separate.
- Hot public API reads must be cached and lightweight.

## Higher-Concurrency Local Attempts

### 2,500 VU Local Attempt

Source: `reports/k6/complete-local-complete-2500-concurrent-nginx-static-api.md`

| Setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Nginx static `:8080`, API `:3000` | 2,500 | 18.55% | 81.45% | 987.87 ms | 3,970.28 ms | 10,368.32 ms | FAIL |

Observed failures:

- `connect: can't assign requested address`
- `dial: i/o timeout`

Interpretation:

The failure pattern points strongly to local load-generator/loopback socket exhaustion. Nginx and API recovered immediately after the run.

### 10,000 VU Local Attempt

Source: `reports/k6/complete-local-complete-10000-concurrent-nginx-static-api.md`

| Setup | VUs | Failed | Checks | Avg | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Nginx static `:8080`, API `:3000` | 10,000 | 78.86% | 21.23% | 5,678.00 ms | 33,703.80 ms | 45,315.13 ms | FAIL |

Observed failures:

- `connect: can't assign requested address`
- `dial: i/o timeout`
- `request timeout`
- `EOF`
- `http: server closed idle connection`

Interpretation:

This is not a valid production-capacity verdict. The local machine running k6 could not allocate enough outbound local connections during the burst. The result shows the single-machine local test setup cannot certify 10,000 concurrent complete users.

## Current Validated State

| Capability | Status |
| --- | --- |
| 1,000 concurrent complete safe-read users, Nginx static + API split | PASS |
| Hot `GET /api/courses` at 1,000 VUs after optimization | PASS |
| 2,500 concurrent complete users on one local machine | FAIL, likely load-generator/socket limit |
| 10,000 concurrent complete users on one local machine | FAIL, local test environment invalid for certification |
| Production 10k support claim | NOT YET VALIDATED |

## Key Flaws Found And Addressed

Addressed:

- Vite dev server was not suitable for load testing.
- `GET /api/courses` was too heavy and slow.
- Public read APIs lacked short TTL caching.
- Static frontend and API were competing in the same process.
- Health endpoint strategy needed a lightweight non-DB path.

Remaining:

- Need CDN/static hosting in production.
- Need shared cache such as Redis, not only in-process cache.
- Need horizontal API scaling behind a load balancer.
- Need production observability.
- Need external load generation for 2,500, 5,000, and 10,000 user tests.
- Need tests for authenticated flows, AI, video, payment sandbox, and real browser behavior.

## Recommended 10k Validation Plan

Use a production-like deployment:

- Frontend on CDN/static hosting such as Netlify, CloudFront, or equivalent.
- API behind load balancer.
- Multiple API instances.
- Shared Redis cache for public reads.
- MongoDB Atlas monitoring and slow query analysis enabled.
- k6 running from one or more separate load generator machines.

Staged test plan:

| Stage | Concurrent users | Duration | Requirement |
| --- | ---: | ---: | --- |
| Smoke | 100 | 5 min | No failures |
| Baseline | 500 | 10 min | p95 under 500 ms public reads |
| Current proven target | 1,000 | 15 min | Must pass cleanly |
| Growth | 2,500 | 15 min | Validate scaling/caching |
| High load | 5,000 | 20 min | Validate load balancer/API pool |
| Final target | 10,000 | 30 min | Certify production target |
| Soak | expected peak | 2-4 hr | Check memory, DB pools, leaks |

Production pass criteria:

- Failed request rate below 0.1%.
- Check pass rate above 99.9%.
- p95 public read APIs below 500 ms.
- p95 page shell from CDN below 300 ms.
- p99 normal public reads below 1,500-2,500 ms.
- No database connection exhaustion.
- No unbounded memory growth.
- No sustained event-loop lag.

## Artifacts

Current retained report:

- `reports/k6/edunex-master-scalability-report.md`

Supporting config:

- `.loadtest/nginx/nginx.conf`

## Latest Gradual Local Test: 1,000 to 2,000 VUs

Generated: 2026-06-17

Setup:

- Frontend: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:3000`
- Frontend served by local Nginx from production `dist`
- Backend served by local Express API
- k6 run from the same local machine
- Complete safe-read journey, 8 requests per user

| VUs | User journeys | HTTP requests | Failed | Checks | Avg | p95 | p99 | Max | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 | 1,000 | 8,000 | 0.00% | 100.00% | 33.18 ms | 81.91 ms | 98.48 ms | 368.55 ms | PASS |
| 1,200 | 1,200 | 9,600 | 0.00% | 100.00% | 40.49 ms | 113.69 ms | 139.48 ms | 181.54 ms | PASS |
| 1,500 | 1,500 | 12,000 | 0.00% | 100.00% | 30.35 ms | 95.77 ms | 129.74 ms | 135.36 ms | PASS |
| 1,700 | 1,700 | 13,600 | 0.00% | 100.00% | 50.01 ms | 134.13 ms | 157.00 ms | 193.23 ms | PASS |
| 2,000 | 2,000 | 16,000 | 56.34% | 43.66% | 1,251.51 ms | 5,539.47 ms | 6,908.49 ms | 8,118.98 ms | FAIL |

Interpretation:

- The local setup passed cleanly through 1,700 concurrent complete safe-read users.
- The 2,000 VU run failed with `connect: can't assign requested address` and `dial: i/o timeout`.
- Both frontend and backend returned `200` immediately after the failed 2,000 VU run, so the app did not appear to crash.
- The most likely limiting factor at 2,000 VUs is the single local machine acting as load generator and application host at the same time.
- This improves the local confidence boundary from 1,000 to 1,700 VUs, but it still does not certify production 2,000+ or 10,000-user capacity.

## Final Conclusion

The project has made meaningful scalability progress.

Before optimization, the full 1,000 concurrent journey failed with p95 above 25 seconds. After optimizing public read APIs and serving the frontend separately with Nginx, the full 1,000 concurrent safe-read journey passed with 0% failures and p95 around 113 ms.

The app is now locally validated for 1,700 concurrent safe-read users under the corrected architecture. The local machine cannot reliably validate 2,000, 2,500, or 10,000 concurrent users because k6 and the services are competing on the same host and the run hits local socket exhaustion. The next credible step is external/cloud load generation against a production-like deployment.
