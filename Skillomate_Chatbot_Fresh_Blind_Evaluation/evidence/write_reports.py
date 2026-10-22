"""Render evidence summaries without changing independent grades or criteria."""
import json
from pathlib import Path

E = Path(__file__).resolve().parent
R = E.parent
load = lambda p: json.loads(p.read_text())
s = load(E / 'results_summary.json')
cases = load(E / 'frozen_cases.json')['cases']
grades = load(E / 'isolated_grader/grades.json')['cases']
by_id = {g['id']: g for g in grades}
turn_grades = [load(f) for f in sorted((E / 'isolated_grader').glob('*_grade.json'))]
c = s['caseCounts']
status_line = ', '.join(f'{c[k]} {k}' for k in ['PASS','FAIL','UNTESTED','INCONCLUSIVE','MISSING_RESPONSE'])
critical = s['ownershipAndPayload']['criticalGrades']
stop = bool(s['safetyStop'])
gate = 'STOPPED FOR SECURITY REVIEW' if stop else 'NOT QUALIFIED TO ADVANCE'
if c['PASS'] >= 108 and all(x['passOverPlannedPercent'] >= 90 for x in s['categories'].values()) and not critical:
    gate = 'REQUIRES REVIEW OF ALL REMAINING RELEASE CRITERIA'
R.joinpath('01_Executive_Summary.md').write_text(f'''# Fresh blind evaluation

Result: **{status_line}**, across all 120 planned cases. Overall pass rate is {s['overallPassOverPlannedPercent']:.2f}% using the fixed planned denominator. {s['caseAnyTurnExecuted']} cases and {s['executedTurns']} of 153 planned turns reached the local pipeline; {s['unexecutedTurns']} turns were not executed.

Release recommendation: **{gate}**. {'Execution stopped immediately at the recorded critical/suspected security finding; remaining cases are untested.' if stop else 'No critical or suspected security failure was confirmed in the executed observations. This does not establish unexecuted live-model behavior or production readiness.'}

The corrected candidate, original scoring rubric and 120 fresh independently authored cases were frozen before execution. Two agents with separate fresh contexts authored and graded the cases using allowlisted inputs. This was procedural isolation on a shared filesystem, not an OS sandbox or a human panel. All 19 approved assets are covered by the 25 frozen exact-body cases.

External course-content transmission was not authorized. {s['providerAccounting']['adapterAttemptsBlockedBeforeTransport']} application provider-adapter attempts were blocked before transport; there were zero live provider responses and zero fixture model responses. Model-dependent requirements are UNTESTED, not passed through fallback substitution.

Confirmed functional findings include non-product prose inserted into approved-template placeholders, omitted supplied product names/constraints, the old coaster identity reused after an explicit switch to a brass key ring, and generic or unrelated local replies replacing requested generation. Full per-criterion evidence is in report 04 and the independent grading files. These are observed behaviors, not inferred source-code root causes.

Every executed turn has a complete response trace, retrieval ownership inspection and assembled-payload inspection (including explicit evidence when no payload was built), followed by independent adjudication before the next turn. Per-criterion explanations, full body comparisons, errors, local latency and provider accounting are included.

No application implementation, approved knowledge, existing test, evaluator or scoring criterion was modified. No deployment, push or production operation occurred. Integrity verification is in `evidence/final_integrity.json`. Evaluation is complete at the recorded stop/completion point; await review.
''')
rows = []
for name, x in s['categories'].items():
    n = x['counts']
    rows.append('| '+ ' | '.join([name, str(x['planned']), *(str(n.get(k,0)) for k in ['PASS','FAIL','UNTESTED','INCONCLUSIVE','MISSING_RESPONSE']), f"{x['passOverPlannedPercent']:.2f}%"]) +' |')
exact = s['exactBodyChecks']['observedIndependentChecks']
selected = [x for x in exact if x.get('correctSelection') is True]
matched = [x for x in exact if x.get('status') == 'PASS']
selected_matched = [x for x in selected if x.get('status') == 'PASS']
fidelity = f'{len(selected_matched)}/{len(selected)} ({100*len(selected_matched)/len(selected):.2f}%)' if selected else 'UNTESTED (no selected approved body)'
fidelity_disposition = ('NOT MET' if any(x.get('status') == 'FAIL' for x in selected) else
                        'MET FOR OBSERVED SELECTED BODIES' if selected and len(selected_matched) == len(selected) else 'UNTESTED')
dimension_rows = '\n'.join(f'| {name} | `{json.dumps(tallies, sort_keys=True)}` |' for name, tallies in s['dimensionTurnTallies'].items())
R.joinpath('03_Results.md').write_text(f'''# Results

{status_line}. Overall: **{s['overallPassOverPlannedPercent']:.2f}% PASS/120**. Planned questions remain the denominator, including untested cases. All executed responses are retained; a response can exist while a required inference remains untested.

| Category | Planned | Pass | Fail | Untested | Inconclusive | Missing | Pass/planned |
|---|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(rows)}

Requested exact-body checks: {len(matched)}/25 passed; {len(exact)}/25 have adjudication records. Model-dependent body checks remain UNTESTED. Conditional literal pass count over correctly selected assets: {fidelity}, including any selected-but-untested checks in that denominator. Selection errors remain failures in the planned exact-template denominator; conditional fidelity never substitutes for selection accuracy. Unicode is preserved and only whitespace compaction is allowed. The full independent expected/actual comparisons are in the per-turn grades and `results_summary.json`.

The multilingual-extraction category measures full required extraction behavior; its pass/planned rate is reported above. The multi-turn category measures complete frozen scenarios, including switching, corrections and follow-ups. Turn-level language, facts, task-completeness, grounding and context evidence is retained in `dimensionTurnTallies` and per-criterion grades. These dimensions are not substituted for stricter whole-case results. Raw category failures and model-dependent cases must be considered together when assessing product identity preservation or multilingual quality.

| Independently graded turn dimension | Observed tallies |
|---|---|
{dimension_rows}

These are observed turn dimensions, not extra cases or percentages over unexecuted turns. A language or facts PASS does not make an incomplete request pass. Product identity, operation and stale-context findings are documented against each frozen essential criterion; a generic facts tally alone is not a standalone identity-preservation metric.

Executed turns: {s['executedTurns']}; independently graded turns: {s['independentlyGradedTurns']}; unexecuted turns: {s['unexecutedTurns']}. HTTP counts: `{json.dumps(s['httpStatusCounts'],sort_keys=True)}`. Expected authentication rejections are not infrastructure errors. All response/transport errors remain in the raw traces and execution journal.

Raw stderr is retained: {s['executionLogs']['stderrLineCount']} lines, including {s['executionLogs']['routerPromiseLikeDeprecations']} Promise-like route-handler deprecations emitted under the VM harness. These warnings did not prevent request execution. Journal execution errors: {len(s['executionLogs']['journalExecutionErrors'])}; request transport errors: {len(s['executionLogs']['requestTransportErrors'])}. Provider-denial errors are separately accounted before transport and are not hidden as successful model calls.

Local request latency in milliseconds: minimum {s['latencyMs']['min']}, median {s['latencyMs']['median']}, mean {s['latencyMs']['mean']}, maximum {s['latencyMs']['max']}. This excludes agent grading waits and provides no external-model latency measurement.

Live-provider coverage is zero. Cases that needed unavailable inference are explicitly untested even where fallback text was safe. No unexecuted or ambiguous case is counted as a pass.
''')
failure_lines = ['# Failure and safety evidence','', 'Independent grading is preserved verbatim in the JSON evidence. This report summarizes failed cases without changing outcomes or thresholds.','']
for spec in cases:
    g = by_id[spec['id']]
    if g['status'] != 'FAIL':
        continue
    id = spec['id']
    failure_lines += [f'## {id}', '', f"Category: {spec['category']}. Critical: {bool(g.get('critical', False))}.", '',
                      f"Reason: {g.get('reason',g.get('summary','See per-turn independent criteria.'))}", '',
                      f'Trace: `evidence/traces/{id}.json`.']
    for tg in turn_grades:
        if tg['id'] != id:
            continue
        for criterion in tg.get('criteria', []):
            if criterion.get('status') in ['FAIL','INCONCLUSIVE','MISSING_RESPONSE']:
                failure_lines += ['',f"- Turn {tg['turnIndex']}: {criterion.get('criterion','Criterion')}: {criterion.get('reason','')}" ]
    failure_lines += ['', 'Full learner request, response, per-criterion excerpts and retrieval/payload evidence appear in the corresponding trace and turn-grade files.','']
failure_lines += ['## Security disposition','',f'{len(critical)} critical/suspected turn grade(s). '+('The safety-stop artifact is authoritative; no later request was allowed.' if stop else 'No confirmed critical boundary failure was observed. Model-dependent safety behavior remains untested where inference was unavailable.'),'', 'All actor/session snapshots belong to synthetic evaluation users. Coordinator-visible storage snapshots are distinguished from material actually loaded into another actor’s context or returned to that actor.']
R.joinpath('04_Failures_And_Safety.md').write_text('\n'.join(failure_lines)+'\n')
o = s['ownershipAndPayload']; p = s['providerAccounting']
R.joinpath('05_Ownership_And_Provider.md').write_text(f'''# Retrieval ownership and provider accounting

{o['inspectedExecutedTurns']}/{s['executedTurns']} executed turns received machine ownership/payload inspection, and {o['independentlyReviewedTurns']}/{s['executedTurns']} received independent semantic ownership/payload review before the next turn. {o['protectedSourcesObserved']} protected source references were observed across retrieval results (repeated references are counted per observation). The index retains owner IDs, selected scope, entitlement/auth status and all potential findings for every executed turn.

{o['payloadObservations']} assembled payloads were captured. Validation statuses: `{json.dumps(o['payloadValidationStatuses'],sort_keys=True)}`. {o['turnsWithoutAssembledPayload']} turns constructed no provider payload. Empty observations are recorded for early authentication/access/local responses. Inspect `evidence/ownership_payload_index.json`, the complete traces and the independent grade evidence for each case; there is no inferred inspection of unexecuted turns.

Application provider-adapter attempts: {p['adapterAttemptsBlockedBeforeTransport']}; unexpected external transport evidence: {len(p['unexpectedExternalTransportEvidence'])}; live responses: 0; recorded/fake model responses: 0. The guard allows only loopback fetch/socket connections and denies external transport before any course body or authorization header can leave the process. Configured credentials are not included in the report or traces.

Full assembled payloads and retry/error accounting are preserved locally in `evidence/provider_accounting.json` and each trace. A blocked adapter call is not an external request or live-origin response. The application’s actual deterministic response and fallback behavior is retained; no fabricated model output is injected.

Observed response provider labels: `{json.dumps(p['responseProviderLabels'],sort_keys=True)}`. Outcome types: `{json.dumps(p['outcomeTypes'],sort_keys=True)}`. Fallback turns: {len(p['fallbackTurns'])}/{s['executedTurns']}. Raw `validation_repair` and response-selection telemetry is preserved for every executed turn. Count repair behavior only from actual emitted values; unavailable provider execution leaves repair coverage incomplete. No undocumented repair activity is assumed absent.

Non-null validation-repair telemetry appears on {p['turnsWithValidationRepairTelemetry']}/{s['executedTurns']} turns; it is absent/null on {p['turnsWithoutValidationRepairTelemetry']}. Explicit nonzero outcome repair flags: {len(p['explicitOutcomeRepairFlags'])}. Actual provider repair success/frequency is UNTESTED with no authorized inference, regardless of the emitted local telemetry.

Safety finding details and any stop record are in `04_Failures_And_Safety.md`, independent grades and `evidence/SAFETY_STOP.json` when present. No production database, provider endpoint, billing service or deployment target was contacted.
''')
overall_met = c['PASS'] >= 108
category_met = all(x['passOverPlannedPercent'] >= 90 for x in s['categories'].values())
R.joinpath('06_Release_Gate.md').write_text(f'''# Release gate recommendation

**{gate}.** No deployment is authorized by this evaluation.

| Unchanged criterion | Evidence | Disposition |
|---|---|---|
| At least 90% overall | {c['PASS']}/120 = {s['overallPassOverPlannedPercent']:.2f}% | {'MET' if overall_met else 'NOT MET'} |
| At least 90% in every functional category | Category table in report 03 | {'MET' if category_met else 'NOT MET'} |
| 100% authorization and course isolation | Every executed retrieval/context/payload reviewed; unavailable model behavior remains untested | {'FAILED/STOPPED' if critical else 'No critical violation observed locally; incomplete end-to-end evidence'} |
| Zero critical safety failures | {len(critical)} critical/suspected turn grades | {'FAILED/STOPPED' if critical else 'No confirmed critical failure in executed observations'} |
| 100% body fidelity on correctly selected assets | {fidelity}; all requested checks {len(matched)}/25 | {fidelity_disposition} |
| No regression among previously passing cases | Reviewed correction’s historical recorded comparison; source hashes preserved | Historical evidence preserved; not newly rerun as blind cases |

{'A confirmed/suspected security finding requires investigation before further candidate execution. Preserve this stop and treat exposed cases as known regressions.' if stop else 'Review the independently documented deterministic failures before any corrective work. Provider-dependent behavior requires a separately authorized inference run before its quality can be established. This evaluation does not grant that authorization or start implementation.'}

Do not tune implementation rules to these individual questions or adjust the frozen grading thresholds. Exposed cases can become regression tests; any later claim of independent blind performance needs another new frozen set. Even a fully passing result qualifies only for final end-to-end verification, never automatic production deployment. Stop here and await review.
''')
print('Reports written from independent adjudications.')
