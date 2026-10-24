"""Deterministic rubric checks only. No API, DB, provider, or recorded-result writes."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('chatbot_eval', ROOT / 'chatbot_eval.py')
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)
V1_PATH = ROOT / 'scripts/eval/cartoon-series-fast15-cases.json'
V2_PATH = ROOT / 'scripts/eval/cartoon-series-fast15-cases-v2.json'
V1 = json.loads(V1_PATH.read_text())
V2 = json.loads(V2_PATH.read_text())
OLD = next(c for c in V1['cases'] if c['id'] == 'CS-11')['turns'][1]
NEW = next(c for c in V2['cases'] if c['id'] == 'CS-11')['turns'][1]
BASE = "Tara ki character sheet upload karo. Library ki image reference mein do."


class CartoonCS11V2Tests(unittest.TestCase):
    def grade(self, answer, criteria=None, response=None, events=None):
        return evaluator.grade(criteria or NEW, response or {'answer': answer, 'provider': 'local-test-response'}, events or [], 200, [])

    def test_only_cs11_second_turn_criteria_changed(self):
        for a, b in zip(V1['cases'], V2['cases']):
            self.assertEqual(a['id'], b['id'])
            if a['id'] == 'CS-11':
                self.assertEqual(a['turns'][0], b['turns'][0])
                self.assertEqual(a['turns'][1]['query'], b['turns'][1]['query'])
                self.assertEqual(a['turns'][1]['forbidden_any'], b['turns'][1]['forbidden_any'])
            else:
                self.assertEqual(a, b)
        self.assertEqual(len(V2['cases']), 13)
        self.assertEqual(sum(len(c.get('turns', [c])) for c in V2['cases']), 15)

    def test_original_frozen_cases_unchanged(self):
        self.assertEqual(hashlib.sha256(V1_PATH.read_bytes()).hexdigest(),
                         'eb73038e68aa684d5e5b47bc7c7fcb50c58ea3e0f1230f128ad660f9e88f606c')

    def test_v2_has_separate_freeze_and_cannot_reuse_v1_approval(self):
        digest = hashlib.sha256(V2_PATH.read_bytes()).hexdigest()
        frozen = '346ce72c31c7a3b4f08167e26b85298c529e416e84a904c496d84b5c080405a6'
        self.assertEqual(digest, frozen)
        self.assertNotEqual(digest, hashlib.sha256(V1_PATH.read_bytes()).hexdigest())

    def test_unspecified_second_character_may_be_omitted(self):
        self.assertEqual(self.grade(BASE)[0], 'PASS')

    def test_unspecified_second_character_accepts_conditional_guidance(self):
        for extra in [
            " If Momo appears in the scene, upload Momo's sheet too.",
            " Momo ki sheet sirf agar Momo frame mein ho toh daalo.",
            " Momo ki sheet tabhi daalo jab woh scene mein dikhe.",
            " Momo scene mein ho toh Momo ki sheet bhi reference mein do.",
            " Should Momo's reference sheet be included in this scene?",
        ]:
            with self.subTest(extra=extra):
                self.assertEqual(self.grade(BASE + extra)[0], 'PASS')

    def test_unspecified_second_character_cannot_be_required_unconditionally(self):
        for extra in [
            " Momo ki sheet bhi upload karo.",
            " Momo's reference sheet is always required.",
            " Momo ki sheet hamesha daalo.",
            " Upload Momo's sheet even if Momo is absent.",
        ]:
            with self.subTest(extra=extra):
                status, errors, _ = self.grade(BASE + extra)
                self.assertEqual(status, 'FAIL')
                self.assertTrue(any('Unconditional reference sheet' in e for e in errors))

    def test_explicit_single_character_scene_needs_only_that_sheet(self):
        criteria = copy.deepcopy(NEW)
        criteria['query'] = 'Scene mein sirf Tara hai; Momo nahi hai. Library start frame checklist do.'
        criteria['scene_references'] = {'required_characters': ['Tara'], 'excluded_characters': ['Momo'], 'location': 'library'}
        self.assertEqual(self.grade(BASE, criteria)[0], 'PASS')
        self.assertEqual(self.grade(BASE + ' Momo ki sheet bhi upload karo.', criteria)[0], 'FAIL')

    def test_explicit_two_character_scene_needs_both_sheets(self):
        criteria = copy.deepcopy(NEW)
        criteria['query'] = 'Scene mein Tara aur Momo dono hain. Library start frame checklist do.'
        criteria['scene_references'] = {'required_characters': ['Tara', 'Momo'], 'location': 'library'}
        self.assertEqual(self.grade(BASE, criteria)[0], 'FAIL')
        self.assertEqual(self.grade(BASE + " Momo ki character sheet bhi upload karo.", criteria)[0], 'PASS')
        self.assertEqual(self.grade('Tara aur Momo ki character sheets upload karo. Library ki image do.', criteria)[0], 'PASS')

    def test_tara_name_alone_is_not_reference_guidance(self):
        status, errors, _ = self.grade('Tara yellow coat pehenti hai. Library ki image reference mein do.')
        self.assertEqual(status, 'FAIL')
        self.assertTrue(any('scene character: Tara' in e for e in errors))

    def test_library_name_alone_is_not_location_reference_guidance(self):
        status, errors, _ = self.grade('Tara ki character sheet upload karo. Library mein scene banao.')
        self.assertEqual(status, 'FAIL')
        self.assertTrue(any('location-image/reference guidance' in e for e in errors))

    def test_unneeded_momo_sheet_can_be_explicitly_declined(self):
        for extra in [" Momo's sheet is not required.", " Momo ki sheet zaroori nahi.", " Momo ki sheet mat daalo."]:
            with self.subTest(extra=extra):
                self.assertEqual(self.grade(BASE + extra)[0], 'PASS')

    def test_demo_character_substitution_still_fails(self):
        for name in ['Golu', 'Chiku']:
            with self.subTest(name=name):
                self.assertEqual(self.grade(BASE + f' {name} ki sheet bhi upload karo.')[0], 'FAIL')

    def test_names_are_case_data_not_hardcoded(self):
        criteria = {'scene_references': {'required_characters': ['Leela'], 'unspecified_characters': ['Piku'], 'location': 'garden'}}
        self.assertEqual(self.grade('Leela ki sheet upload karo. Garden ki image do. Agar Piku scene mein ho toh Piku ki sheet bhi do.', criteria)[0], 'PASS')
        self.assertEqual(self.grade('Leela ki sheet upload karo. Garden ki image do. Piku ki sheet hamesha do.', criteria)[0], 'FAIL')

    def test_old_criteria_retain_original_behavior(self):
        status, errors, _ = self.grade(BASE, OLD)
        self.assertEqual(status, 'FAIL')
        self.assertIn("Missing concept group: ['Momo']", errors)

    def test_fallback_cannot_become_a_corrected_live_pass(self):
        self.assertEqual(self.grade(BASE, response={'answer': BASE, 'provider': 'built-in-course-guide'})[0], 'UNTESTED')

    def test_live_answer_still_requires_real_provider_evidence(self):
        self.assertEqual(self.grade(BASE, response={'answer': BASE, 'outcome': {'liveModelAnswer': True}})[0], 'UNTESTED')

    def test_security_failure_still_overrides_scene_guidance(self):
        self.assertEqual(self.grade(BASE, events=[{'type': 'critical_security_failure', 'reason': 'foreign owner'}])[0], 'FAIL')

    def test_indexed_prompt_bodies_still_match_their_integrity_hashes(self):
        for course in ['ai-cartoon-series', 'ai-local-business-ads']:
            index = json.loads((ROOT / 'knowledge' / course / 'index.json').read_text())
            for record in index['records']:
                self.assertEqual(hashlib.sha256(record['content'].encode()).hexdigest(), record['contentHash'])


if __name__ == '__main__':
    unittest.main()
