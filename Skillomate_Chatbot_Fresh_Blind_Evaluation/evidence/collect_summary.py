"""Aggregate independent grades and runtime observations; never changes grading."""
import collections
import csv
import datetime
import difflib
import hashlib
import json
import statistics
from pathlib import Path

E = Path(__file__).resolve().parent
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
cases = load(E / 'frozen_cases.json')['cases']
independent = load(E / 'isolated_grader/grades.json')
grades = independent['cases']
assert len(grades) == 120 and {g['id'] for g in grades} == {c['id'] for c in cases}
allowed = {'PASS', 'FAIL', 'UNTESTED', 'INCONCLUSIVE', 'MISSING_RESPONSE'}
assert all(g['status'] in allowed for g in grades)
by_id = {g['id']: g for g in grades}
traces = {f.stem: load(f) for f in (E / 'traces').glob('*.json')}
turns = [(id, t) for id, case in traces.items() for t in case['traces']]
turn_grades = [load(f) for f in (E / 'isolated_grader').glob('*_grade.json')]
counts = collections.Counter(g['status'] for g in grades)
categories = {}
for category in sorted({c['category'] for c in cases}):
    members = [c for c in cases if c['category'] == category]
    n = collections.Counter(by_id[c['id']]['status'] for c in members)
    categories[category] = {'planned': len(members), 'counts': dict(n),
                            'passOverPlannedPercent': 100 * n['PASS'] / len(members),
                            'anyTurnExecuted': sum(c['id'] in traces for c in members)}
providers = [p for _, t in turns for p in t['providerRequests']]
origins = collections.Counter(t.get('response', {}).get('provider', 'no_provider') for _, t in turns)
http = collections.Counter(str(t['statusCode']) for _, t in turns)
outcomes = collections.Counter(t.get('response', {}).get('outcome', {}).get('type', 'absent') for _, t in turns)
latencies = [t['latencyMs'] for _, t in turns]
source_count = sum(len(t['scopeInspection']['protectedRetrievedSources']) for _, t in turns)
payloads = [(id, t['turn'], p) for id, t in turns for p in t['payloadObservations']]
exact = [dict(caseId=g['id'], turnIndex=g['turnIndex'], **check)
         for g in turn_grades for check in g.get('requestedExactBodyChecks', [])]
dimensions = {}
for dim in sorted({dim for g in turn_grades for dim in g.get('dimensions', {})}):
    dimensions[dim] = dict(collections.Counter(str(g.get('dimensions', {}).get(dim, 'UNASSESSED')) for g in turn_grades))
fallbacks = []
repairs = []
repair_telemetry = []
for id, t in turns:
    r = t.get('response', {})
    outcome = r.get('outcome', {})
    if 'fallback' in str(r.get('provider', '')).lower() or 'fallback' in str(outcome.get('type', '')).lower():
        fallbacks.append({'id': id, 'turn': t['turn'], 'provider': r.get('provider'), 'outcome': outcome})
    # Preserve the actual outcome object; do not infer an undocumented repair flag.
    if any('repair' in k.lower() and v for k, v in outcome.items()):
        repairs.append({'id': id, 'turn': t['turn'], 'outcome': outcome})
    repair_telemetry.append({'id': id, 'turn': t['turn'],
                             'validationRepair': r.get('debug', {}).get('validation_repair'),
                             'responseSelection': r.get('debug', {}).get('response_selection')})
external = [p for p in providers if p.get('httpStatus') or p.get('error', {}).get('code') != 'PROVIDER_PAYLOAD_NOT_APPROVED']
scope_alerts = [{'id': id, 'turn': t['turn'], 'findings': t['scopeInspection']['potentialCriticalFindings']}
                for id, t in turns if t['scopeInspection']['potentialCriticalFindings']]
summary = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'independentGradesSHA256': sha(E / 'isolated_grader/grades.json'),
    'plannedCases': 120, 'plannedTurns': sum(len(c['turns']) for c in cases),
    'caseCounts': {s: counts[s] for s in sorted(allowed)},
    'overallPassOverPlannedPercent': 100 * counts['PASS'] / 120,
    'caseAnyTurnExecuted': len(traces),
    'caseAllTurnsExecuted': sum(t['complete'] for t in traces.values()),
    'executedTurns': len(turns), 'independentlyGradedTurns': len(turn_grades),
    'unexecutedTurns': sum(len(c['turns']) for c in cases) - len(turns),
    'categories': categories, 'turnStatuses': dict(collections.Counter(g['status'] for g in turn_grades)),
    'dimensionTurnTallies': dimensions,
    'exactBodyChecks': {'planned': 25, 'observedIndependentChecks': exact,
                        'note': 'Inspect independent exact records for selection versus literal fidelity; never infer pass for unexecuted checks.'},
    'ownershipAndPayload': {
        'inspectedExecutedTurns': sum(t['scopeInspection']['inspectionPerformed'] for _, t in turns),
        'independentlyReviewedTurns': sum(g.get('ownershipPayloadReview', {}).get('reviewed', False) for g in turn_grades),
        'protectedSourcesObserved': source_count, 'payloadObservations': len(payloads),
        'payloadValidationStatuses': dict(collections.Counter(p.get('validation', 'unknown') for _, _, p in payloads)),
        'turnsWithoutAssembledPayload': sum(t['scopeInspection']['noPayloadConstructed'] for _, t in turns),
        'machineScopeAlerts': scope_alerts,
        'criticalGrades': [g for g in turn_grades if g.get('critical') or g.get('suspectedCritical')],
    },
    'providerAccounting': {'externalAuthorized': False, 'adapterAttemptsBlockedBeforeTransport': len(providers) - len(external),
                           'unexpectedExternalTransportEvidence': external, 'liveProviderResponses': 0,
                           'fixtureModelResponses': 0, 'responseProviderLabels': dict(origins),
                           'outcomeTypes': dict(outcomes), 'fallbackTurns': fallbacks,
                           'explicitOutcomeRepairFlags': repairs,
                           'rawValidationRepairTelemetry': repair_telemetry,
                           'turnsWithValidationRepairTelemetry': sum(row['validationRepair'] is not None for row in repair_telemetry),
                           'turnsWithoutValidationRepairTelemetry': sum(row['validationRepair'] is None for row in repair_telemetry),
                           'repairLimitation': 'Only explicit emitted repair flags counted; absence of telemetry is not proof that internal repair logic never ran.'},
    'httpStatusCounts': dict(http),
    'latencyMs': {'count': len(latencies), 'min': min(latencies, default=None),
                  'max': max(latencies, default=None), 'mean': statistics.mean(latencies) if latencies else None,
                  'median': statistics.median(latencies) if latencies else None,
                  'note': 'Local request time only; excludes independent grading waits.'},
    'safetyStop': load(E / 'SAFETY_STOP.json') if (E / 'SAFETY_STOP.json').exists() else None,
    'productionInteraction': False, 'candidateModifiedByEvaluation': False,
}
stderr = (E / 'execution_stderr.log').read_text() if (E / 'execution_stderr.log').exists() else ''
journal = [json.loads(line) for line in (E / 'execution_journal.jsonl').read_text().splitlines() if line.strip()]
summary['executionLogs'] = {'stderrLineCount': len(stderr.splitlines()),
                            'routerPromiseLikeDeprecations': stderr.count('handlers that are Promise-like are deprecated'),
                            'journalExecutionErrors': [row for row in journal if row.get('event') == 'execution_error'],
                            'requestTransportErrors': [{'id': id, 'turn': t['turn'], 'error': t.get('error')}
                                                       for id, t in turns if t.get('error')],
                            'rawStderrPreserved': True}
(E / 'results_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
scope_index = []
grade_turn_index = {(g['id'], g['turnIndex']): g for g in turn_grades}
for id, t in turns:
    g = grade_turn_index.get((id, t['turn']), {})
    scope_index.append({'id': id, 'turn': t['turn'], 'statusCode': t['statusCode'],
                        'tracePath': f'traces/{id}.json',
                        'gradePath': f'isolated_grader/{id}_turn_{t["turn"]}_grade.json',
                        'inspection': t['scopeInspection'],
                        'independentReview': g.get('ownershipPayloadReview', {}),
                        'independentStatus': g.get('status', 'UNTESTED')})
(E / 'ownership_payload_index.json').write_text(json.dumps(scope_index, ensure_ascii=False, indent=2))
accounting = [{'id': id, 'turn': t['turn'], 'adapterAttempts': t['providerRequests'],
               'responseProviderLabel': t.get('response', {}).get('provider'),
               'outcome': t.get('response', {}).get('outcome'),
               'providerDebug': t.get('response', {}).get('debug', {}).get('provider')}
              for id, t in turns]
(E / 'provider_accounting.json').write_text(json.dumps(accounting, ensure_ascii=False, indent=2))
body_diffs = []
for check in exact:
    expected = check.get('expectedBody', '')
    actual = check.get('actualBody', '')
    if not isinstance(expected, str) or not isinstance(actual, str):
        continue
    body_diffs.append({'caseId': check['caseId'], 'turnIndex': check['turnIndex'],
                       'heading': check.get('heading'), 'independentStatus': check.get('status'),
                       'expectedBody': expected, 'actualBody': actual,
                       'unifiedDiff': ''.join(difflib.unified_diff(expected.splitlines(True), actual.splitlines(True),
                                                                  fromfile='frozen_expected', tofile='observed_actual')),
                       'note': 'Literal diagnostic diff; independent rubric still permits whitespace-only compaction.'})
(E / 'exact_body_diffs.json').write_text(json.dumps(body_diffs, ensure_ascii=False, indent=2))
with (E / 'case_results.csv').open('w', newline='') as output:
    writer = csv.DictWriter(output, fieldnames=['id', 'category', 'status', 'plannedTurns', 'executedTurns',
                                               'allTurnsExecuted', 'critical', 'providerAdapterAttempts',
                                               'trace', 'reason'])
    writer.writeheader()
    for case in cases:
        g = by_id[case['id']]
        trace = traces.get(case['id'], {})
        observed = trace.get('traces', [])
        writer.writerow({'id': case['id'], 'category': case['category'], 'status': g['status'],
                         'plannedTurns': len(case['turns']), 'executedTurns': len(observed),
                         'allTurnsExecuted': trace.get('complete', False), 'critical': bool(g.get('critical', False)),
                         'providerAdapterAttempts': sum(len(t['providerRequests']) for t in observed),
                         'trace': f'traces/{case["id"]}.json' if observed else '',
                         'reason': g.get('reason', g.get('summary', 'See independent turn-grade criteria.'))})
print(json.dumps({k: summary[k] for k in ['caseCounts', 'executedTurns', 'unexecutedTurns', 'overallPassOverPlannedPercent']}, indent=2))
