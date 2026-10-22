# Risks, rollback and implementation decision

**Phase 13 status:** investigation/review only. No source/configuration/model/evaluator edits and no deployment. New files are confined to this review folder and its ZIP. Existing source and Phase 12 artifact hashes are checked again during packaging. Nothing has been committed or pushed.

## Risks to existing passing behavior

| Proposed change | Risk | Required protection |
|---|---|---|
| Broader full-text recognition | Ordinary explanation/location/generation requests become template copies | Explicit action vs candidate distinction; contrastive educational/location/original/negated questions |
| Entity-span masking for topics | Real symptom inside a descriptive sentence gets hidden | Mask only accepted identity span, preserve separate symptom clauses; genuine blur/motion/hand tests |
| Broader multilingual declaration grammar | Instructions, hypothetical examples, price/staging clauses become identities | Bounded capture, clause stop rules, provenance, negation, ambiguity and input-guard tests; no arbitrary product dictionaries |
| Passive recolour parsing | Part/colour swallowed incorrectly; recolour interpreted as replacement | Typed operation, preservation clauses, active/passive equivalence; assert actual identity/price unchanged |
| Replacement invalidation | Valid same-product correction loses facts, or new same-turn fields get erased | Clear only product-bound data after confirmed replacement, then apply new declarations; correction ≠ replacement |
| Repeat/inherited task changes | “Next” repeats a stale exact source or inherits an old output | Explicit last-task reference, heading resolution and task-switch tests; do not promote every short message |
| Language changes | Mixed-script names determine prose language or proper names are translated | Explicit preference first; name/source script exemption; all three languages with independently declared values |
| Final local-response validation | Valid approved placeholders are rejected or source wording is rewritten | Known vs unknown vs ambiguous distinction; all 19 final-body comparisons; preserve existing secret/safety cleanup |
| Shared retrieval changes | Course/lesson access leaks or other courses' scores/routes change | Restrict logic to located product slug scope; same entitlement checks; all existing other-course/access tests |
| Web conversation ID addition | Older same-course chats stop restoring or cross-device behavior diverges | Test new IDs and legacy omitted IDs with a documented compatibility policy; do not change unrelated course flows |
| Multi-chat index migration | Duplicate rows, rollback incompatibility, lost history | Defer from minimal patch; separate migration/backup/rollback plan and explicit approval |
| Evaluator revisions | Score inflation, loosened template/safety standards | Versioned grader, frozen independent slots/body oracle, contrastive tests and dual v7/new reporting |

The four core issues do not require changing provider/model/temperature, lowering safety controls, relaxing source fidelity, or retraining. Such changes would add risk without addressing their deterministic cause.

## State and persistence decisions to keep explicit

The actual schema stores one row per user/course, with conversationId as a field. A changed nonempty ID prevents ordinary state loading in the fixture, but overwrites the same row on save. Missing-ID requests can reuse product facts. These facts must be accounted for before claiming full conversation support.

For the minimal patch, retain the schema and APIs. Fix explicit replacement and, if approved, reset as state operations. Choose a backward-compatible policy for clients without IDs rather than treating absent IDs as an automatic reset for every installed client. The web widget's ID omission is a separately reviewable product-client change; mobile already sends IDs. If robust durable A/B chat restoration without client history is required for release, it is additional scope and must pass an isolated DB integration test and migration review.

Product reset should clear only the intended product/task fields; it must not call DELETE history, erase other courses, delete user data or change auth. Define whether language, course/lesson and task constraints survive. For a recognized-but-unresolved switch, a clarification is safer than reusing the old product as though it were the new one.

## Rollback strategy after implementation approval

1. **Baseline the exact working tree.** Git HEAD alone is insufficient: existing user source is staged, modified and untracked. Record content hashes and preserve copies/patches of only files about to change, including untracked product modules. Never run a destructive reset, clean, or checkout over this workspace.
2. Make small independently reviewable changes: extraction/state, request selection/retrieval, response validation, then optional client/reset work. No auto-deployment, commits or pushes are authorized by this review. If later authorized to commit, keep baseline and implementation separated so only approved hunks are reversible.
3. Keep v2 persisted fields/APIs and approved course bodies unchanged in the core patch. This makes rollback code-only; there is no proposed migration to undo. Preserve prior source snapshots and regression evidence outside the candidate code path.
4. Roll back if a passing baseline regresses, a product/course fact crosses scope, safety or entitlement weakens, exact bodies change outside declared slots, stale-state transitions remain, or Phase 14 critical criteria fail. Retain the failed candidate's evidence and source hashes before restoring.
5. Revert **only the approved implementation hunks** to the recorded working-tree baseline. Restore new helper files only if they were introduced by that implementation. Keep user modifications, historical reports and review artifacts intact. Verify matching baseline hashes and rerun the affected tests; a source restore alone is not evidence that behavior recovered.
6. No production state is touched here. If a future approved rollout ever writes fields incompatible with rollback, that release needs its own state compatibility/backup plan. Do not delete production sessions as a shortcut to remove stale facts. A future multi-chat migration must explicitly address old/new readers, duplicate keys, backfill, retention and reversible index changes.

Rollback is a future implementation procedure, not an action performed in this review. The application servers started earlier in the conversation were not restarted or reconfigured for Phase 13. Temporary reproduction servers close after each case.

## Confirmed, uncertain and blocked claims

Confirmed: Phase 12 reported scores and four critical cases; 47 frozen files match; four current failures reproduce; all five answers match the original bytes; zero external provider calls; fresh baseline suites pass 351/351 and 167/167. Related local routing/reset/client and state findings have the evidence and limits described in report 03.

Not established: deployed-production parity, real auth/database persistence and concurrency, universal multilingual extraction, fresh provider/model safety or generation quality, or that any proposed correction will pass. Fixture upserts are not production writes. Stub answers are not live answers. New tests and source changes are recommendations only.

No architectural blocker prevents starting the **bounded local core fixes after approval**. Exact-copy vs education/generation, accepted mutation semantics, and the legacy missing-ID policy should be made concrete in regression fixtures before changing the relevant behavior. Durable multi-conversation storage can remain out of the minimal patch, but must not be advertised as solved. Release/deployment readiness remains **NO** until an approved implementation passes the defined fresh evaluation and release review.

## Package contents and verification

The seven requested Markdown reports are at the archive root folder. `evidence/` additionally includes original Phase 12 selected evidence, unchanged source snapshots/client excerpts, hash baselines, the replay and diagnostic runners/results, fresh regression commands/logs/JUnit/test counts, and final integrity/ZIP member manifests. The bundle contains no environment files, real keys, real learner records or production credentials.

`evidence/final_integrity.json` records whether all 252 protected application/test files and 133 original Phase 12 files retained their baseline hashes. `integrity_manifest.json` lists every other bundle member's hash/size (it excludes itself by definition). The ZIP is verified for CRC/member hashes, required reports and file count; an external `.zip.sha256` file identifies the archive without self-referential hashing.

**Stop point reached:** review generated. Await approval before modifying code. Deployment remains strictly prohibited.
