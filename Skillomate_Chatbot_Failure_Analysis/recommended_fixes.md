# Recommended fixes — AI Product Photoshoot & Ads

Generated: 2026-10-15T11:02:39+05:30. Recommendations only: no application, knowledge, evaluator or test changes have been made. No deployment, commit, push or new provider request occurred.

## Decisions supported by the evidence

The current 32.7% score is reproducible but is not a trustworthy measure of semantic correctness or safety. The 37 failures include two provider-skipped conversations. Preserve the score as historical evidence, report skips separately, and do not claim an improved global pass rate from this analysis. The knowledge file already contains the missing workflows/settings/templates. The main engineering work is retrieval structure, response contracts, grounded generation and evaluator reliability; the evidence does not justify a broad course-routing rewrite.

## Priority 0 — repair measurement before judging fixes

### F01. Separate execution status, content correctness, language, references and safety

Origin: evaluator/harness. Evidence: all 37 failures; conv_003/006; summary safety and isolation aggregates.

- Treat `fal-openrouter` answers, fallback responses, absent turns and provider errors as distinct outcomes. A missing or fallback-only case must be skipped/inconclusive for live quality, while remaining an availability failure.
- Report 55 planned / 53 completed / 2 skipped, original-rubric 18/55 = 32.7%, and original-rubric 18/53 = 34.0% separately. Keep latency/retry coverage separate; merged eventual success is not first-attempt reliability.
- Give each turn separate correctness, language, lesson-reference, template-fidelity and safety findings; avoid making a correct answer a complete content failure because its lesson tag is missing.
- Replace the current 0/5 advertising-safety aggregate with task-appropriate labels. CapCut scope and stock-topic refusal are not fake-advertising tests; conv_006 has no live safety result; 029 and 041 refuse the harmful action. Conv_007 provides evidence of scoped retrieval, while its language still fails.

Acceptance: fallback-only conversations are never counted as failed live model content; missing turns remain not executed; all denominators reconcile; known valid refusals and the unsupported endorsement in conv_002 receive the appropriate independent safety findings.

### F02. Make scoring semantic, multilingual, scope-aware and negation-aware

Origin: evaluator. Evidence: 003/007/011/016/017/018/020/024/029/035/036/037/041/044/045 and conv_002/004/005/007/008.

- Define propositions and allowed alternatives across English, Hindi and Roman Hinglish. Accept translated explanations, equivalent inflections, ordinary grammatical variants, zero-padded/unpadded lesson numbers and punctuation-separated model names.
- Detect affirmative unsupported claims rather than any occurrence of a forbidden word. No guarantee is not an earnings guarantee. Do not require redundant refusal catchphrases when meaning is clear.
- Extract prompt content before checking unresolved slots and fidelity; commentary explaining `[PRODUCT]` must not invalidate a completed prompt. Still reject `[protein shaker]` inside an executable prompt when the intended slot value is `protein shaker`.
- Compare the full selected template after documented whitespace/quote normalization and permitted slot substitutions. Fragment-only checks cannot prove 100% exactness. State whether quote normalization is allowed; ppads_027 exposes this ambiguity.
- Evaluate explanation language apart from saved prompt blocks and source quotations. Distinguish a quoted source-language sentence from an entire wrong-language answer.
- Align expected deliverables with the question. An overview need not enumerate every tool unless specified; a request for hooks does not automatically require a full script and caption. Score optional completeness separately.
- Use a human-reviewed calibration set containing both real defects and the concrete false failures found here. If model-assisted semantic judging is later used, record reasons and human adjudication rather than trusting the judge unconditionally.

Acceptance: the safe earnings/refusal and translated Hindi examples pass their relevant semantic checks; unresolved slots, missing settings, false template denials and unsupported first-person endorsements still fail. Do not achieve a higher score by deleting valid constraints.

### F03. Canonicalize attempts and preserve auditable provenance

Origin: evaluator/harness and observability. Evidence: 68 first-run records / 55 IDs; 19 first-retry / 16 IDs; 5 second-retry / 5 IDs; 55 valid merged IDs.

- Store one attempt object per case/turn with attempt ID, provider, actual status, start/end times, skipped state and source pointer. Never append a blank synthetic answer that can overwrite a real fallback under last-ID-wins logic.
- Define a deterministic provider-aware merge policy, retain every attempt, and label eventual results as retried. Do not select answers by whether their grades pass.
- Record code/config/knowledge/test hashes, non-secret model parameters, unique chunk IDs with offsets/content hashes, selected template IDs, excerpt text or a protected reproducible snapshot, upstream exception class/status, latency, token usage and finish reason.
- Keep provider-returned model text distinct from the cleaned application response. Current saved answers support application-output review but cannot locate a provider-versus-postprocessor wording change.

Acceptance: each merged turn resolves to an immutable attempt and excerpt; duplicates cannot overwrite useful evidence; 038/043 can be attributed without guessing which same-heading fragment was sent. Avoid logging credentials or learner personal data.

## Priority 1 — address actual response defects

### F04. Restructure knowledge indexing without inventing new course facts

Origin: knowledge ingestion/retrieval. Evidence: 004/028/036/042 and unresolved 038/043.

- Remove PDF page headers/footers/form-feed furniture during ingestion. Separate policy/persona material, overview, glossary, lesson workflows, troubleshooting records and exact templates. Preserve the approved source meaning and original exact prompt text.
- Give each workflow/FAQ entry a stable ID, course ID, lesson number, type and full body. Assign metadata to Part D/E content, including L02 product sheets, L03 model shots, L05 ad planning, L06 video, L07 UGC and L08 final assembly/prompt location. Explicitly review mappings rather than guessing based on adjacent PDF headings.
- Make chunk IDs unique by source + section + offset/content hash. Replace non-active title/heading deduplication that currently collapses eight generic fragments and can confuse the two L07 UGC 2 fragments.
- Keep exact template bodies intact, separate from later tone examples. Link related workflow and FAQ records to their templates; a named-template query must retrieve that template body, not a same-heading tail.

Acceptance: independent retrieval checks recover the complete stored steps/settings/FAQ answers and both UGC templates under unique IDs. Existing material-access rules and course scope remain enforced. Exact template bodies match the approved source after defined formatting normalization.

### F05. Retrieve by question intent and preserve multi-turn entities

Origin: retrieval system/model context. Evidence: 004/028/030/036/042/045; conv_001/004/005.

- Distinguish overview, workflow, settings, troubleshooting, named exact template and creative ad generation. Retrieve complementary records for an intent instead of spending four of six slots on unrelated same-lesson templates.
- Add course-scoped topic/term coverage and multilingual retrieval for generic ads, hands, logo blur, morphing, colour variants, final-ad assembly and notes location. Avoid the current broad photo/product/ads equivalence dominating relevance.
- Resolve pronouns and short follow-ups against the previous user-supplied product, selected workflow/template and current course; retain explicit pink/part/product entities rather than relying on a weak short-question heuristic.
- Recognize named-template requests with intervening labels, such as exact + lesson/template name + prompt, as well as copy/paste and paraphrased requests. The current exact-intent regular expression can miss these forms even when lexical retrieval finds the heading.
- Keep active-course scoping and subscription/material gating. Broaden only for explicit comparisons, preserving clear provenance per course.

Acceptance: paraphrased questions and multilingual follow-ups retrieve the relevant workflow/FAQ, including L04 Colour Variant after Shape bhi badal gaya, without mixing courses or requiring evaluation IDs or exact question wording. Check inputs versus generated outputs for the L05 ad planner.

### F06. Enforce a language and exact-template response contract

Origin: model instructions/output validation and template rendering. Evidence: 004/005/008/024/037/044; conv_001/007/008; 038.

- Keep learner language outside source persona content. The knowledge's default-Hinglish instruction should not compete with the service's user-language contract. Existing system/user instructions already state this priority; strengthen source separation and validation rather than duplicating the same sentence.
- Treat exact prompts as approved content assets: select a named template, apply only explicit user-supplied slot values, preserve all remaining source wording, and distinguish optional unknown creative fields from required known product fields.
- Use general slot rules for every product and template. Do not hardcode perfume bottle, sunglasses, protein shaker, or any evaluation question/ID. Avoid injecting invented product features or retaining brackets around an inserted value.
- Keep surrounding explanations in the requested language while preserving stored prompt text. Use a bounded validation/correction strategy for language and unresolved slots rather than silently accepting violations.
- Do not claim a template or notes location is absent unless a source lookup supports that conclusion. If only partial evidence is available, describe that limit accurately.

Acceptance: varied unseen products and all supported templates preserve source wording and substitute known slots correctly; English/Hindi/Hinglish explanations match the latest learner request across follow-ups. Unspecified identity/dialogue details are clarified or transparently left as editable fields, not fabricated.

### F07. Improve grounded ad generation and supported lesson attribution

Origin: model instructions and evidence metadata. Evidence: conv_002; 011/016/030/034/035/039/040/043/046.

- Maintain a distinction between supplied product facts, unknown facts and creative wording. Do not invent first-person product use, customer satisfaction, testimonials, medical effects or other unsupported benefits. Clarifying questions should ask for verified features rather than suggest unverified health-benefit examples as likely facts.
- Validate the proposed ad text itself: a refusal/caution elsewhere does not make a fabricated endorsement safe. Offer honest product demonstrations and avoid presenting synthetic people as real reviewing customers.
- Carry supported lesson metadata into advice, without treating omitted labels as fabricated numbers. Keep L06 morphing guidance primary; L02 product-sheet advice is supplementary. Do not label a FAQ sentence as the exact Push-in prompt.
- For troubleshooting, preserve real constraints such as one slow movement, reference inputs and limitations; for settings questions include the selected mode. Avoid converting AI text limitations into claims of a guaranteed fix.

Acceptance: new ad briefs with sparse facts do not produce invented experience/benefit claims; source-based advice has accurate references and clear limitations. Safety still holds when wording differs from the known test pack.

### F08. Make provider degradation observable and relevant

Origin: provider/API and fallback behavior. Evidence: conv_003/006, plus failed first attempts later recovered.

- Preserve the upstream error class/status and elapsed time so timeout, DNS, rate limiting and invalid credentials are distinguishable. The current saved evidence strongly suggests a 25-second timeout for the two persistent skips but cannot identify the upstream cause.
- Measure latency before choosing timeout or bounded retry/backoff changes; do not blindly increase the timeout. Never count application HTTP 200 fallback as a completed provider response.
- Make fallback clearly indicate temporary model unavailability and use relevant, supported course guidance when safe. A generic course overview is inadequate for an extra-phone fix or a deceptive-testimonial request.
- Keep basic advertising boundaries on the degraded path; conv_006 currently offers no targeted refusal or safe alternative. That gap should be addressed independently of unobserved live model behavior.

Acceptance: simulated slow/error provider paths remain bounded, expose accurate status, give relevant safe fallback, and produce skipped/inconclusive live-quality records. Authorized future retries should cover the two complete conversations, without fabricating their unexecuted turns.

## Priority 2 — validation after implementation is separately authorized

1. Calibrate semantic/rubric fixes against the existing immutable response corpus, recording adjudicated per-dimension results before interpreting any new pass percentage.
2. Verify ingestion/retrieval/slot behavior offline with unseen products, paraphrases, English/Hindi/Hinglish, multi-turn entity changes, material-access boundaries and cross-course probes. Include negative checks to prevent a scoring fix from passing genuinely wrong templates or unsupported endorsements.
3. Run appropriate existing local regression tests after actual code changes; the historical 52/52 result alone is insufficient. Do not treat mocked provider behavior as live-language or safety evidence.
4. Capture a fresh immutable evaluation with the same 55 cases plus a small held-out set when live provider execution is requested/authorized. Record first-attempt and retried availability separately and manually review critical safety and exact-template results.
5. Report dimension-specific outcomes, unresolved cases, code/knowledge versions and remaining risks. Production readiness requires trustworthy evaluation and actual behavior evidence, not a numerical increase caused by loosening the rubric.

## Actions not supported by this analysis

Do not hardcode answers to evaluation questions, rewrite the knowledge as a list of test answers, silently convert skips to content failures, or claim every reported safety/isolation failure is real. Do not rewrite course routing solely because conv_007 was marked failed. Do not assert that a same-heading chunk contained the requested text without a full excerpt snapshot. No change, deployment, commit or push is part of this deliverable.

Case-level evidence and actual responses: `failure_analysis_detailed.md`. Machine-readable categories, origins, statuses and source hashes: `failure_categories.json`.
