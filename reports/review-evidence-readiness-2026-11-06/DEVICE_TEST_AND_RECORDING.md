# Final-device test and recording instructions

Owner: DevOps, confirmed by the user on 6 November 2026.

This is a post-build step. Do not mark it complete from unit tests or a simulator recording. Use the exact corrected signed candidate that will be selected for App Review, installed through TestFlight on a supported physical iPhone running the current available iOS release. Record the model, OS version, app version/build, test date and build/source identity. Also exercise the supported iPad layout on a physical iPad before resubmission.

## Existing Apple evidence

The active App Review thread includes an October 16 guideline 2.1 request and an October 29 developer reply. The reply identifies an approximately 9 minute 25 second recording for version 1.0/build 29, recorded on an iPhone 15, and includes an MP4 attachment. This attachment exists; the earlier audit had not established that. The video itself was not downloaded or independently verified in this task. It predates the new consent/privacy source changes, so it is not evidence that the corrected candidate works.

Apple requested more than a recording: purpose/target audience; setup/main-feature instructions and review credentials; external services; regional differences; relevant authorization documents for protected content/regulated services; and an IAP overview/navigation. Provide the current information both in the App Review reply and the Notes field. Do not send the draft until the matching build and evidence are ready.

## Before recording

- Deploy the matching production backend and privacy website changes. Consent policy must be 2026-11-06.2; the old auto-grant API is incompatible with the candidate.
- Verify product `com.skillomate.premium.monthly`, bundle `com.alihussainkhan.edunexfinal`, Apple server verification/notifications and the configured reviewer account's access. Keep credentials in the separate App Store Connect sign-in fields.
- Use authorized disposable test accounts for registration, account switching and deletion; preserve the review account for Apple's use. Show the real app flow without including private notifications or credentials in the recording.
- Use TestFlight/sandbox for subscription transactions. Confirm the system sheet identifies the test environment. Do not substitute a simulator StoreKit configuration file for end-to-end server verification.

## Recording sequence

1. Begin with launching the installed app from the physical device's Home Screen. Show the app identity/version/build and OS/device information in the accompanying evidence notes.
2. Guest journey: browse Home/Courses, open a course description and lesson list without entering personal information. Tap a paid lesson and show the membership/sign-in boundary; do not unlock paid courses for guests to manufacture a demo.
3. Registration and login: create an authorized test account through the real phone/OTP flow, complete the minimum-age step and demonstrate login. If separate clips/accounts are needed, document the transitions clearly; do not present an old build's flow as the current one.
4. Subscription: show the offer title, subscription length, localized price, any introductory eligibility/renewal terms, Terms of Use and privacy links. Demonstrate a sandbox purchase and verified paid access. Record transaction evidence separately without exposing signed payloads/tokens.
5. Member journey: play a paid lesson, seek/pause/resume, show lesson materials and saved progress. Exercise downloads where supported and verify the applicable access restrictions.
6. Restore: show Restore Purchases, restore the verified sandbox subscription after reinstall or on another supported test device, and confirm the correct account entitlement. An expired or foreign transaction must not grant access. Test pending/cancelled purchase and connection-error recovery separately.
7. AI: send a synthetic, non-personal question; first show the full provider/data disclosure, decline and confirm course access remains. Send again, explicitly accept and demonstrate a response. Show response reporting. Withdraw permission in Nex AI > Chat history > AI Data Controls and show that subsequent AI use needs permission again. Show separate history deletion controls.
8. Account controls: show the Apple subscription-management link and deletion warning. On a disposable account, demonstrate password verification and typed DELETE confirmation through completed account deletion; verify the old session cannot continue. Do not delete the review account.
9. Finish by demonstrating the app's normal stable navigation and showing that tested member/guest boundaries are consistent. Record crashes, loading failures or entitlement errors as failures to fix, rather than omitting them from test results.

## Runtime test matrix

Fill `runtime-results.json` only from observed results on the candidate. Record the actual build and evidence for each case. Required coverage includes successful/cancelled/pending purchase, restore/reinstall/account ownership, renewal/grace/expiry/refund, notifications, guest/member playback, AI consent/withdrawal, deletion, supported devices/accessibility/network recovery, review-account login and final screenshots.

A result from a different binary, a mocked API or local unsigned StoreKit transactions is not a pass for this final matrix. Backend lifecycle events can be tested separately from the continuous demo recording; keep the evidence linked to the same app/server release.

## Attach and verify

Attach the finished physical-device video to the App Review reply or provide a reviewer-accessible link. Put the same verified location in Notes. Verify it opens/downloads with the expected permissions and contains the correct build/flow. Include any content-rights evidence requested by Apple where applicable. No reviewer reply, attachment upload or final submission was performed by Codex in this task.

Official reference: https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox . Apple states that TestFlight uses sandbox and sandbox transactions do not incur charges. The physical-device recording requirement comes from the app's own October 16 App Review message.
