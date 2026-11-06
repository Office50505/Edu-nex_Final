# Common API k6 Step Reports

- Target: http://localhost:3000
- Report scope: local-security-pass
- Steps: 10, 50
- Auth endpoints included: no
- Subscription/access endpoints included: no

| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET / | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-root-10-requests.md |
| GET / | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-root-50-requests.md |
| GET /api/health/db | 10 | pass | 10 | 0.00% | 100.00% | 156.44 ms | 665.05 ms | 982.83 ms | 1062.28 ms | reports/k6/common-api-local-security-pass-health-db-10-requests.md |
| GET /api/health/db | 50 | pass | 50 | 0.00% | 100.00% | 338.31 ms | 1072.43 ms | 1221.35 ms | 1223.65 ms | reports/k6/common-api-local-security-pass-health-db-50-requests.md |
| GET /api/categories | 10 | pass | 10 | 0.00% | 100.00% | 4.39 ms | 18.36 ms | 28.60 ms | 31.16 ms | reports/k6/common-api-local-security-pass-categories-10-requests.md |
| GET /api/categories | 50 | pass | 50 | 0.00% | 100.00% | 2.25 ms | 3.49 ms | 3.71 ms | 3.80 ms | reports/k6/common-api-local-security-pass-categories-50-requests.md |
| GET /api/courses | 10 | pass | 10 | 0.00% | 100.00% | 1.59 ms | 1.92 ms | 2.01 ms | 2.03 ms | reports/k6/common-api-local-security-pass-courses-10-requests.md |
| GET /api/courses | 50 | pass | 50 | 0.00% | 100.00% | 2.06 ms | 3.18 ms | 3.68 ms | 3.73 ms | reports/k6/common-api-local-security-pass-courses-50-requests.md |
| GET /api/courses/checkout-summary | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-checkout-summary-10-requests.md |
| GET /api/courses/checkout-summary | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-checkout-summary-50-requests.md |
| GET /api/bunny/videos | 10 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-bunny-videos-10-requests.md |
| GET /api/bunny/videos | 50 | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/common-api-local-security-pass-bunny-videos-50-requests.md |
