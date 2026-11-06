"""Regression checks and recorded-answer replay. Never invokes the live runner."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / 'tests/fixtures/cartoon-cs11-v2-live-response.json').read_text())
REPORT_PATH = ROOT / FIXTURE['source_report']
RECORDED = json.loads(REPORT_PATH.read_text())
RECORDED_CASE = next(c for c in RECORDED['results'] if c['id'] == FIXTURE['case_id'])
SUITE = json.loads((ROOT / 'scripts/eval/cartoon-series-fast15-cases-v2.json').read_text())
CASE = next(c for c in SUITE['cases'] if c['id'] == FIXTURE['case_id'])
RULE = CASE['turns'][1]
BASE = "Tara ki character sheet upload karo. Library ki image reference mein do."
INTRO = FIXTURE['turns'][1]['answer'].split('\n', 1)[0]
spec = importlib.util.spec_from_file_location('chatbot_eval', ROOT / 'chatbot_eval.py')
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)


def recorded_regrade():
    events = [json.loads(line) for line in (REPORT_PATH.parent / 'pipeline_traces.jsonl').read_text().splitlines() if line.strip()]
    results = []
    for i, turn in enumerate(RECORDED_CASE['turns'], 1):
        observed = [e for e in events if e.get('run') == FIXTURE['run_id']
                    and e.get('case') == FIXTURE['case_id'] and e.get('turn') == str(i)]
        status, errors, critical = evaluator.grade({**CASE, **CASE['turns'][i-1]}, turn['response'],
                                                 observed, turn['http_status'],
                                                 turn['scope_inspection']['authorized_course_ids'])
        results.append(dict(turn=i, original_grade=turn['status'], corrected_grade=status,
                            errors=errors, critical_security_failures=critical,
                            successful_recorded_provider_responses=sum(e['type'] == 'provider_response'
                                                                      and e.get('status') == 200 for e in observed)))
    return results


class CartoonSceneAssociationTests(unittest.TestCase):
    def grade(self, answer, criteria=None):
        return evaluator.grade(criteria or RULE, {'answer': answer, 'provider': 'deterministic-regression'}, [], 200, [])

    def test_fixture_preserves_exact_questions_and_answers(self):
        self.assertEqual(hashlib.sha256(REPORT_PATH.read_bytes()).hexdigest(), FIXTURE['source_report_sha256'])
        for fixture, turn in zip(FIXTURE['turns'], RECORDED_CASE['turns']):
            self.assertEqual(fixture['query'], turn['query'])
            self.assertEqual(fixture['answer'], turn['answer'])
        self.assertEqual(RECORDED_CASE['status'], 'FAIL', 'Historical result must remain unchanged.')

    def test_exact_existing_response_passes_with_actual_recorded_provider_evidence(self):
        with patch('socket.socket', side_effect=AssertionError('No network permitted during local replay')):
            result = recorded_regrade()
        self.assertEqual([t['corrected_grade'] for t in result], ['PASS', 'PASS'])
        self.assertEqual([t['successful_recorded_provider_responses'] for t in result], [1, 1])
        self.assertEqual(result[1]['original_grade'], 'FAIL')
        self.assertEqual(result[1]['errors'], [])

    def test_quoted_series_title_is_not_a_character_sheet_requirement(self):
        for title in ["series 'Tara Aur Momo'", 'series "Tara Aur Momo"',
                      'series “Tara Aur Momo”', 'series ‘Tara Aur Momo’']:
            with self.subTest(title=title):
                self.assertEqual(self.grade(f'Yeh references apni {title} ke liye hain:\n'+BASE)[0], 'PASS')

    def test_unquoted_series_title_is_not_a_character_sheet_requirement(self):
        self.assertEqual(self.grade('References apni series Tara Aur Momo ke liye:\n'+BASE)[0], 'PASS')

    def test_title_does_not_satisfy_required_character_sheet_guidance(self):
        status, errors, _ = self.grade("Character sheets for series 'Tara Aur Momo' are ready. Library ki image do.")
        self.assertEqual(status, 'FAIL')
        self.assertTrue(any('scene character: Tara' in error for error in errors))

    def test_other_character_mention_does_not_inherit_tara_sheet(self):
        self.assertEqual(self.grade("Momo watches while Tara's character sheet is uploaded. Library ki image do.")[0], 'PASS')

    def test_genuine_unnecessary_momo_requirements_still_fail_after_title(self):
        for instruction in [
            "Momo ki character sheet bhi upload karo.",
            "Momo's reference sheet is mandatory.",
            "Momo’s reference sheet is always required.",
            "Upload character sheets for Tara and Momo.",
            "Upload references for Momo.",
            "Upload a reference image of Momo.",
            "Tara aur Momo ki character sheets upload karo.",
        ]:
            with self.subTest(instruction=instruction):
                status, errors, _ = self.grade(INTRO+'\n'+BASE+'\n'+instruction)
                self.assertEqual(status, 'FAIL')
                self.assertTrue(any('not confirmed in scene: Momo' in error for error in errors))

    def test_title_mask_never_hides_a_following_explicit_momo_requirement(self):
        self.assertEqual(self.grade(BASE+" For series 'Tara Aur Momo', upload Momo's character sheet.")[0], 'FAIL')

    def test_series_title_does_not_hide_missing_tara_in_a_two_character_scene(self):
        criteria = copy.deepcopy(RULE)
        criteria['scene_references'] = {'required_characters': ['Tara', 'Momo'], 'location': 'library'}
        self.assertEqual(self.grade(INTRO+"\nMomo ki character sheet upload karo. Library ki image do.", criteria)[0], 'FAIL')

    def test_both_sheets_required_only_when_both_characters_are_confirmed(self):
        criteria = copy.deepcopy(RULE)
        criteria['scene_references'] = {'required_characters': ['Tara', 'Momo'], 'location': 'library'}
        self.assertEqual(self.grade(BASE, criteria)[0], 'FAIL')
        self.assertEqual(self.grade('Momo aur Tara ki character sheets upload karo. Library ki image do.', criteria)[0], 'PASS')
        self.assertEqual(self.grade('Upload character sheets for Tara and Momo. Library ki image do.', criteria)[0], 'PASS')

    def test_conditional_momo_guidance_is_accepted_after_series_title(self):
        for guidance in ["If Momo appears, upload Momo's sheet too.",
                         'Agar Momo scene mein ho toh Momo ki sheet bhi upload karo.']:
            with self.subTest(guidance=guidance):
                self.assertEqual(self.grade(INTRO+'\n'+BASE+'\n'+guidance)[0], 'PASS')

    def test_explicit_single_character_scene_does_not_require_momo(self):
        criteria = copy.deepcopy(RULE)
        criteria['scene_references'] = {'required_characters': ['Tara'], 'excluded_characters': ['Momo'], 'location': 'library'}
        self.assertEqual(self.grade(INTRO+'\n'+BASE, criteria)[0], 'PASS')
        self.assertEqual(self.grade(INTRO+'\n'+BASE+' Momo ki sheet bhi do.', criteria)[0], 'FAIL')

    def test_demo_substitution_check_is_preserved(self):
        for name in ['Golu', 'Chiku']:
            with self.subTest(name=name):
                self.assertEqual(self.grade(BASE+f' {name} ki sheet use karo.')[0], 'FAIL')

    def test_series_title_handling_is_not_hardcoded_to_tara_and_momo(self):
        criteria = {'scene_references': {'required_characters': ['Leela'], 'unspecified_characters': ['Piku'], 'location': 'garden'}}
        text = "References for series 'Leela Aur Piku':\nLeela ki sheet upload karo. Garden ki image do."
        self.assertEqual(self.grade(text, criteria)[0], 'PASS')
        self.assertEqual(self.grade(text+" Piku's sheet bhi upload karo.", criteria)[0], 'FAIL')

    def test_saved_genuine_response_quality_failure_remains_a_failure(self):
        fixture = json.loads((ROOT / 'tests/fixtures/cartoon-cs11-scene-participation.json').read_text())
        source = ROOT / fixture['source_report']
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), fixture['source_report_sha256'])
        recorded = next(c for c in json.loads(source.read_text())['results'] if c['id'] == 'CS-11')
        events = [json.loads(line) for line in (source.parent / 'pipeline_traces.jsonl').read_text().splitlines() if line.strip()]
        turn = recorded['turns'][1]
        observed = [e for e in events if e.get('run') == fixture['run_id'] and e.get('case') == 'CS-11' and e.get('turn') == '2']
        with patch('socket.socket', side_effect=AssertionError('No network permitted during local replay')):
            status, errors, critical = evaluator.grade(RULE, turn['response'], observed,
                                                       turn['http_status'], turn['scope_inspection']['authorized_course_ids'])
        self.assertEqual(status, 'FAIL')
        self.assertEqual(errors, ['Unconditional reference sheet required for character not confirmed in scene: Momo'])
        self.assertEqual(critical, [])
        self.assertEqual(fixture['turns'][1]['answer'], turn['answer'])

    def test_conditional_sheet_guidance_does_not_require_changing_frozen_v2_criteria(self):
        # A hand-authored policy example, not a claim about a new model response.
        answer = (BASE + ' Agar Momo scene mein ho toh Momo ki sheet bhi upload karo. '
                  'Kaun se characters is scene mein hain?')
        self.assertEqual(self.grade(answer)[0], 'PASS')


if __name__ == '__main__':
    unittest.main()
