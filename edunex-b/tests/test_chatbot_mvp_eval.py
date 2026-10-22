import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('chatbot_eval', Path(__file__).resolve().parents[1] / 'chatbot_eval.py')
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)


class MvpGradingTests(unittest.TestCase):
    def test_product_identity_requires_the_full_string(self):
        status, _, _ = evaluator.grade({'required_groups': ['cotton eye pillow']}, {'answer': 'copper bookmark'}, [], 200, [])
        self.assertEqual(status, 'FAIL')

    def test_product_identity_and_alternative_concept_groups(self):
        status, _, _ = evaluator.grade({'required_groups': ['cotton eye pillow', ['reference', 'sheet']]}, {'answer': 'cotton eye pillow reference'}, [], 200, [])
        self.assertEqual(status, 'PASS')

    def test_security_failure_overrides_provider_fallback(self):
        status, _, critical = evaluator.grade({}, {'provider': 'built-in-course-guide'}, [{'type': 'critical_security_failure', 'reason': 'foreign body'}], 200, [])
        self.assertEqual(status, 'FAIL')
        self.assertEqual(critical, ['foreign body'])

    def test_claimed_live_answer_needs_successful_provider_evidence(self):
        status, _, _ = evaluator.grade({}, {'answer': 'hello', 'outcome': {'liveModelAnswer': True}}, [], 200, [])
        self.assertEqual(status, 'UNTESTED')

    def test_blocked_inference_never_passes(self):
        status, _, _ = evaluator.grade({}, {'answer': 'plausible answer'}, [{'type': 'provider_blocked'}], 200, [])
        self.assertEqual(status, 'UNTESTED')

    def test_approved_body_must_be_complete(self):
        status, _, _ = evaluator.grade({'expected_body': 'Complete approved template.'}, {'answer': 'Complete approved'}, [], 200, [])
        self.assertEqual(status, 'FAIL')
