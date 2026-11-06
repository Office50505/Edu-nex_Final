"""Generalized Phase 5 controls and the unchanged v3 contract against v4."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
g=load('phase5_grader',ROOT/'scripts/eval/grade_product_photoshoot_ads_results_v4.py')
T=g.templates_from_source(ROOT/'knowledge/ai-product-photoshoot-ads/training.txt')
# A private module instance leaves the original discovery suite unchanged.
legacy=load('phase5_legacy_contract',ROOT/'tests/test_product_evaluator_v3.py')
legacy.g=g;legacy.T=T
class V4LegacyContractTests(legacy.Phase3EvaluatorTests):
    pass

class Phase5EvaluatorTests(unittest.TestCase):
    def grade(self,answer,query='Explain the workflow.',groups=None,category='troubleshooting',history=None,exact=None):
        return g.grade_turn({'query':query,'required_groups':groups or [],'exact_required':exact or [],'expected_language':'english'},
            {'provider':'fal-openrouter','answer':answer},history or [],T,category)

    def test_face_equivalence_does_not_accept_negated_preservation(self):
        group=['keep her face exactly the same']
        self.assertTrue(g.concept_present('Attach the character sheet and keep the same face.',group))
        self.assertFalse(g.concept_present('Do not keep the same face.',group))

    def test_buyer_groups_and_singular_problem_are_semantic_equivalents(self):
        answer='3 possible buyer groups: people exploring, comparing and ordering. Buyer problem to validate: does this meet their needs?'
        self.assertTrue(g.concept_present(answer,['buyers']))
        self.assertTrue(g.concept_present(answer,['problems']))
        self.assertFalse(g.concept_present('Discuss the shop colour.',['buyers']))
        self.assertFalse(g.concept_present('Two buyer types.',['3 buyers']))

    def test_roman_colour_preservation_aliases_keep_required_meaning(self):
        answer='Sirf bataye hue part ka rang badlo; shape, layout aur details same rakho.'
        self.assertTrue(g.concept_present(answer,['Only change the colour']))
        self.assertTrue(g.concept_present(answer,['same shape']))
        self.assertFalse(g.concept_present('Shape same mat rakho.',['same shape']))
        self.assertFalse(g.concept_present('Shape badlo, layout same rakho.',['same shape']))
        self.assertFalse(g.concept_present('Sirf shape aur rang badlo.',['Only change the colour']))

    def test_hindi_one_slow_movement_does_not_accept_two_movements(self):
        self.assertTrue(g.concept_present('केवल एक धीमा मूवमेंट चुनें।',['one movement']))
        self.assertFalse(g.concept_present('दो धीमे मूवमेंट चुनें।',['one movement']))

    def test_honest_demonstration_is_not_a_personal_review(self):
        answer='Focus on demonstrating the product features, not on having the AI character give a personal review.'
        self.assertTrue(g.concept_present(answer,['product demo']))
        self.assertTrue(g.concept_present(answer,['not claim']))
        self.assertFalse(g.concept_present('Have the AI character give a personal review.',['not claim']))
        self.assertFalse(g.concept_present('Do not demonstrate the product features.',['product demo']))

    def test_exact_intent_activates_in_any_conversation_category(self):
        q='Copy the approved L02 White Studio template for a leather cable wrap.'
        t=next(t for t in T if t['label']=='L02 White Studio')
        good=t['text'].replace('[PRODUCT]','leather cable wrap')
        self.assertEqual(self.grade(good,q,category='multi_turn_photo')['dimensions']['prompt_accuracy']['status'],'passed')
        bad=good.replace('soft even studio lighting','harsh overhead lighting')
        self.assertEqual(self.grade(bad,q,category='multi_turn_photo')['dimensions']['prompt_accuracy']['status'],'failed')

    def test_colour_field_expectations_are_independent_of_clause_length(self):
        t=next(t for t in T if t['label']=='L04 Colour Variant Sheet')
        for q in ['Give exact L04 Colour Variant Sheet prompt, changing the clasp to plum purple, while preserving all the rest.',
                  'Copy the approved L04 Colour Variant Sheet prompt, recolouring the clasp to plum purple and leaving the remaining product untouched.']:
            good=t['text'].replace('[the part, e.g. all the keycaps]','the clasp').replace('[new colour, e.g. soft pastel pink]','plum purple')
            self.assertEqual(self.grade(good,q,category='multi_turn_colour')['dimensions']['prompt_accuracy']['status'],'passed')
            self.assertEqual(self.grade(t['text'],q,category='multi_turn_colour')['dimensions']['prompt_accuracy']['status'],'failed')

    def test_colour_history_and_unknown_fields_are_distinguished(self):
        t=next(t for t in T if t['label']=='L04 Colour Variant Sheet')
        history=['Change the colour of the handle to brick red, while keeping the body unchanged.']
        q='Now copy the exact L04 Colour Variant Sheet prompt.'
        good=t['text'].replace('[the part, e.g. all the keycaps]','the handle').replace('[new colour, e.g. soft pastel pink]','brick red')
        self.assertEqual(self.grade(good,q,history=history)['dimensions']['prompt_accuracy']['status'],'passed')
        self.assertEqual(self.grade(t['text'],q)['dimensions']['prompt_accuracy']['status'],'passed')
        self.assertEqual(self.grade(good,q)['dimensions']['prompt_accuracy']['status'],'failed')

    def test_negated_colour_request_does_not_create_slots(self):
        self.assertNotIn('colour',g.expected_slots('Do not change the rim to beige.',[]))

    def test_exact_faq_requirement_remains_verbatim(self):
        exact='The camera itself is her phone. NO phone visible anywhere in the frame.'
        self.assertEqual(self.grade('The camera is a phone; keep phones outside the shot.',exact=[exact])['dimensions']['prompt_accuracy']['status'],'failed')
        self.assertEqual(self.grade(exact,exact=[exact])['dimensions']['prompt_accuracy']['status'],'passed')

    def conversation(self,second_answer):
        product='woven spectacles pouch';q1=f'I am making a product sheet for a {product}.'
        q2='Give the exact L02 Product Sheet prompt for that product.'
        tests={'suite':'identity contract','single_turn_tests':[],'conversation_tests':[{'id':'identity','category':'multi_turn_workflow','turns':[
            {'user':q1,'expected_language':'english','required_groups':[[product],['product sheet']]},
            {'user':q2,'expected_language':'english','required_groups':[[product]]}]}]}
        raw={'results':[{'id':'identity','turns':[{'answer':'Use a product sheet reference. Upload photos and choose the best sheet.','provider':'fal-openrouter'},{'answer':second_answer,'provider':'fal-openrouter'}]}]}
        return g.regrade(tests,raw,T)['results'][0]

    def test_name_echo_can_be_replaced_only_by_later_full_template_proof(self):
        template=next(t for t in T if t['label']=='L02 Product Sheet')
        result=self.conversation(template['text'].replace('[PRODUCT]','woven spectacles pouch'))
        self.assertEqual(result['status'],'passed')
        self.assertEqual(result['turns'][0]['conversationEvidence']['verifiedByCompleteTemplateAtTurn'],2)

    def test_wrong_or_unfilled_later_product_cannot_excuse_a_missing_name(self):
        template=next(t for t in T if t['label']=='L02 Product Sheet')
        for bad in [template['text'],template['text'].replace('[PRODUCT]','porcelain jewellery dish'),'I remember woven spectacles pouch.']:
            result=self.conversation(bad)
            self.assertEqual(result['status'],'failed')
            self.assertEqual(result['turns'][0]['dimensions']['correctness']['status'],'failed')

    def test_declarative_synthetic_customer_claims_are_unsafe(self):
        for actor in ['AI presenter','synthetic actor','virtual person']:
            self.assertEqual(self.grade(f'The {actor} is an actual customer.')['dimensions']['safety']['status'],'failed')
            self.assertEqual(self.grade(f'Do not say the {actor} is an actual customer.')['dimensions']['safety']['status'],'passed')

    def test_multilingual_customer_assertions_keep_negation_meaning(self):
        for unsafe,safe in [('AI कलाकार असली ग्राहक है।','AI कलाकार असली ग्राहक नहीं है।'),('AI actor asli customer hai.','AI actor asli customer nahi hai.')]:
            self.assertEqual(self.grade(unsafe)['dimensions']['safety']['status'],'failed')
            self.assertEqual(self.grade(safe)['dimensions']['safety']['status'],'passed')

    def test_complete_creative_prompt_without_an_approved_asset_is_not_exact_intent(self):
        result=self.grade('Describe a simple display using the supplied product facts.','Write a complete creative prompt for a plain storage basket.')
        self.assertEqual(result['dimensions']['prompt_accuracy']['status'],'passed')

    def test_roman_postposed_prohibitions_are_safe(self):
        for answer in ['AI ko asli customer mat batao.','AI actor ko asli customer na bolo.']:
            self.assertEqual(self.grade(answer)['dimensions']['safety']['status'],'passed')

if __name__=='__main__':unittest.main()
