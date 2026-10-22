# Skillomate reliability root-cause review

Read reports 01–09 in order; report 02 audits every one of the 67 original failed cases. The original 18 PASS/67 FAIL/35 UNTESTED results and grading criteria remain unchanged. The source-aware classification is 59 deterministic implementation/capability mismatches, seven grading ambiguities and one security-policy conflict. This is an investigation, not a new blind score or a fix.

Evidence map:

- `evidence/input/Skillomate_Chatbot_Fresh_Blind_Evaluation.zip`: complete original archive, including raw traces, frozen cases/rubric, original grades, source manifest and provider denials.
- `evidence/intake_and_baseline.json`: complete ZIP read/hash inventory and candidate preservation baseline.
- `evidence/all_case_audit_inputs.json`: joined original requests, outcomes, grading, state, retrieval and payload evidence for all 120 cases / 153 turns.
- `evidence/failed_case_classifications.json` and `.csv`: every 67 failed case with supporting evidence and classification. Full actual failed-turn replies and expectations appear in report 02.
- `evidence/root_cause_groups.json`, `audit_summary.json`: source-aware cause groups and counts; associations overlap and must not be added as independent failures.
- `evidence/offline_diagnostics.cjs` and `.json`: guarded pure-helper observations;63/63 exact replay matches, not fixed-case passes. To reproduce from the workspace root run `node --require ./Untitled/Skillomate_Chatbot_Reliability_Root_Cause_Review/evidence/original_harness/local_only_guard.cjs Untitled/Skillomate_Chatbot_Reliability_Root_Cause_Review/evidence/offline_diagnostics.cjs`. It reads current source, so verify hashes first. No model/server/database is used.
- `evidence/state_control_preconditions.json`: raw context/session evidence showing why reset tests need recognized initial facts.
- `evidence/provider_payload_budget.json`: per-turn character-based token estimates and provider-origin/ownership accounting; no billed usage or verified dollar quote.
- `evidence/source/`, `source_snapshots.json`: unmodified source/approved-asset snapshots with original line numbers and hashes. Source references in reports are backend-relative unless prefixed otherwise.
- `evidence/original_*`: frozen rubric/schema/policy/results/coverage/manifest and original execution harness/author/grader attestations.
- `evidence/audit_notes.py`, `build_review.py`: review-only classification/report generation; these are not application or evaluator changes. Preserve manual causal interpretation alongside diagnostics.
- `evidence/final_preservation_verification.json`: final read-only preservation, coverage and confidentiality checks. `integrity_manifest.json` hashes package contents other than itself. ZIP-level validation is recorded beside the ZIP.

No application/evaluator/configuration changes, external requests, deployment or production data changes were made. This package includes protected approved course assets for local review; creating this local artifact does not authorize sending them to an external provider. Await review after packaging.
