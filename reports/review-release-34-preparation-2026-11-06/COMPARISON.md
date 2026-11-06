# Skillomate 1.0 (34) - release preparation comparison

6 November 2026 | SOURCE PREPARED - NOT BUILT OR UPLOADED

DevOps will create and upload the signed release, as requested by the user. This report compares the prepared source with the audited local baseline. It is not a binary comparison: the full contents of uploaded builds 29 and 33 were not independently inspected here.

## Previous and prepared states

| Item | Previous observed state | Prepared state |
|---|---|---|
| Selected review build | 1.0 (29) | Still 29 until the verified replacement is uploaded and selected |
| Latest upload in TestFlight | 1.0 (33), Ready to Submit | Target candidate 1.0 (34); no binary exists from this task |
| Local Expo iOS build number | 33 | 34 |
| Native Debug/Release build number | 33 / 33 | 34 / 34 |
| Marketing version | 1.0 | 1.0 |
| Review notes | Sign in first; omitted new guest/AI flows | New release-specific draft included; not saved against old build 29 |
| App Store age rating | Earlier audit: 4+ | Saved 13+ override with Apple's regional equivalents |
| App Store privacy label | Earlier audit: 11 data types | 13 data types published and verified; local manifest reconciled |

Source baseline: c79e2123789bbfb772a9a18e001f589510074648. The cumulative patch contains 27 changed/new source files. A source manifest records their hashes. Source preparation does not establish successful compilation, signing, purchase behavior or App Review approval.

## Included code and feature changes

AI consent: first use requires a clear choice before transmitting chat data. Versioned server records, explicit decline/withdrawal, account checks and provider-attempt guards replace automatic permission. An outdated or unavailable consent endpoint blocks AI. Course access remains available after declining.

AI privacy: automatic profile/contact/demographic/membership/payment context was removed from external requests. Local account answers are excluded from native and restored server history, including older account-answer templates. User-entered message content remains shareable and is disclosed. The revised consent policy is 2026-11-06.2; older choices require review again.

Privacy wording and labels: mobile/public policy wording now distinguishes automatic account records from voluntarily typed information. The native manifest matches the corrected collection purposes and linking. The website text still requires deployment. Existing App Store privacy and age-rating metadata corrections are already saved.

Guest experience: the previously requested exploration banner removal is included. Paid-media protections from the audited baseline remain in place; catalogue browsing does not unlock paid lessons. Acceptance of the remaining registration/entitlement treatment is still a review risk, not a guaranteed resolution of Apple's earlier feedback.

Release configuration: build 34 is set in app.json and both native configurations. Release bundle/team identifiers and production API endpoints are preserved. EAS upload exclusions now explicitly omit local access stores, private key files and reports. No new dependency or marketing-version change was introduced.

## Verification performed

Full mobile suite: 187 passed, 0 failed.

Targeted AI suites: 138 passed. Additional review checks: 43 mobile and 52 backend passed. The native-session test loader now supports the consent dependency.

Privacy manifest and Xcode project parse successfully. Expo/native build numbers agree at 34. Development UI fixtures remain disabled. The cumulative patch passed a reverse-apply dry run against the prepared working tree. git diff --check passed.

The earlier broader audit also identified four stale source-pattern checks, and two older tutor-knowledge expectations were reproduced as failing against the baseline. Those unrelated tests were not represented as fixed; the full repository suite is not claimed to be green. See the audit and privacy-fix reports for details.

No new signed IPA, TestFlight runtime session, sandbox transaction, physical-device recording or screenshot-by-screenshot validation was produced here. No real AI user payload, purchase or account deletion was performed.

## Build access and handoff

The current Expo CLI account cannot read the linked project. The project-info request returned Entity Not Authorized. Local Keychain has no valid distribution-signing identity, and about 1 GiB of free disk space is insufficient for a dependable local archive. The user assigned build/upload to DevOps; the project owner, bundle ID and Apple team were not changed to work around access.

Use the included DEVOPS_HANDOFF.md, release-source.patch and source-manifest.json. Apply the cumulative patch to the exact baseline after a dry run; do not stack the earlier individual patches. Deploy the matched backend and website privacy changes, then build using the authorized existing Expo project/distribution setup. Upload by the exact successful build ID, not an unverified latest-build shortcut.

Before archiving, recheck whether 34 is still unused. If it is taken, synchronize the next unused number in Expo and native configuration and record the actual artifact identity.

## Remaining gates for issue 5

1. DevOps creates and uploads the signed candidate from this source; record its build ID, number, source identity and SDK.
2. Test the exact uploaded build: guest browsing and paid locks; member playback; AI permission/withdrawal; restore and sandbox subscription behavior; account switching; supported iPhone/iPad UI and accessibility.
3. Verify the separately configured review account and entitlement without OTP obstruction. Complete final screenshot and privacy/SDK archive checks.
4. Supply the physical-device recording requested by Apple. Replace the recording reminder in the draft notes with the verified attachment/link details.
5. Replace selected build 29 with the verified candidate, save matching reviewer notes, and confirm both after reload. Only then consider issue 5 closed. Do not submit for review before the remaining audit gates are complete.

