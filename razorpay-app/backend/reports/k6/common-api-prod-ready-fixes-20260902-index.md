# Common API k6 Step Reports

- Target: http://127.0.0.1:3113
- Report scope: prod-ready-fixes-20260902
- Steps: 10, 50
- Auth endpoints included: no
- Subscription/access endpoints included: no

| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET / | 10 | pass | 10 | 0.00% | 100.00% | 1.73 ms | 2.93 ms | 2.94 ms | 2.94 ms | reports/k6/common-api-prod-ready-fixes-20260902-root-10-requests.md |
| GET / | 50 | pass | 50 | 0.00% | 100.00% | 1.58 ms | 2.80 ms | 3.74 ms | 3.77 ms | reports/k6/common-api-prod-ready-fixes-20260902-root-50-requests.md |
| GET /api/health/db | 10 | pass | 10 | 0.00% | 100.00% | 70.50 ms | 212.71 ms | 224.84 ms | 227.88 ms | reports/k6/common-api-prod-ready-fixes-20260902-health-db-10-requests.md |
| GET /api/health/db | 50 | pass | 50 | 0.00% | 100.00% | 40.82 ms | 76.57 ms | 172.56 ms | 224.39 ms | reports/k6/common-api-prod-ready-fixes-20260902-health-db-50-requests.md |
| GET /api/categories | 10 | pass | 10 | 0.00% | 100.00% | 4.69 ms | 19.79 ms | 31.30 ms | 34.18 ms | reports/k6/common-api-prod-ready-fixes-20260902-categories-10-requests.md |
| GET /api/categories | 50 | pass | 50 | 0.00% | 100.00% | 1.77 ms | 3.13 ms | 3.43 ms | 3.45 ms | reports/k6/common-api-prod-ready-fixes-20260902-categories-50-requests.md |
| GET /api/courses | 10 | pass | 10 | 0.00% | 100.00% | 8.75 ms | 41.10 ms | 66.79 ms | 73.22 ms | reports/k6/common-api-prod-ready-fixes-20260902-courses-10-requests.md |
| GET /api/courses | 50 | pass | 50 | 0.00% | 100.00% | 1.78 ms | 3.01 ms | 3.38 ms | 3.55 ms | reports/k6/common-api-prod-ready-fixes-20260902-courses-50-requests.md |
| GET /api/courses/checkout-summary | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-ready-fixes-20260902-checkout-summary-10-requests.md |
| GET /api/courses/checkout-summary | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-ready-fixes-20260902-checkout-summary-50-requests.md |
| GET /api/bunny/videos | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-ready-fixes-20260902-bunny-videos-10-requests.md |
| GET /api/bunny/videos | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-ready-fixes-20260902-bunny-videos-50-requests.md |
