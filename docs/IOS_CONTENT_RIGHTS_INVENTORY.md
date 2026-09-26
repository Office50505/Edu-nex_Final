# Skillomate iOS content-rights inventory

Last source inventory: 25 September 2026. This is an engineering inventory, not a legal opinion or proof of ownership. `NEEDS OWNER CONFIRMATION` means the repository does not contain enough evidence to assert the necessary App Store distribution rights.

## Bundled iOS assets

| Asset/reference | Repository location | Display/use | Engineering assessment | Required evidence |
| --- | --- | --- | --- | --- |
| Skillomate app icon and adaptive icon | `appcopyai/assets/icon.png`, `adaptive-icon.png`; iOS asset catalog | Home screen/App Store icon | Appears first-party; **NEEDS OWNER CONFIRMATION** | Source artwork and assignment/license covering App Store distribution; confirm no copied mark |
| Light/dark Skillomate logos | `appcopyai/assets/skillomate-logo.png`, `skillomate-logo-dark.png` | Login, headers, branded UI/certificates | Appears first-party; **NEEDS OWNER CONFIRMATION** | Trademark/brand ownership or authorization and original source files |
| Nex and robot/companion images | `appcopyai/assets/ai-avatars/nex.png`, `nex-thinking.png`, `r1.jpg`–`r9.jpg` | Nex AI avatar selector and chat UI | **NEEDS OWNER CONFIRMATION** | Creation records or commercial AI/stock license; verify no third-party character likeness |
| Profile avatar portraits | `appcopyai/assets/avatars/a1.jpeg`–`a15.jpeg` | User-selectable profile avatars | Person/portrait imagery; **NEEDS OWNER CONFIRMATION** | Commercial image license and any required model releases; confirm editing/derivative rights |
| Ionicons/vector-icon font assets | `@expo/vector-icons` dependency, included in export | Interface icons | Third-party open-source dependency | Retain package licenses/notices and confirm redistribution obligations |
| Coming-soon marketing artwork | `appcopyai/assets/home/coming-soon-ai-automation.png`, `coming-soon-ai-ugc.png` | Retained repository artwork; not present in the verified current iOS export | **NEEDS OWNER CONFIRMATION** before reuse | Creation/source/license records and rights to any depicted people/brands |

The verified iOS export contained 47 assets: Nex/robot images, 15 profile avatars, two Skillomate logos, and vector-icon fonts. It did not package the development QA fixture module or fake fallback courses.

## Server-managed course content

| Content type | Repository/database reference | Display/use | Assessment | Required evidence |
| --- | --- | --- | --- | --- |
| Course titles, descriptions, lesson notes, prompts, transcripts, resources | MongoDB `Course`; knowledge files under `edunex-b/knowledge` | Catalog, course details, player, Nex context | **NEEDS OWNER CONFIRMATION** per course | Author agreement, contractor assignment, or license covering mobile distribution and AI-context use |
| Course and lesson thumbnails | `Course.thumbnailUrl`, `thumbnailVerticalUrl`, embedded images, S3/CDN objects | Catalog and lesson cards | **NEEDS OWNER CONFIRMATION** per image | Artwork/stock/photography license, model/property releases, and modification rights |
| Instructor names, bios, images, voice, likeness | Course records and media | Course cards, lessons, video/audio | **NEEDS OWNER CONFIRMATION** | Instructor release, service agreement, likeness/voice consent, and content assignment/license |
| AWS CloudFront-hosted videos/HLS | `provider: aws_cloudfront`, configured distribution | Protected native lesson playback | **NEEDS OWNER CONFIRMATION** per course | Master-video ownership/license and music/stock/font/clip clearances |
| Bunny Stream-hosted videos/thumbnails | `provider: bunny_stream`, Bunny IDs/library | Protected lesson playback/download/thumbnail | **NEEDS OWNER CONFIRMATION** per course | Same underlying course/media rights; hosting account is not proof of copyright |
| Existing YouTube lessons/thumbnails | `provider: youtube`, `youtubeId`; YouTube embed/thumbnail | Embedded lesson playback where retained | Third-party platform content; **NEEDS OWNER CONFIRMATION** | Written permission/ownership and compliance with YouTube terms; remove content that cannot be commercially distributed |
| Google Drive/Docs learning resources | URL allowlist and course resource records | External learning resources | **NEEDS OWNER CONFIRMATION** | Ownership/license and public/reviewer access without leaking private documents |
| Downloadable notes and certificates | `notesUrl`, generated certificate template | Offline/resource access, learner records | Mixed first-party/user data; **NEEDS OWNER CONFIRMATION** for course material | Authorship/license; certificate claims must remain limited to course completion |

Before screenshots or submission, export the live published-course inventory from production and attach a rights record to every course/video/thumbnail/instructor. Source control cannot establish rights for database/CDN content.

## Third-party names, services, and marks

| Name/reference | Where used | Likely basis | Required check |
| --- | --- | --- | --- |
| Apple, App Store, Apple ID, StoreKit | Subscription/legal UI and docs | Functional identification/nominative use | Follow Apple's marketing and badge rules; do not imply endorsement |
| ChatGPT / OpenAI | Course and marketing copy in web/knowledge content | Educational/reference use; **NEEDS OWNER CONFIRMATION** | Confirm accuracy, trademark presentation, and no implied affiliation |
| Claude / Anthropic | Course/marketing comparison references | Educational/reference use; **NEEDS OWNER CONFIRMATION** | Same nominative-use and accuracy review |
| Canva | Course/knowledge references | Educational/reference use; **NEEDS OWNER CONFIRMATION** | Confirm screenshots/templates/assets are licensed and no endorsement claim |
| Midjourney | Course/marketing references | Educational/reference use; **NEEDS OWNER CONFIRMATION** | Confirm output licenses and brand presentation for every included example |
| Notion | Course/knowledge references | Educational/reference use; **NEEDS OWNER CONFIRMATION** | Confirm screenshots/templates and trademark use |
| YouTube / Google / Gemini / Google Flow | Playback, AI disclosure, course material | Functional and educational identification | Confirm API/platform compliance, trademark style, and course-media permission |
| fal.ai and OpenRouter | Nex AI consent/privacy disclosure | Factual processor identification | Confirm current production routing, data terms, DPA/retention, and privacy-policy accuracy |
| AWS, Amazon S3, CloudFront, MongoDB, Bunny | Privacy/infrastructure descriptions | Factual service-provider identification | Confirm active vendors and contractual/data-processing terms |
| Razorpay, PhonePe, Google Play Billing | Cross-platform/legal/payment copy | Functional identification | Confirm platform-specific statements and remove obsolete claims if integrations change |

## Owner sign-off record

Before App Review, the owner should retain a private evidence register containing: asset/course identifier, rights owner, license/agreement link, permitted media/territories/term, model or instructor release, third-party elements, reviewer, and review date. Do not put private contracts or credentials in this repository.
