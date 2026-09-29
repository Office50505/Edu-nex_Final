# Admin subscription and data fixes — 25 September 2026

Implemented in the local working tree; not committed, pushed or deployed. Existing local work was preserved. No live users, subscriptions or payment settings were modified.

## Why the screenshots showed those messages

- Activity and Certificates contained hard-coded placeholders; Activity did not call the existing admin-action endpoint.
- Dashboard report counts were read from fields not supplied by analytics. The missing value became “Not returned open learner issues.”
- The learner verification label required both email and mobile verification, although authentication supports mobile-verified learners without email. It now reflects mobile verification.
- The drawer subscription button was disabled. Course ownership editing was implemented separately and could not change global subscription status.

## Database inspection

Read-only aggregate counts: User `none`: 5; Subscription `pending`: 1; RazorpayBilling `ready`: 1. These were separate aggregate queries; no personal records were printed.

The User schema supports `none`, `trial`, `1rs trial`, `active`, `subscribed`, `cancelled`, `expired`. Subscription documents additionally support `pending` and `paused`. Access resolution treats trial aliases as trial access, and active/subscribed as subscribed access, with expiry checks.

## Changes

- Removed global header search across the admin panel; retained the learner list's own filtering.
- Added a subscription editor in both the learner management section and drawer: None, Trial, Subscribed, access duration and audit reason. Defaults are one day for Trial and 30 days for Subscribed.
- Subscription saves update User, Subscription and AdminUserAction in a MongoDB transaction. None maps to User `none` and Subscription `paused`; Trial maps to `trial`; Subscribed maps to `subscribed`. Stale entitlement dates are cleared and prior trial history is retained. Separately purchased courses remain unchanged.
- Existing grant/revoke API inputs map to subscribed/none for compatibility.
- Pending/ongoing payment setups block manual changes with an explanatory 409 response. No automatic cancellation or charging is performed. A closed provider mandate is recorded on the admin subscription so reconciliation of that old mandate cannot silently restore revoked access.
- Activity now loads real admin actions, with loading, empty and failure states. It is labelled “Admin action history,” not a claim to include all learner events.
- Certificates now use a protected learner-specific endpoint and link to issued certificates. Removed unsupported resend/export drawer controls; enabled the existing ban/unban action.
- Dashboard loads report counts from the reports endpoint, includes new/in-progress reports, preserves zero and shows unavailable on errors.
- Subscriptions “Manage learners” links to the learner list filtered by status.

## Verification

- Targeted backend subscription/access/billing/certification tests: 68 passed.
- Admin frontend tests: 10 passed, including all three subscription choices, error handling, activity loading, report counts and search removal.
- Complete backend suite: 296 passed, 3 failed.
- Complete frontend suite: 244 passed, 5 failed.
- The eight full-suite failures are unchanged from the preceding audit: annual-plan test contracts (2), mobile AST assertion (1), incomplete report-response mocks (3), automatic-checkout expectation (1), and old payment-mode wording (1).
- Standalone admin compilation passed; existing large-chunk warning remains.
- Changed source passes whitespace checks. Pre-existing whitespace in `js/animations.js` was left untouched.

Browser automation still fails before initialization with `codex/sandbox-state-meta: missing field sandboxPolicy`; visual verification and live mutation testing were not performed. Transactions require a replica set, such as MongoDB Atlas. Logs are stored beside this file.
