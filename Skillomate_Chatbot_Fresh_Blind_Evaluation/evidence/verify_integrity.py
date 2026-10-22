"""Read-only verification of frozen candidate, evaluation and historical evidence."""
import datetime
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

E = Path(__file__).resolve().parent
ROOT = E.parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda p: json.loads(p.read_text())
m = load(E / 'candidate_manifest.json')
freeze = load(E / 'evaluation_freeze.json')
rows = []
for group, files in m['groups'].items():
    for name, expected in files.items():
        p = ROOT / name
        actual = sha(p) if p.is_file() else None
        rows.append({'group': group, 'path': name, 'expectedSHA256': expected,
                     'actualSHA256': actual, 'unchanged': actual == expected})
for name, expected in m['protectedHistoricalAndConfig'].items():
    p = ROOT / name
    actual = sha(p) if p.is_file() else None
    rows.append({'group': 'historicalAndConfiguration', 'path': name,
                 'expectedSHA256': expected, 'actualSHA256': actual, 'unchanged': actual == expected})
for name, expected in freeze['files'].items():
    p = E / name
    actual = sha(p) if p.is_file() else None
    rows.append({'group': 'evaluationFreeze', 'path': name,
                 'expectedSHA256': expected, 'actualSHA256': actual, 'unchanged': actual == expected})
author = load(E / 'isolated_author/validation.json')
pre_grader = load(E / 'isolated_grader/grader_attestation_pre_execution.json')
extra = {'isolated_author/cases.json': freeze['questionSHA256'],
         'isolated_author/author_cases.py': author['authorScriptSHA256']}
extra.update({f'isolated_author/{name}': expected for name, expected in author['sourceHashes'].items()})
extra.update({f'isolated_grader/{name}': expected for name, expected in pre_grader['inputSHA256'].items()})
for name, expected in extra.items():
    p = E / name
    actual = sha(p) if p.is_file() else None
    rows.append({'group': 'independentInputsAndAuthorArtifacts', 'path': name,
                 'expectedSHA256': expected, 'actualSHA256': actual, 'unchanged': actual == expected})
idx = ROOT / '.git/index'
index_actual = sha(idx)
index_ok = index_actual == m['indexSha256']
# Do not print values or include them in evidence; only detect accidental inclusion.
secrets = set()
for key, value in os.environ.items():
    if re.search('KEY|TOKEN|SECRET|PASSWORD', key, re.I) and len(value) >= 12:
        secrets.add(value.encode())
for env in [ROOT / 'edunex-b/.env', ROOT / 'edunex-b/.env.local']:
    if not env.exists():
        continue
    for line in env.read_text().splitlines():
        match = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if match and re.search('KEY|TOKEN|SECRET|PASSWORD', match[1], re.I):
            value = match[2].strip().strip('\"\'')
            if len(value) >= 12:
                secrets.add(value.encode())
leaks = []
for p in E.parent.rglob('*'):
    if p.is_file() and '__pycache__' not in p.parts:
        data = p.read_bytes()
        if any(secret in data for secret in secrets):
            leaks.append(str(p.relative_to(E.parent)))
status = subprocess.check_output(['git', '--no-optional-locks', 'status', '--short'], cwd=ROOT, text=True)
(E / 'git_status_after.txt').write_text(status)
deliveries = []
for trace_file in sorted((E / 'traces').glob('*.json')):
    record = load(trace_file)
    for trace in record['traces']:
        name = f'{record["id"]}_turn_{trace["turn"]}'
        delivered = load(E / 'isolated_grader' / f'{name}_response.json')
        grade = load(E / 'isolated_grader' / f'{name}_grade.json')
        matches = delivered == {'id': record['id'], 'category': record['category'],
                                'turnIndex': trace['turn'], 'trace': trace}
        deliveries.append({'id': record['id'], 'turn': trace['turn'],
                           'deliveredEvidenceMatchesOriginalTrace': matches,
                           'gradeIdentityMatches': grade['id'] == record['id'] and grade['turnIndex'] == trace['turn']})
sequence = [json.loads(line) for line in (E / 'execution_journal.jsonl').read_text().splitlines() if line.strip()]
pending = None
sequencing_errors = []
for row in sequence:
    identity = (row.get('id'), row.get('turn'))
    if row['event'] == 'turn_start':
        if pending is not None:
            sequencing_errors.append({'kind': 'next_turn_before_adjudication', 'pending': pending, 'event': row})
        pending = identity
    elif row['event'] == 'turn_adjudicated':
        if pending != identity:
            sequencing_errors.append({'kind': 'adjudication_identity_mismatch', 'pending': pending, 'event': row})
        pending = None
if pending:
    sequencing_errors.append({'kind': 'unadjudicated_turn', 'pending': pending})
parse_time = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
first_request = next(row['at'] for row in sequence if row['event'] == 'turn_start')
freeze_precedes_execution = parse_time(m['frozenAt']) <= parse_time(freeze['frozenAt']) < parse_time(first_request)
result = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'allFrozenFilesUnchanged': all(row['unchanged'] for row in rows),
          'verifiedCounts': {g: sum(row['group'] == g for row in rows) for g in sorted({r['group'] for r in rows})},
          'gitIndexUnchanged': index_ok, 'indexActualSHA256': index_actual,
          'credentialValueScan': {'sourceValueCount': len(secrets), 'leakedFiles': leaks,
                                  'valuesNotPrintedOrPackaged': True,
                                  'limitation': 'Scans configured long secret-like .env and process environment values, not an exhaustive secret inventory.'},
          'runtimeEvidenceConsistency': {'turnsChecked': len(deliveries),
                                         'allDeliveriesAndGradeIdentitiesMatch': all(d['deliveredEvidenceMatchesOriginalTrace'] and d['gradeIdentityMatches'] for d in deliveries),
                                         'sequencingErrors': sequencing_errors, 'deliveries': deliveries},
          'freezeTimeline': {'candidateFrozenAt': m['frozenAt'], 'evaluationFrozenAt': freeze['frozenAt'],
                             'firstCandidateRequestAt': first_request, 'freezePrecedesExecution': freeze_precedes_execution},
          'verification': rows}
(E / 'final_integrity.json').write_text(json.dumps(result, indent=2))
overview = {k: v for k, v in result.items() if k not in ['verification', 'runtimeEvidenceConsistency']}
overview['runtimeEvidenceConsistency'] = {k: v for k, v in result['runtimeEvidenceConsistency'].items() if k != 'deliveries'}
print(json.dumps(overview, indent=2))
assert result['allFrozenFilesUnchanged'] and index_ok and not leaks, 'Integrity or credential evidence requires review.'
assert result['runtimeEvidenceConsistency']['allDeliveriesAndGradeIdentitiesMatch'] and not sequencing_errors, 'Runtime evidence consistency requires review.'
assert freeze_precedes_execution, 'Freeze timeline requires review.'
