# Provider Connectivity Report - AI Product Photoshoot & Ads

Generated: 2026-10-14 18:46 IST

## Checks

- Configured fal credential presence: present, not printed
- Configured model: google/gemini-2.5-flash
- No-auth endpoint check: reachable; configured endpoint returned 401 without auth as expected
- Authenticated minimal provider probe: PASS, HTTP 200, response preview was "ok"
- Live evaluation provider path: fal-openrouter

## Runtime Notes

- Non-escalated sandboxed Node DNS previously failed with ENOTFOUND for fal.run.
- Authorized network-accessible execution succeeded for DNS, endpoint reachability, and live model calls.
- During evaluation, some route calls exceeded the service timeout and fell back to built-in-course-guide; those were retried. Two cases still timed out after retries.
