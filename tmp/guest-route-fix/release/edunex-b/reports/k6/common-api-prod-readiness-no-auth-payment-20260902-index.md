# Common API k6 Step Reports

- Target: http://localhost:3000
- Report scope: prod-readiness-no-auth-payment-20260902
- Steps: 10, 50
- Auth endpoints included: no
- Subscription/access endpoints included: no

| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET / | 10 | pass | 10 | 0.00% | 100.00% | 1.02 ms | 1.24 ms | 1.28 ms | 1.29 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-root-10-requests.md |
| GET / | 50 | pass | 50 | 0.00% | 100.00% | 1.55 ms | 2.21 ms | 2.58 ms | 2.70 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-root-50-requests.md |
| GET /api/health/db | 10 | pass | 10 | 0.00% | 100.00% | 33.61 ms | 35.16 ms | 35.57 ms | 35.67 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-health-db-10-requests.md |
| GET /api/health/db | 50 | pass | 50 | 0.00% | 100.00% | 45.65 ms | 65.96 ms | 311.63 ms | 381.83 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-health-db-50-requests.md |
| GET /api/categories | 10 | pass | 10 | 0.00% | 100.00% | 6.09 ms | 27.50 ms | 44.47 ms | 48.71 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-categories-10-requests.md |
| GET /api/categories | 50 | pass | 50 | 0.00% | 100.00% | 1.76 ms | 2.90 ms | 3.10 ms | 3.20 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-categories-50-requests.md |
| GET /api/courses | 10 | pass | 10 | 0.00% | 100.00% | 11.15 ms | 54.80 ms | 89.58 ms | 98.28 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-courses-10-requests.md |
| GET /api/courses | 50 | pass | 50 | 0.00% | 100.00% | 2.18 ms | 3.19 ms | 3.47 ms | 3.50 ms | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-courses-50-requests.md |
| GET /api/courses/checkout-summary | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-checkout-summary-10-requests.md |
| GET /api/courses/checkout-summary | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-checkout-summary-50-requests.md |
| GET /api/bunny/videos | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-bunny-videos-10-requests.md |
| GET /api/bunny/videos | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-prod-readiness-no-auth-payment-20260902-bunny-videos-50-requests.md |
