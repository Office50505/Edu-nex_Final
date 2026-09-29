# Common API k6 Step Reports

- Target: http://127.0.0.1:3102
- Report scope: local-real-2026-09-28
- Steps: 10, 100, 1000, 10000
- Auth endpoints included: no
- Subscription/access endpoints included: no

| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET / | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-root-10-requests.md |
| GET / | 100 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-root-100-requests.md |
| GET / | 1000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-root-1000-requests.md |
| GET / | 10000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-root-10000-requests.md |
| GET /api/health/db | 10 | pass | 10 | 0.00% | 100.00% | 26.80 ms | 29.04 ms | 29.64 ms | 29.79 ms | reports/k6/common-api-local-real-2026-09-28-health-db-10-requests.md |
| GET /api/health/db | 100 | pass | 100 | 0.00% | 100.00% | 36.99 ms | 110.83 ms | 213.03 ms | 329.70 ms | reports/k6/common-api-local-real-2026-09-28-health-db-100-requests.md |
| GET /api/health/db | 1000 | pass | 1000 | 0.00% | 100.00% | 861.76 ms | 1098.19 ms | 2007.70 ms | 2092.23 ms | reports/k6/common-api-local-real-2026-09-28-health-db-1000-requests.md |
| GET /api/health/db | 10000 | fail | 10000 | 0.00% | 100.00% | 4156.18 ms | 5026.08 ms | 5959.18 ms | 6211.05 ms | reports/k6/common-api-local-real-2026-09-28-health-db-10000-requests.md |
| GET /api/categories | 10 | pass | 10 | 0.00% | 100.00% | 4.00 ms | 15.09 ms | 21.51 ms | 23.12 ms | reports/k6/common-api-local-real-2026-09-28-categories-10-requests.md |
| GET /api/categories | 100 | pass | 100 | 0.00% | 100.00% | 2.04 ms | 3.40 ms | 3.62 ms | 3.77 ms | reports/k6/common-api-local-real-2026-09-28-categories-100-requests.md |
| GET /api/categories | 1000 | pass | 1000 | 0.00% | 100.00% | 3.14 ms | 7.68 ms | 8.62 ms | 9.15 ms | reports/k6/common-api-local-real-2026-09-28-categories-1000-requests.md |
| GET /api/categories | 10000 | pass | 10000 | 0.00% | 100.00% | 4.87 ms | 7.88 ms | 69.37 ms | 1019.57 ms | reports/k6/common-api-local-real-2026-09-28-categories-10000-requests.md |
| GET /api/courses | 10 | pass | 10 | 0.00% | 100.00% | 22.48 ms | 117.40 ms | 193.09 ms | 212.01 ms | reports/k6/common-api-local-real-2026-09-28-courses-10-requests.md |
| GET /api/courses | 100 | pass | 100 | 0.00% | 100.00% | 2.47 ms | 3.84 ms | 3.97 ms | 4.24 ms | reports/k6/common-api-local-real-2026-09-28-courses-100-requests.md |
| GET /api/courses | 1000 | pass | 1000 | 0.00% | 100.00% | 3.42 ms | 10.29 ms | 11.40 ms | 12.28 ms | reports/k6/common-api-local-real-2026-09-28-courses-1000-requests.md |
| GET /api/courses | 10000 | fail | 10000 | 0.00% | 100.00% | 96.69 ms | 7.72 ms | 4057.73 ms | 5050.00 ms | reports/k6/common-api-local-real-2026-09-28-courses-10000-requests.md |
| GET /api/courses/checkout-summary | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-checkout-summary-10-requests.md |
| GET /api/courses/checkout-summary | 100 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-checkout-summary-100-requests.md |
| GET /api/courses/checkout-summary | 1000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-checkout-summary-1000-requests.md |
| GET /api/courses/checkout-summary | 10000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-checkout-summary-10000-requests.md |
| GET /api/bunny/videos | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-bunny-videos-10-requests.md |
| GET /api/bunny/videos | 100 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-bunny-videos-100-requests.md |
| GET /api/bunny/videos | 1000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-bunny-videos-1000-requests.md |
| GET /api/bunny/videos | 10000 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-real-2026-09-28-bunny-videos-10000-requests.md |
