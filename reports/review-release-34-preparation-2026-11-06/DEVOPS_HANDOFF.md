# Skillomate iOS release 1.0 (34): prepared for DevOps

**Status: SOURCE PREPARED. No new signed build has been created or uploaded by this task.** The user assigned build/upload to DevOps. App Store Connect still selects build 29. The newest uploaded build observed on 6 November was 33; it predates the current AI fixes and must not be substituted for this release.

Build 34 is the next unused number observed at preparation time. Recheck before archiving: if someone has uploaded it meanwhile, choose the next unused value and update both Expo and native build settings together. Marketing version stays 1.0.

## Apply the actual source, not just a version bump

All current fixes are still uncommitted locally. A normal remote git pull alone will not include them. `release-source.patch` in this package captures the changed/new mobile, backend, website and regression-test source against the recorded base commit. Apply it only to a matching clean checkout after `git apply --check release-source.patch`; reconcile other changes deliberately. Do not apply the individual older fixes on top of this cumulative patch.

`source-manifest.json` records the base commit, build identifiers and SHA-256 digests of the included changed/new source files. No environment secrets or signing keys are included in the handoff archive.

## Production services before review testing

Deploy the included backend changes together, preserving production configuration. These include User consent storage, the consent endpoints, shared chat guard, per-attempt provider permission checks and the AI provider privacy/history boundary. The current consent policy is 2026-11-06.2. Existing users default to no current permission; obsolete grants must not bypass the gate.

Deploy the revised website privacy page and legal-layout support. The saved App Store privacy label and age-rating corrections already exist in Connect; do not undo them. The local iOS manifest must be included in the new archive.

Verify the production API and revised legal page. With an authorized disposable test account, verify consent initially off, direct chat blocked, explicit current acceptance, successful tutoring, withdrawal then blocked again, local account answers excluded from outbound learning requests, and unchanged paid-course protection. Older clients sharing the API need corresponding consent UI to obtain first-use consent; never restore the old auto-grant behavior for compatibility.

## Build and upload

Target identifiers:
- Bundle ID: `com.alihussainkhan.edunexfinal`
- App Store Connect app ID: `6790396358`
- Version/build: `1.0 (34)`
- Release Apple team: `LJ48CVC23W`
- Expo project: `33362fff-8f6f-4fe9-a7ac-bc11f9b34555`, owner `office50505`
- Production API and AI: `https://api.skillomate.in`

Use an Expo account authorized for that existing project and existing distribution credentials. The account currently signed into this Mac's Expo CLI has no project access; `eas project:info` returned Entity Not Authorized. Local Keychain reports 0 valid code-signing identities and the disk has about 1 GiB free, so a local signed archive is not ready here. Do not create a replacement Expo project or change the bundle/team to bypass access.

For EAS, from `appcopyai`:

```sh
eas whoami
eas project:info
eas build --platform ios --profile testflight --non-interactive --freeze-credentials --message "Skillomate 1.0 (34): guest access, AI consent/privacy, updated privacy manifest"
```

No auto-submit flag is used. If credentials require configuration, the authorized owner must complete that setup. Record the exact build ID and verify its source/build number. Upload that exact artifact with:

```sh
eas submit --platform ios --profile testflight --id ACTUAL_BUILD_ID --non-interactive
```

Replace ACTUAL_BUILD_ID with the ID of this verified build. Do not use `--latest`, which could upload an unrelated build. EAS Submit uploads to App Store Connect; it does not replace the final version's selected build or submit it for App Review automatically.

A local Xcode route is also possible on a properly provisioned machine with sufficient disk space, using the checked-in workspace, Release scheme and export settings. Use the required current SDK/Xcode, verify export compliance and inspect the archive's aggregated privacy report, SDK manifests/signatures and entitlements. This handoff has not validated a signed archive.

## Required checks on the exact uploaded build

1. TestFlight fresh install: guest Home/Courses and course/lesson metadata work; paid videos stay locked until verified membership. No forced registration for browsing. Verify signed-in member playback, downloads, progress, account switching and expired access.
2. Test actual AI consent dialogs, decline/withdrawal, account changes, provider/policy changes and unavailable backend cases. Confirm no model call before permission or after withdrawal. Do not place real personal data or tokens in diagnostic logs.
3. Sandbox purchase/restore, pending/cancelled purchase, existing member refresh, renewal/grace/expiry/refund and server notification handling; no real charge is needed for review testing. Confirm price, terms and privacy links.
4. Validate account-deletion entry and history controls with an explicitly disposable authorized account. Check supported iPhone/iPad layouts, accessibility, offline/error handling and IPv6-only operation.
5. Verify the separately configured review credentials work and provide the intended member entitlement without OTP obstruction. Do not place passwords in source or this handoff.
6. Record the exact release on a physical device running the latest supported OS, as requested by App Review. Include launch, guest access, sign-in/member lesson playback, restore location, AI permission/refusal/withdrawal and deletion-control location. Attach the recording or a reviewer-accessible link. No recording was produced here.
7. Reconcile final screenshots/previews with the new UI. No image-by-image screenshot certification has been performed in this step.

## Replace build 29 and save the final notes

After build 34 is processed and its release checks pass, open App Store Connect > Skillomate > iOS 1.0 > Build. Replace build 29 with the verified 1.0 (34) upload and save. Recheck the displayed build number after reload.

`APP_REVIEW_NOTES.txt` is a ready draft for that exact release. Check it against the actual deployed API and tested binary, attach the physical-device recording, then paste it into App Review Information > Notes and save. Preserve the separate sign-in/contact fields. Do not publish these new-feature instructions while the old build 29 remains selected. The recording sentence is a release gate: replace it with the actual attachment/link information once the recording exists, never claim it is attached without verifying.

Do not press Submit for Review until the complete audit/release gates are satisfied. Age rating and privacy answers alone do not make the selected binary current.

## Final evidence update

Use the included `final-review-evidence/DEVICE_TEST_AND_RECORDING.md` and fill `final-review-evidence/runtime-results.json` after installing this exact candidate. The user assigned this work to DevOps. The active October 16 reviewer request has seven information categories; the review-note draft now covers the written categories and identifies the evidence still needed. An older recording already exists for build 29, but is not final-candidate proof. Additional pre-build review checks passed: 43 mobile and 52 backend. The native-session test harness has been updated for the consent dependency. No new build or recording was created in this step.
