# Reproductions and causal findings

All application paths in this report are relative to `Untitled/edunex-b/`. The Phase 12 run directory is `reports/ai-product-photoshoot-ads-evaluation/phase12_live_20261015_110001/` (abbreviated P12).

## Method and strength of evidence

The original requests/known slots are read from P12 `unseen_definitions_frozen.json`, not reconstructed from failure prose. The original answers come from `application_raw_results.json`; template findings come from `phase12_template_audit.json`. Phase 13 executes the exact `makeApp` function extracted unchanged from P12 `evaluation_runner.cjs`, against the current source. Its synthetic course/auth/entitlements and memory-only persisted sessions are retained. The original runner's live top-level setup and entire evaluation are not invoked: no environment files or credentials are loaded. External transport is denied. Actual HTTP/Express handling, routing, retrieval, state, rendering and cleanup execute on temporary loopback ports. All four cases use zero provider requests.

Expected bodies are independently constructed from frozen declared slots and the source asset by literal substitution; they do not use runtime extraction or `renderProductTemplate`. All five final answers match the original Phase 12 bytes. Four failed exact bodies reproduce; the first turn of the switch scenario remains a passing setup/control.

| Case | Turn | HTTP | Matches Phase 12 answer | Independent expected body | Origin |
|---|---:|---:|---|---|---|
| phase12_new_001 | 1 | 200 | Yes | Fail | Local guidance |
| phase12_new_002 | 1 | 200 | Yes | Fail | Exact local template |
| phase12_new_005 | 1 | 200 | Yes | Fail | Exact local template |
| phase12_new_029 | 1 | 200 | Yes | Pass | Exact local template |
| phase12_new_029 | 2 | 200 | Yes | Fail | Exact local template; history restored |

Evidence: `evidence/reproduction_results.json` (complete saved outputs, expected bodies, provenance); `additional_probes.json` (internal traces and counterfactual controls); `targeted_probes.json` (state/language controls). Counterfactuals alter **input wording only**, never application code. They support causal diagnosis and are not fixes or new unseen evaluation results.

## F1 — Product Sheet becomes label troubleshooting advice

**Original request:**

> The object I am photographing is a folded sisal seed-label quiver. I need the full approved L02 Product Sheet text for it, with its name filled everywhere.

**Observed:** no complete template; instead: “Use the product sheet reference and start with ‘keep exactly the same, same text and logo’… Small text is an AI limitation…”. Selection is `local_guidance / matched_task_and_source`. Product is absent from persisted facts. Top retrieved record is `Label ke akshar / keys ke letters` (~92.78), ahead of unrelated scene assets. A global `findProductTemplate` call would identify L02 Product Sheet, but the exact-intent gate is false, so the boost/response path is not used.

**Confirmed chain:**

1. `wantsProductPrompt` (`services/productTutorKnowledge.js:80–86`) requires a prompt/template/wording/copy-paste noun. “Full approved … text” fails the first condition.
2. `productRequestContext` (`same file:285`) checks `labels?` before its product-sheet branch (`293`). A word boundary matches `label` after the hyphen in **seed-label**, even though it is part of the object name. Plain “text” alone is not a matched term here: the regex contains **small text**, not bare text.
3. The blur topic gets +55 for its tagged records (`services/tutorKnowledge.js:225–226`) while no template gets the +150 intent boost (`208,239`). `selectProductGuidance` chooses a matching translated record (`services/productTutorResponse.js:54–63`); `productResponseSelection` chooses local guidance (`services/productTutorIntent.js:24`); `productTutorReply:134–138` returns it.
4. The separate phrase “The object I am photographing is …” is absent from `extractEntity` (`services/productTutorState.js:14–24`) and declaration patterns (`services/productTutorKnowledge.js:136–146`). Product remains missing even if the routing gate alone is corrected.

The context's **troubleshooting flag is false** for this exact input. “Routed to troubleshooting” describes the visible FAQ output, not the boolean. This corrects imprecise historical prose without modifying the artifact.

**Controls executed:** inserting “prompt” after Product Sheet returns the complete source body, but keeps `[PRODUCT]`. Changing the declaration to “My product is …” as well produces the supplied identity in the body. Neither changes source. This confirms two independent gaps and makes a one-line gate-only fix insufficient.

**Smallest safe correction:** recognize affirmative full-text requests bound to an unambiguous approved heading; parse subject identity declarations; mask the verified entity span when inferring symptoms. A genuine “the label is blurry” clause outside the name must continue to trigger troubleshooting. Do not give arbitrary text requests global exact-template priority.

**Required regression:** full final-body match for an unfamiliar object name containing a symptom word, requested without the noun “prompt”; verify every product occurrence. Add a paired genuine label-blur question and an educational question mentioning the same asset. No specific quiver/name belongs in implementation rules.

## F2 — Hindi identity omitted from White Studio

**Original request:**

> हमारी वस्तु का नाम केसरिया सूत की बीज गिनने की थैली है। L02 White Studio का पूरा स्वीकृत मूल प्रॉम्प्ट इस नाम के साथ दीजिए; बाकी हिंदी में।

**Observed:** correct full L02 White Studio asset, but `[PRODUCT]` remains, followed by Hindi bracket instructions. `exact_template / complete_authorized_asset`; retrieved asset is first (~183.52). Language is Hindi. No product identity exists in state.

**Confirmed cause:** the possessive/name pattern accepts `मेरे|हमारे` plus `प्रोडक्ट|उत्पाद|सामान|आइटम` (`services/productTutorState.js:18`), not `हमारी वस्तु`. Its adjacent possessive declaration supports `हमारी` but omits `वस्तु` and the `का नाम` grammar (`19`). The older parallel patterns are narrower (`services/productTutorKnowledge.js:142,145`). Neither parses the actual declaration. `renderProductTemplate:175` substitutes only an accepted known product; `productTutorReply:149–150` checks unresolved product markers only if the parser provided a value. The note mistakenly treats a supplied but unparsed name as unknown.

**Control executed:** replace only `हमारी वस्तु का नाम` with `हमारे प्रोडक्ट का नाम`. The full unchanged name appears in the correct source body. Unicode insertion, approved asset retrieval and English-source preservation already work; no translation or provider defect is needed to explain the original omission.

**Smallest safe correction:** generalize declaration recognition across grammatical possessive forms and object/product noun classes. Capture the user-supplied span verbatim (with existing allowed normalization), and canonicalize field keys rather than translating/transliterating names. Preserve negation, uncertainty, instruction/name boundaries and length checks.

**Required regression:** several fresh Hindi/Hinglish/English declaration forms and inflections, including an unfamiliar Devanagari name with internal `की`/`का`; match all substitutions against independently declared identity. Assert only the surrounding requested prose language changes and the approved body is otherwise unchanged. Include unknown/negated names and malicious instruction-like strings as negative controls.

## F3 — Passive recolour leaves part and colour unresolved

**Original request:**

> In Lesson 04 I want only the colour of the two removable hinge pins changed to pale saffron. Return the entire approved L04 Colour Variant Sheet template with that exact part and colour.

**Observed:** correct full L04 Colour Variant Sheet with `[the part, e.g. all the keycaps]` and `[new colour, e.g. soft pastel pink]` unchanged. Exact-template selection and top-ranked correct asset (~186.45). A separate hidden defect: persisted product becomes `two removable hinge pins changed to pale saffron`.

**Confirmed chain:**

1. The English variant pattern (`services/productTutorKnowledge.js:159–165`) begins with `change|changing|recolour...`, followed by a part then `to` and a colour. The passive `colour of … changed to …` does not satisfy that grammar: the `changed` suffix is unsupported and its target precedes the verb.
2. `extraSlots` (`services/productTutorState.js:34–36`) adds only limited Roman/Devanagari recolour forms, so both values remain absent.
3. Because the text mentions a template, `productSlots:148–152` also tries unrestricted `for|of` noun fallback. `of the two removable hinge pins changed to pale saffron` passes the broad name validator and is promoted to a **product**, although it is an action clause. `extractEntity` itself returns null.
4. Renderer and local marker checks operate only on populated fields (`productTutorKnowledge.js:177–178`; `productTutorResponse.js:149–150`). They cannot catch the extraction omission and return the unresolved markers as if the user had not supplied them.

Context topic is `colour_shade`/troubleshooting because “exact … colour” also matches its heuristic, but correct asset lookup takes priority; that topic is not the cause of the missing substitutions.

**Control executed:** “In Lesson 04 change the two removable hinge pins to pale saffron…” fills the same two original-source slots. A fresh passive “three corner clips … muted teal” repeats both the missing slots and false-identity pattern. The problem generalizes beyond the evaluated words.

**Smallest safe correction:** extract a typed recolour operation `{targetPart,newColour}` in both active/passive grammar before generic identity fallback, reject entire mutation clauses as names, and leave the actual product identity intact. Treat colour names as opaque supplied text, not a colour dictionary. Keep negation and “everything else unchanged” scope.

**Required regression:** active/passive English, Hindi and Hinglish with multiword parts/colours and preservation clauses. Expect complete source equality after only part/colour substitution; assert no fake product is created. With a prior product/price, assert those survive recolouring. Include “do not change …”, unsupported/ambiguous targets and unknown colour; never invent a missing field.

## F4 — Roman Hindi switch retains old product

**Turn 1:**

> Mera item woven willow bulb-measuring sleeve hai. L02 White Studio ka full exact prompt do.

**Turn 2, client history omitted:**

> Ab product ko polished alder dovetail spacer se replace karo. Naye wale ke liye complete L02 Dark Premium approved prompt do; purana naam mat rakhna.

**Observed:** turn 1 correctly uses the sleeve. Turn 2 selects correct Dark Premium asset, restores persisted history (`history_restored=true`), but inserts the old sleeve. No provider call. New item is absent from facts.

**Confirmed chain:** English `replace/switch/change product with/to …` is supported (`services/productTutorState.js:15`); Hinglish `product ko … se replace karo` is not. Other declarations/preposition fallbacks (`productTutorKnowledge.js:136–152`) do not match. Prior v2 identity is retained, and history is not replayed as facts (`209–215`). Clearing dependent fields occurs only **after a different identity has been extracted** (`217–221`), so it never fires. Rendering seeds productSlots with previous identity (`128`) and faithfully inserts the stale value.

History restoration is working in this reproduction. A blanket “do not restore history” fix would destroy passing follow-ups and would not repair replacement parsing.

**Controls executed:** English replacement with the same new identity switches correctly. An independent direct-state probe with a prior cork product, price, channel, material and recolour shows English replacement clears old dependencies; the equivalent Roman Hindi switch retains all of them. The problem can contaminate more than the displayed name.

**Smallest safe correction:** recognize product replacement as a language-independent operation sourced from an explicit declaration; update identity and invalidate product-bound fields before task/template resolution. If a replacement instruction is recognized but its new identity is ambiguous, request clarification and avoid silently emitting the old product as the requested new item.

**Required regression:** three-turn A→B→B with natural switches in each language, history included/omitted, fresh random identities and prior price/channel/part/angle. Assert new identity only, old dependencies absent, preserved task constraints intentional, and later follow-up remains on B. Re-supply a new price in the switch to confirm it is not discarded during invalidation.

## Related confirmed behavior and unresolved hypotheses

| Finding | Evidence | Status/implication |
|---|---|---|
| Educational heading returns template | additional route probe `educational-heading`; `productTutorResponse:123–124`, `productTutorIntent:21` | Confirmed; asset availability is mistaken for request type |
| Original image request asks for saved heading | `open-generation`; `wantsProductPrompt:84–85`, `productTutorResponse:129` | Confirmed; no independent original-generation intent |
| Hinglish prompt negation ignored | Exact Phase 12 new_010 replay in additional probes | Confirmed; English-only negation stripping is insufficient |
| Repeat loses exact deliverable | `repeat-exact` route probe restores history but emits workflow | Confirmed; previousTask aids mode selection but not exact-asset resolution |
| Same-ID textual reset retains identity | `explicit-reset-same-id` fixture and direct reset probe | Confirmed; no located reset operation in state reducer |
| Nonempty changed ID starts empty | `conversation-B-fresh` fixture | Confirmed fixture behavior; not real DB/UI proof |
| A→B→A without client history loses A | `conversation-A-after-B`; unique user/course index | Confirmed fixture + schema design; multi-conversation DB behavior not executed |
| Omitted ID can carry prior product | `missing-conversation-id`; `loadTutorState:63–64`, `scopeProductState:40` | Confirmed fixture; empty IDs do not isolate saved facts even though message history is not restored |
| Hindi material/colour not saved as typed facts | `hindi-material` direct probe; attributes matcher `productTutorKnowledge:235` | Confirmed extraction gap; raw user message may still reach a model, so universal downstream loss is not established |
| Roman Hindi paraphrase selects English | `Ab isko phir se samjha do.` language probe | Confirmed finite-token gap; does not measure all Hinglish |
| Concurrent same-course chats overwrite state | user/course key and whole-row upserts | Plausible race risk, not load/concurrency-reproduced here |
| Slug requests and ObjectId persistence split | state lookup maps non-ObjectId to null while active scope uses ID | Located structural risk; no production slug/user persistence experiment performed |
| Model could omit unseen fields/constraints | existing regex extraction/validation limits | Hypothesis for untested requests; not a fresh model-quality result |

Neither the four root causes nor the extra local probes establish production auth, database durability, browser behavior or provider availability. No fix was implemented or validated in this phase.
