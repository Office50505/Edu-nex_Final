# Admin workspace roles

| Role | View application data | Change application data | View or manage team roles |
| --- | --- | --- | --- |
| Viewer | Yes | No | No |
| Developer | Yes | Yes | No |
| Admin | Yes | Yes | Yes |

## First sign-in

Open the standalone admin `/login` page. Use username `owner` and the existing `ADMIN_PASSWORD`. The owner is an Admin recovery account; it is configured by the server and cannot be disabled through the team screen. Blank usernames in old login clients still use the owner login.

Open **Team access** to create named accounts, assign roles, enable/disable accounts, or reset passwords. New passwords must be at least 12 characters and at most 72 UTF-8 bytes. Usernames are case-insensitive; `owner` is reserved. Staff accounts live in the separate `AdminAccount` collection, not the learner `User` collection. The unique username index is ensured before account creation.

## Enforcement

- Every protected request checks the current account and session version in the database. JWT role claims and browser storage do not determine authority.
- Viewers are denied POST, PUT, PATCH and DELETE requests by default, including admin operations on non-admin-prefixed course/category URLs. Explicit read-only media metadata, playback preview and certificate preview POST endpoints are allowed.
- `/api/admin/team` and its account-update routes require Admin, even for GET. Developers and Viewers cannot retrieve the role roster or create/promote themselves.
- Role, password and enabled-state updates revoke all existing sessions for that account. Disabled/deleted accounts fail authentication. An admin cannot disable or demote their own account through the API.
- Passwords are bcrypt hashes and are never included in account responses. Account identity and role responses are not cached.
- Old shared-password JWTs must sign in again. Owner sessions also become invalid when `ADMIN_PASSWORD` changes. `ADMIN_TOKEN_SECRET` continues to sign workspace sessions, scoped to the `skillomate-admin` audience, with an eight-hour lifetime.
- The UI fetches `/api/admin/me` before displaying protected pages. Viewer write controls are hidden or disabled, and direct create-page access is blocked. Team access is only displayed to Admins. A permission-denied response does not itself log out an otherwise valid session.

## Deployment and checks

Deploy backend and frontend together. Existing server secrets are retained; no staff accounts are automatically created and no learner roles are changed. The owner can create accounts after deployment. Changing roles does not send emails or share passwords.

Automated checks cover the three-role HTTP-method matrix, team-route isolation, role-claim tampering, revoked/disabled/deleted sessions, owner password rotation, password hashing, viewer UI controls, direct team navigation and session retention after forbidden requests. Full-suite pre-existing failures are documented in the task's local verification report; RBAC-specific checks pass.
