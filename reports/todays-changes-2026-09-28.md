# Today's Changes - 2026-09-28

Generated: 2026-09-28 14:57 IST

## Git Sync

- Pulled latest `origin/main`.
- Current HEAD: `3d5e910 Update course mobile UX and AI fallback copy`.
- Pull was completed with `git pull --rebase --autostash`, so local in-progress edits were preserved and reapplied.

## Auth And AI Access

- Learner login/signup was changed to mobile-number-first access.
- Email is no longer required for learner login/signup flows.
- The AI third-party consent gate was removed so Nex AI is directly accessible after normal account/course access checks.
- Related work was pushed earlier in:
  - `e0ee6c3 Make learner auth mobile-only and remove AI consent gate`
  - `38f4253 Update single-session tests for mobile login`

## Admin Tester Separation

- Added tester support for learner accounts:
  - Admin can mark a learner as a tester.
  - Tester status is audited with admin action history.
  - Tester analytics has its own separate admin page.
- Main dashboard analytics now exclude tester accounts from learner totals, activity, subscriptions, orders, and revenue calculations where user-level data is available.
- Learner/User Management page now excludes tester accounts completely.
- Removed tester segment, tester badges, tester detail stats, and tester analytics text from the normal Learners page.
- Once a learner is marked as tester, they move out of normal Learners and appear only under Tester analytics.

## Revenue Display Fix

- Fixed admin money formatting where paise values were displayed as rupees.
- Example: backend paise values are now divided by 100 before INR formatting.
- Main dashboard and admin operations pages use corrected INR display.

## Load Testing

- Created load-test report:
  - `reports/load-test-2026-09-28.md`
- Local k6 test artifacts were generated under:
  - `edunex-b/reports/k6/`
- Summary from local API load test:
  - 10, 100, 1000 request levels passed cleanly for core endpoints.
  - 10k request level showed latency tail risk on heavier endpoints.
  - `/api/categories` handled 10k cleanly.
  - `/api/courses` showed p99 tail spikes at 10k.
  - `/api/health/db` crossed latency threshold at 10k.

## Mobile Download Button Review

- Checked the mobile app download button behavior.
- Current behavior:
  - Download icon appears for Bunny-backed lessons.
  - Requires course/subscription access.
  - Requests a backend download grant from `/api/videos/:guid/download-grant`.
  - Downloads the MP4 through `/api/videos/:guid/download?token=...`.
  - Saves file into app-private temporary cache storage:
    - `FileSystem.cacheDirectory/skillomate_dl/<guid>.mp4`
  - Downloaded lessons can be opened from the Downloads tab and played offline in the app.
  - Existing downloads can be deleted.
- Important note:
  - Downloads are offline-in-app cache files, not permanent phone gallery/file-manager downloads. The OS may clear them when storage is needed.

## Verification Run

- Backend syntax:
  - `node --check server.js` passed.
  - `node --check routes/mobileCompat.js` passed.
- Backend focused tests:
  - `node --test tests/admin-user-controls.test.cjs` passed, 9/9.
  - `node --test tests/download-storage.test.cjs` passed, 3/3.
- Frontend:
  - `npm run build` passed in `edunex-f`.
  - Earlier player regression suite passed: 32 files / 246 tests.
- Live local admin API check:
  - `/api/admin/user-management` returned only non-tester learners.
  - Confirmed `testerCount: 0` in the normal Learners API response.

## Local Runtime Notes

- Backend local API was restarted on:
  - `http://127.0.0.1:3000`
- Admin standalone frontend was running on:
  - `http://localhost:5174`
- Normal frontend was running on:
  - `http://localhost:5173`

## Remaining Notes

- The working tree still contains local uncommitted changes and generated load-test artifacts.
- Some payment/Razorpay-related dirty files existed before the tester analytics work and were left untouched unless directly relevant.
- Actual device/simulator verification of mobile downloads remains the final real-world check for the download button.
