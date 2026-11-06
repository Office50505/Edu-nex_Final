# Guest course route error - 6 November 2026

The simulator is configured for https://api.skillomate.in. A live read-only request confirmed HTTP 404 for GET /api/public/courses/6abe5bb2bced21d7211be185/videos. This is a missing backend release, not a login or course ID problem.

The mobile app previously rendered the server's HTML error document. It now displays a readable retry message. A fresh app reload and a new course request on iPhone 17 Pro confirmed the raw HTML is gone. Successful non-JSON API responses now surface an unexpected-response error rather than silently behaving like empty course data.

Validation: 173 mobile tests passed, including five new API-response error regressions. The isolated backend release passed 33 focused tests for public access, playlists, subscription access, admin course lists and video imports.

`guest-backend-release.patch` contains only the guest API policy, course schema/access flags, public lesson-list and scoped playback routes, admin API flag validation/preservation, public access tests and the private-playback test selector adjustment. It applies to remote main fc2ba6f52c9326355422873e5aade733dfd91324. Other uncommitted chatbot, account or download work is excluded. No production changes or GitHub pushes have been made.

The user selected the production AWS backend and will configure access on this Mac. Named profile skillomate-prod and the default AWS credential chain both returned CredentialsProviderError. The expected deployment SSH key and AWS CLI are unavailable in this environment. No secret values were requested or printed.

Next: after the user confirms access is ready, recheck credentials and remote main, commit and publish the isolated backend patch through the existing repository release process, then use deployment/deploy-skillomate-production.sh --backend-only. Verify the public lesson endpoint returns JSON without login, watch a free lesson in the simulator, and verify paid playback/download routes remain protected. Do not treat the friendly error display as completion of guest playback.
