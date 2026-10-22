# Review and rollback

This task used the existing working tree. Pre-existing changes include files already modified/untracked before this task; a diff against HEAD would mix them with this patch. The authoritative task diff is `evidence/phase_changes.patch`, derived from byte snapshots in `evidence/before/`, with final hashes in `changed_file_manifest.json`. Eight source files changed and one new test file was added. No existing test was edited.

Before applying a later rollback, verify each changed file still matches its final SHA-256. If it differs, stop and reconcile that newer work manually. From the Untitled project root, `git apply --reverse --check <absolute-path-to-review>/evidence/phase_changes.patch` is a non-mutating check. After explicit rollback approval, review and reverse only this task patch, or restore just the eight named files from the saved baseline and remove only the newly added test file. The task has not run any rollback command. Do not reset, stash, clean or overwrite unrelated changes.

After rollback rerun the original security/isolation/Unicode suites and baseline chatbot/backend checks under external-network denial. Baseline24 failures are expected until separately resolved; the new reliability tests should again expose the original problems rather than be deleted to claim a pass. No database migration/config/deployment change needs reversal because none occurred.

Review the diff, raw/fill slot rules, atomic state reducer, local response contract, locale changes and negative-evidence filtering. Validate preserved source/evaluator hashes and inspect the full-body results. Accepting this local patch does not authorize provider transmission or deployment. Stop here and await review.
