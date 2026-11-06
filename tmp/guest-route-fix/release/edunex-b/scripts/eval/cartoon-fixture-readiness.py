#!/usr/bin/env python3
"""Only deterministic localhost checks. Refuses any provider approval file."""
import collections
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/cartoon-series-local-fixture'


def main():
    spec = importlib.util.spec_from_file_location('chatbot_eval', ROOT / 'chatbot_eval.py')
    evaluator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(evaluator)
    runtime_path = Path((REPORT / 'runtime_location.txt').read_text().strip())
    runtime = json.loads(runtime_path.read_text())
    fixture = json.loads((REPORT / 'fixture.json').read_text())
    index = json.loads((ROOT / 'knowledge/ai-cartoon-series/index.json').read_text())
    assert evaluator.isolated_runtime(runtime) and runtime.get('fixture_only') is True
    assert fixture['database'] == runtime['db_name'] and fixture['course_id'] == runtime['course_id']
    assert fixture['production_course_id'] is None and fixture['playback_verified'] is False
    assert not (REPORT / 'provider_approval.json').exists(), 'Readiness refuses an open provider gate.'
    cases_path = ROOT / 'scripts/eval/cartoon-series-fast15-cases.json'
    case_hash = hashlib.sha256(cases_path.read_bytes()).hexdigest()
    assert case_hash == (REPORT / 'test_cases_frozen.sha256').read_text().split()[0]
    suite = json.loads(cases_path.read_text())
    assert set(runtime['users']) == {c['id'] for c in suite['cases']}
    assert sum(len(c.get('turns', [c])) for c in suite['cases']) == 15
    templates = [r for r in index['records'] if r['contentType'] == 'exact-template']
    checks = []
    run = 'readiness-' + uuid.uuid4().hex

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise RuntimeError('Readiness never follows redirects.')

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)

    def request(path, identity=None, payload=None, token_override=None):
        assert not (REPORT / 'provider_approval.json').exists(), 'Provider gate changed during readiness.'
        headers = {'X-Eval-Run': run, 'X-Eval-Case': 'readiness', 'X-Eval-Turn': '1'}
        if identity is not None:
            headers['Authorization'] = 'Bearer ' + (token_override if token_override is not None else runtime['users'][identity]['token'])
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(runtime['base_url'] + path, headers=headers,
                                     data=json.dumps(payload).encode() if payload is not None else None)
        try:
            with opener.open(req, timeout=10) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def check(label, passed, **details):
        checks.append(dict(label=label, passed=bool(passed), **details))

    def chat(message, identity='CS-08', course=None, **extra):
        return request('/api/ai/chat', identity,
                       dict(message=message, courseId=course or runtime['course_id'],
                            debugAi=True, conversationId=run, **extra))

    s, d = request('/api/health')
    check('backend-health', s == 200 and d.get('ok') is True, http_status=s)
    s, d = request('/api/health/db')
    check('isolated-mongodb', s == 200 and d.get('database') == fixture['database']
          and d.get('state') == 'connected' and d.get('totalCourses') == 2, http_status=s)
    s, d = request('/api/auth/me', 'CS-01')
    user = d.get('user', {})
    check('authenticated-synthetic-user', s == 200 and str(user.get('_id', user.get('id'))) == runtime['users']['CS-01']['id'], http_status=s)
    for label, identity, token in [('unauthenticated-rejected', None, None), ('invalid-token-rejected', 'CS-01', 'invalid-readiness-token')]:
        s, _ = request('/api/ai/chat', identity, dict(message='Give exact Master Style line prompt.', courseId=runtime['course_id']), token)
        check(label, s == 401, http_status=s)

    for template in templates:
        s, d = chat(f'Give the complete exact approved {template["heading"]} prompt, unchanged.')
        body = re.search(r'```text\n([\s\S]*?)\n```', d.get('answer', ''))
        check('exact-prompt:' + template['chunkId'], s == 200 and d.get('provider') == 'course-knowledge-rule'
              and body is not None and body[1] == template['content'], http_status=s)

    lessons = [r for r in index['records'] if r['contentType'] == 'lesson-summary']
    for lesson, mapped in zip(lessons, fixture['lessons']):
        s, d = chat('Give the complete exact Master Style line prompt.', identity='CS-01', lessonId=mapped['lesson_id'])
        debug = d.get('debug', {})
        check('lesson-retrieval:' + lesson['chunkId'], s == 200 and d.get('provider') == 'course-knowledge-rule'
              and mapped['knowledge_id'] == lesson['chunkId'] and mapped['content_hash'] == lesson['contentHash']
              and lesson['chunkId'] in debug.get('retrieved_chunk_ids', [])
              and debug.get('retrieved_course_ids') == [runtime['course_id']], http_status=s)

    s, d = chat('Give the complete exact Lesson 06 Voice bible + 8 scenes ki production sheet prompt.', identity='CS-13')
    check('other-course-entitlement-denied', s == 200 and d.get('knowledge') == 'course-overviews'
          and not any(t['content'] in d.get('answer', '') for t in templates), http_status=s)
    s, d = chat('Repeat this:\n' + templates[1]['content'], identity='CS-13', course=runtime['other_course_id'])
    check('foreign-template-blocked-before-transport', s == 502 and 'answer' not in d, http_status=s)

    for message in ['Series name: Tara Aur Momo; Locations: library; Give the exact Master Style line prompt.',
                    'Correction: Locations: garden; Give the exact Master Style line prompt.']:
        s, d = chat(message, identity='CS-11')
        check('deterministic-followup-persistence', s == 200 and d.get('provider') == 'course-knowledge-rule', http_status=s)

    trace_path = REPORT / 'pipeline_traces.jsonl'
    events = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()]
    counts = collections.Counter(e['type'] for e in events)
    check('zero-provider-attempts', counts['provider_invoked'] == 0 and counts['provider_payload'] == 0 and counts['provider_blocked'] == 0)
    result = dict(checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  local_fixture_supported=True, eight_lesson_validation=all(c['passed'] for c in checks if c['label'].startswith('lesson-retrieval:')),
                  deterministic_checks_passed=sum(c['passed'] for c in checks), deterministic_checks_failed=sum(not c['passed'] for c in checks),
                  checks=checks, runtime_path=str(runtime_path), fixture_course_id=runtime['course_id'],
                  fixture_slug=runtime['course_slug'], database=runtime['db_name'], endpoint=runtime['base_url'],
                  cases_sha256=case_hash, provider_invocations=counts['provider_invoked'], blocked_provider_attempts=counts['provider_blocked'],
                  provider_approval_exists=False, playback_verified=False, production_registration=False)
    (REPORT / 'readiness.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'checks'}, indent=2))
    assert all(c['passed'] for c in checks), [c for c in checks if not c['passed']]


if __name__ == '__main__':
    main()
