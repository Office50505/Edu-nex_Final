# EduNex 1,000 to 2,000 User Scalability Report

Generated: 2026-06-17

## Executive Summary

EduNex was tested locally from 1,000 to 2,000 concurrent complete safe-read users using the corrected load-test architecture:

- Frontend production bundle served by local Nginx on `127.0.0.1:8080`
- Backend Express API served on `127.0.0.1:3000`
- k6 running from the same local machine
- Complete safe-read journey, 8 requests per user

The strongest clean local result is **1,800 concurrent users** with 0.00% failed requests and p95 of 188.96 ms.

The upper range is unstable on this single local machine:

- 1,900 users failed badly with local socket errors.
- 1,950 users passed thresholds, but still had a small number of dial timeouts.
- 2,000 users failed badly with local socket errors.

This means the app looks healthy through 1,800 users locally, but this machine cannot reliably certify the true limit between 1,900 and 2,000 users. The non-monotonic 1,900 failure followed by a mostly successful 1,950 run strongly suggests local OS/socket/load-generator noise, not a clean application capacity curve.

## Test Scope

Each virtual user performed the following 8 requests:

- `GET /`
- `GET /login.html`
- `GET /signup.html`
- `GET /courses.html`
- `GET /about.html`
- `GET /api/categories`
- `GET /api/courses`
- `GET /api/courses/checkout-summary`

Excluded from this test:

- Login writes
- Signup/OTP writes
- Payment writes
- AI chat
- Admin mutations
- Wishlist changes
- Video streaming
- Real browser JavaScript execution

Pass thresholds:

- Failed request rate below 1%
- Check pass rate above 99%
- p95 below 2,000 ms
- p99 below 5,000 ms

## Results

| VUs | User journeys | HTTP requests | Failed | Checks | Avg | p95 | p99 | Max | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 | 1,000 | 8,000 | 0.00% | 100.00% | 33.18 ms | 81.91 ms | 98.48 ms | 368.55 ms | PASS |
| 1,200 | 1,200 | 9,600 | 0.00% | 100.00% | 40.49 ms | 113.69 ms | 139.48 ms | 181.54 ms | PASS |
| 1,500 | 1,500 | 12,000 | 0.00% | 100.00% | 30.35 ms | 95.77 ms | 129.74 ms | 135.36 ms | PASS |
| 1,700 | 1,700 | 13,600 | 0.00% | 100.00% | 50.01 ms | 134.13 ms | 157.00 ms | 193.23 ms | PASS |
| 1,800 | 1,800 | 14,400 | 0.00% | 100.00% | 57.98 ms | 188.96 ms | 203.83 ms | 227.37 ms | PASS |
| 1,900 | 1,900 | 15,200 | 79.97% | 20.03% | 663.39 ms | 6,995.25 ms | 9,585.29 ms | 23,266.62 ms | FAIL |
| 1,950 | 1,950 | 15,600 | 0.19% | 99.81% | 48.98 ms | 166.40 ms | 208.25 ms | 235.31 ms | PASS |
| 2,000 | 2,000 | 16,000 | 56.34% | 43.66% | 1,251.51 ms | 5,539.47 ms | 6,908.49 ms | 8,118.98 ms | FAIL |

## Interpretation

The 1,000 through 1,800 runs are strong local passes. Latency remains far below the thresholds, and failed request rate remains 0.00%.

The 1,900 and 2,000 runs failed because k6 could not consistently open local TCP connections. The observed errors included:

- `connect: can't assign requested address`
- `dial: i/o timeout`

The frontend and backend responded with HTTP 200 immediately after the failing runs, so the services did not appear to crash or remain saturated. That recovery pattern points to local load-generator and OS networking exhaustion.

The 1,950 run passed thresholds after the 1,900 failure. That non-monotonic result means the local machine is not producing a stable capacity curve in this upper range. Treat 1,900 to 2,000 as the local test environment's instability zone, not as a precise application breaking point.

## Current Capacity Statement

Conservative local statement:

EduNex is locally validated for **1,800 concurrent complete safe-read users** under the Nginx static frontend plus Express API architecture.

Aggressive local statement:

EduNex can sometimes pass near **1,950 concurrent complete safe-read users**, but the result is not stable enough to certify because neighboring runs at 1,900 and 2,000 failed from local networking errors.

Production statement:

This local machine cannot certify 2,000+ or 10,000 concurrent users. To certify those targets, the next test must run k6 from separate load generator machine(s) against a production-like deployment.

## Recommendations

Immediate next step:

- Repeat 1,800, 1,900, 1,950, and 2,000 from an external machine or cloud runner.
- Add a short cooldown between runs to reduce OS socket reuse noise.
- Capture server-side metrics during the tests: CPU, memory, event-loop lag, MongoDB query latency, MongoDB connection pool usage, and Nginx active connections.

For 10,000-user readiness:

- Serve frontend through CDN/static hosting.
- Run multiple API instances behind a load balancer.
- Move public read cache from in-process memory to shared Redis.
- Add production observability and alerting.
- Run distributed k6 load generation instead of single-machine local load generation.

## Conclusion

The clean local confidence boundary has moved from 1,700 to **1,800 concurrent users**.

The range from 1,900 to 2,000 is inconclusive locally because the load generator hits socket exhaustion and produces inconsistent results. The app itself continues to recover immediately after failed runs, so the next meaningful scalability proof requires external/distributed load generation.
