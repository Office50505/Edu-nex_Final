# Safety, ownership and provider accounting

Authentication middleware, entitlement services, course-owner retrieval assertions, protected-text checks, strict session schema and existing Unicode tests remain unchanged. The common identity validator retains the original original-name/security-normalized-view split, unsafe instruction patterns, compatibility-character rejection, bidi/default-ignorable checks, mixed Latin/Greek/Cyrillic-word rejection and role/name exclusions. Mandatory input refusals remain before all course handling. No provider decides access rights.

The task adds no unrestricted asset lookup. Course/topic recognition can identify a heading, but source copying still requires `materialsAvailable` and a matching asset inside authorized retrieved records. Every accepted assembled provider payload still passes the existing owner/text checks. The transient request plan contains user operations and task metadata, not a bypass capability.

Known diagnostics before: 12 blocked attempts on 6 provider-dependent turns. After: 56 blocked attempts on 28 provider-dependent turns. The unchanged adapter retries deliberate policy denial twice; those attempts are not transmitted HTTP requests or live model answers. Both stages inspect all 72 turns and report zero scope alerts. Final traces contain every attempted payload and denial.

The Phase 12 comparison uses 11 recorded upstream responses, explicitly marked fixture replay. Unexpected unmatched fixture requests: zero. No fixture is credited as live inference. Original critical scenarios make no external requests. Unit-test transport fixtures remain internal mocks; the full suite has no central aggregate counter of every fixture invocation. Its blanket network-denial preload prevents accidental external HTTP/fetch/socket activity.

**External AI requests:0. Production requests/data changes:0. Deployment/commit/push:0.** Keys were not loaded by the new59-case harness: it uses a synthetic never-transmitted key. The original historical runners use synthetic keys and recorded replies. No source course content was sent externally. Configured-secret value checks run before packaging without logging secret values.

Coverage is local and synthetic, not a security certification. Real provider quality, downstream usage/billing and production persistence/concurrency remain untested. The server-authoritative guards must remain release invariants for any later work.
