import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('chatbot_eval', Path(__file__).resolve().parents[1] / 'chatbot_eval.py')
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)


class CartoonRuntimeTests(unittest.TestCase):
    def fixture(self):
        return dict(base_url='http://127.0.0.1:3128', fixture_only=True,
                    fixture_pack='ai-cartoon-series', real_course_metadata=False,
                    db_name='skillomate_mvp_eval_cartoon_fixture_1234567890_abcde123')

    def test_fixture_target_is_supported(self):
        self.assertTrue(evaluator.isolated_runtime(self.fixture()))

    def test_original_local_evaluator_remains_supported(self):
        self.assertTrue(evaluator.isolated_runtime(dict(base_url='http://127.0.0.1:3127',
                                                       db_name='skillomate_mvp_eval_lba_real_20261022')))

    def test_remote_or_unexpected_ports_are_rejected(self):
        for url in ['https://example.com', 'http://127.0.0.1:3000', 'http://0.0.0.0:3128',
                    'http://localhost:3128', 'http://127.0.0.1:3128.evil.com']:
            with self.subTest(url=url):
                self.assertFalse(evaluator.isolated_runtime({**self.fixture(), 'base_url': url}))

    def test_fixture_flags_are_required(self):
        for update in [dict(fixture_only=False), dict(fixture_pack='ai-local-business-ads'),
                       dict(real_course_metadata=True), dict(fixture_only='true')]:
            with self.subTest(update=update):
                self.assertFalse(evaluator.isolated_runtime({**self.fixture(), **update}))

    def test_other_database_names_are_rejected(self):
        for database in ['test', 'production', 'skillomate_mvp_eval_lba_real_20261022',
                         'skillomate_mvp_eval_cartoon_fixture_', 'skillomate_mvp_eval_cartoon_fixture_1_abcde123_extra']:
            with self.subTest(database=database):
                self.assertFalse(evaluator.isolated_runtime({**self.fixture(), 'db_name': database}))


if __name__ == '__main__':
    unittest.main()
