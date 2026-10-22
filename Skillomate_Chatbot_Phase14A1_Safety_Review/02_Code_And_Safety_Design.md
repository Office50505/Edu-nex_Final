# Code changes and safety boundaries

Paths below are relative to `Untitled/`. Machine-readable hashes and line counts are in `evidence/changed_files.json`; the complete incremental source/test patch is `evidence/code_changes.patch`. Exact pre-change and final source snapshots are included. Existing staged, unstaged and untracked changes were preserved.

## Reproduced cause

Phase 14A separated identity output from Unicode normalization, but both `entity()` and `cleanProductName()` then tested the original string directly. ASCII prohibited words expressed as full-width or mathematical compatibility letters escaped those tests. The saved `SAFETY_STOP.json` is copied unchanged in `evidence/phase14a_prior/`.

`evidence/safety_reproduction.cjs` executes the exact pre-change `cleanProductName` function from this phase's saved working-tree snapshot and compares it with current code. It records the original attack, normalized security view, before/after outputs and code points of positive names in `evidence/final/safety_reproduction.json`. No environment file, real key, model or database is used.

## Security representation versus display representation

`edunex-b/services/productTutorState.js:6` adds `productNameSecurityText`:

1. Create a separate NFKC-normalized string. The supplied name remains unchanged.
2. Reject Unicode bidi controls that could disguise displayed identity/instructions.
3. Remove default-ignorable code points from the security view, preserving them in legitimate original output. Thus an invisible character cannot split `ignore` or `system` for validation. A legitimate Hindi joiner still survives output if the name is accepted.
4. Reject a word containing both Latin and Cyrillic, or both Latin and Greek letters. NFKC alone does not map these lookalikes. This is a conservative per-word script policy, not transliteration or a claim to recognize all confusables.
5. Return the security view to the existing validators. An empty view causes rejection.

`entity()` (`same file:19`) and `cleanProductName()` (`services/productTutorKnowledge.js:129`) both apply their existing role/instruction/unknown/reference/action/structural rules to that view. Leading articles are also removed from the security view before prefix-based checks, so compatibility-character articles cannot hide a prohibited prefix. Both original and normalized lengths remain bounded. Accepted output returns the original name after the already-established whitespace/article handling; it never returns the security copy.

The existing keyword sets are retained. Structural delimiters, unknown/referring names, instruction-like tokens, role/person/output names and mutation clauses continue to be rejected as before. Input safety, source authorization, user-fact provenance and output filtering remain independent existing controls. NFKC is therefore a validation preparation step, not the sole security decision.

## Rejected declaration fallback

Tests exposed an existing fallback issue in the correction path: after a specific `का नाम … है` declaration was rejected, a generic `हमारी वस्तु … है` pattern could capture `का नाम …` as part of a new identity. That prefix could defeat a start-of-name role check. The equivalent Roman Hindi overlap exists for `ka naam`.

The two generic patterns in `productTutorState.js:37,39` and the parallel older fallback patterns in `productTutorKnowledge.js:161–162` now exclude that name-declaration prefix. The exclusion accounts for whitespace/backtracking, and tests include both ordinary and repeated spaces. Specific named declarations keep their normal extraction behavior. This closes an alternate path for the same rejected identity instead of weakening the rejection rule.

## Switching and follow-ups

The accepted identity from replacement operations passes the same security view as initial declarations. Product-slot fallbacks and the renderer pass the same `cleanProductName` checks. A rejected replacement does not become the current identity: tests verify the previous safe product remains on a later exact-template follow-up, while the unsafe candidate is never inserted or persisted as the product. This is rejection behavior, not successful completion of the requested replacement.

Existing unsafe product names supplied through remembered state or user history are filtered before being used as executable-template identities. Tests seed both legacy history and v2 state and expect original placeholders instead of the rejected name. The tests do not claim to sanitize every arbitrary string in historical messages: history remains untrusted conversation input under existing system instructions. No persistence redesign or bulk deletion of historical sessions is performed.

## Scope and rollback

| File | Change |
|---|---|
| `edunex-b/services/productTutorState.js` | Security-view helper; normalized existing entity checks; generic declaration exclusions |
| `edunex-b/services/productTutorKnowledge.js` | Normalized existing name checks and corresponding fallback exclusions |
| `edunex-b/tests/product-tutor-unicode-safety.test.cjs` | 67 independent safety/positive/transition checks |

No benchmark product names were added to runtime rules. Synthetic attack/product examples occur only in tests and evidence. No source assets, v7 evaluator, public route, authentication, subscription, client or migration files changed during this phase.

Rollback, if separately requested, should restore only these two application files from `evidence/baseline_source/services/` and remove only this phase's new test if appropriate. That returns to the stopped Phase 14A state, which still contains the known safety failure; it is not a safe-release baseline. Do not reset the repository, discard the user's existing changes, or deploy that baseline. Preserve evidence before any approved rollback.
