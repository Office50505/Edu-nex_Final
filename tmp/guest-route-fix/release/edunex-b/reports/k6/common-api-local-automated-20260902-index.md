# Common API k6 Step Reports

- Target: http://localhost:3000
- Report scope: local-automated-20260902
- Steps: 10, 50
- Auth endpoints included: no
- Subscription/access endpoints included: no

| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET / | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-automated-20260902-root-10-requests.md |
| GET / | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-automated-20260902-root-50-requests.md |
| GET /api/health/db | 10 | pass | 10 | 0.00% | 100.00% | 38.77 ms | 76.70 ms | 104.94 ms | 112.00 ms | reports/k6/common-api-local-automated-20260902-health-db-10-requests.md |
| GET /api/health/db | 50 | pass | 50 | 0.00% | 100.00% | 40.01 ms | 68.59 ms | 192.56 ms | 271.92 ms | reports/k6/common-api-local-automated-20260902-health-db-50-requests.md |
| GET /api/categories | 10 | pass | 10 | 0.00% | 100.00% | 1.54 ms | 2.24 ms | 2.39 ms | 2.43 ms | reports/k6/common-api-local-automated-20260902-categories-10-requests.md |
| GET /api/categories | 50 | pass | 50 | 0.00% | 100.00% | 8.77 ms | 30.74 ms | 135.11 ms | 232.36 ms | reports/k6/common-api-local-automated-20260902-categories-50-requests.md |
| GET /api/courses | 10 | pass | 10 | 0.00% | 100.00% | 14.90 ms | 75.19 ms | 122.91 ms | 134.84 ms | reports/k6/common-api-local-automated-20260902-courses-10-requests.md |
| GET /api/courses | 50 | pass | 50 | 0.00% | 100.00% | 2.28 ms | 4.18 ms | 4.52 ms | 4.58 ms | reports/k6/common-api-local-automated-20260902-courses-50-requests.md |
| GET /api/courses/checkout-summary | 10 | pass | 10 | 0.00% | 100.00% | 4.88 ms | 20.35 ms | 32.36 ms | 35.37 ms | reports/k6/common-api-local-automated-20260902-checkout-summary-10-requests.md |
| GET /api/courses/checkout-summary | 50 | pass | 50 | 0.00% | 100.00% | 2.07 ms | 3.97 ms | 4.97 ms | 5.26 ms | reports/k6/common-api-local-automated-20260902-checkout-summary-50-requests.md |
| GET /api/bunny/videos | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-automated-20260902-bunny-videos-10-requests.md |
| GET /api/bunny/videos | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-automated-20260902-bunny-videos-50-requests.md |
