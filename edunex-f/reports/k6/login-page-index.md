# Login Page k6 Step Reports

- Target: http://localhost:5174/login.html
- Steps: 10, 100, 1000, 10000

| Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10 | pass | 10 | 0.00% | 100.00% | 5.57 ms | 9.58 ms | 10.61 ms | 10.87 ms | reports/k6/login-page-10-requests.md |
| 100 | pass | 100 | 0.00% | 100.00% | 4.25 ms | 7.05 ms | 7.94 ms | 8.12 ms | reports/k6/login-page-100-requests.md |
| 1000 | pass | 1000 | 0.00% | 100.00% | 6.53 ms | 19.98 ms | 26.13 ms | 28.66 ms | reports/k6/login-page-1000-requests.md |
| 10000 | pass | 10000 | 0.00% | 100.00% | 3.63 ms | 11.10 ms | 16.35 ms | 26.42 ms | reports/k6/login-page-10000-requests.md |
