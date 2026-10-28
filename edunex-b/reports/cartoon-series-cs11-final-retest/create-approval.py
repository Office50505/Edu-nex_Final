#!/usr/bin/env python3
"""Validate the prepared final CS-11 run; create approval only with --create."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create', action='store_true', help='Explicitly authorize up to four provider attempts for 30 minutes')
    args = parser.parse_args()
    report = Path(__file__).resolve().parent
    root = report.parents[1]
    expected = '346ce72c31c7a3b4f08167e26b85298c529e416e84a904c496d84b5c080405a6'
    cases = root / 'scripts/eval/cartoon-series-fast15-cases-v2.json'
    if hashlib.sha256(cases.read_bytes()).hexdigest() != expected:
        raise SystemExit('Case hash mismatch; approval not created.')
    if (report / 'test_cases_frozen.sha256').read_text().split()[0] != expected:
        raise SystemExit('Frozen hash mismatch; approval not created.')
    readiness = json.loads((report / 'preparation-checks.json').read_text())
    runtime = json.loads(Path((report / 'runtime_location.txt').read_text().strip()).read_text())
    if not (runtime['base_url'] == 'http://127.0.0.1:3128'
            and runtime.get('fixture_only') is True
            and runtime.get('fixture_pack') == 'ai-cartoon-series'
            and runtime['db_name'] == readiness['database']
            and runtime['course_id'] == readiness['course_id']
            and runtime['model'] == 'google/gemini-2.5-flash'
            and runtime['provider_key_present'] is True):
        raise SystemExit('Prepared isolated runtime does not match; approval not created.')
    policy = json.loads((root / 'knowledge/ai-cartoon-series/index.json').read_text())['policy']
    if readiness['scene_policy_verified'] not in policy:
        raise SystemExit('Verified scene policy changed; approval not created.')
    events = [json.loads(line) for line in (report / 'pipeline_traces.jsonl').read_text().splitlines() if line.strip()]
    consumed = sum(e['type'] == 'provider_invoked' for e in events)
    if consumed >= 4:
        raise SystemExit('This report has exhausted its four-attempt budget.')
    target = report / 'provider_approval.json'
    if target.exists():
        raise SystemExit('Approval already exists; refusing to overwrite it.')
    if not args.create:
        print(f'Checks passed. No approval created. Attempts consumed: {consumed}; available: {4 - consumed}.')
        return
    approval = {
        'approved': True,
        'model': runtime['model'],
        'cases_sha256': expected,
        'max_calls': 4,
        'expires_at': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=30)).isoformat(),
    }
    with target.open('x') as f:
        json.dump(approval, f, indent=2)
        f.write('\n')
    print('Approval created; expires:', approval['expires_at'])
    print('Available attempts:', 4 - consumed)


if __name__ == '__main__':
    main()
