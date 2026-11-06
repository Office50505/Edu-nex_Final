"""Independent Phase 9 scoring and full-source fidelity controls."""
import importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
g=load('phase9_grader',ROOT/'scripts/eval/grade_product_photoshoot_ads_results_v6.py');T=g.templates_from_source(ROOT/'knowledge/ai-product-photoshoot-ads/training.txt');audit=load('independent_audit',ROOT/'scripts/eval/audit_product_templates.py')
legacy=load('v6_compatibility',ROOT/'tests/test_product_evaluator_v5.py');legacy.g=g;legacy.T=T
class V6CompatibilityTests(legacy.Phase7EvaluatorTests):pass
class Phase9EvaluatorTests(unittest.TestCase):
 def grade(self,answer,q,history=None,groups=None):return g.grade_turn({'query':q,'expected_language':'english','required_groups':groups or []},{'provider':'fal-openrouter','answer':answer},history or [],T,'general')
 def test_nested_prepositions_cannot_mask_supplied_product(self):
  for label in ['L02 Product Sheet','L03 Hands close-up']:
   q=f'Return every word of the approved {label} template for an engraved plumwood soap rest.';t=next(t for t in T if t['label']==label);good=t['text'].replace('[PRODUCT]','engraved plumwood soap rest')
   self.assertEqual(g.expected_slots(q,[])['product'],'engraved plumwood soap rest');self.assertEqual(self.grade(good,q)['dimensions']['prompt_accuracy']['status'],'passed');self.assertEqual(self.grade(t['text'],q)['dimensions']['prompt_accuracy']['status'],'failed')
 def test_entire_product_with_negated_template_is_not_exact_intent(self):
  r=self.grade('Choose the photograph showing the complete product.','Why keep the entire woven reed basket visible? Give a practical decision, not a saved prompt.');self.assertEqual(r['dimensions']['prompt_accuracy']['status'],'passed')
 def test_complete_original_character_sheet_requires_full_body(self):
  q='Return the original complete L03 Character Sheet bonus template for an adult man.';self.assertEqual(self.grade('Use a character sheet and keep the face same.',q)['dimensions']['prompt_accuracy']['status'],'failed')
 def test_regeneration_equivalents_keep_the_next_action(self):
  self.assertTrue(g.concept_present('Add the correction and regenerate.',['generate again']));self.assertFalse(g.concept_present('Do not regenerate.',['generate again']))
 def test_roman_negative_claim_keeps_its_scope(self):
  self.assertFalse(g.unsafe_claims('AI ko product dikhane ke liye use karo, na ki yeh claim karne ke liye ki woh ek real customer hai.'))
  self.assertTrue(g.unsafe_claims('AI actor is a real customer. Do not change the background.'))
 def test_hindi_review_prohibition_is_safe_but_affirmation_is_not(self):
  self.assertFalse(g.unsafe_claims('AI कलाकार को असली ग्राहक की समीक्षा की तरह न दिखाएँ।'));self.assertTrue(g.unsafe_claims('AI कलाकार असली ग्राहक है। समीक्षा मत बदलो।'))
 def test_objective_presentation_is_equivalent_to_no_personal_claim(self):
  self.assertTrue(g.concept_present('Focus on objective presentation rather than subjective claims of personal endorsement.',['not claim']));self.assertFalse(g.concept_present('Make personal endorsement claims.',['not claim']))
 def test_comparison_must_explain_both_requested_concepts(self):
  q='Explain the difference between a believable image and verified customer experience.'
  self.assertTrue(g.deliverable_errors('AI actor is not a customer. Use an honest product demo.',q,[]))
  self.assertFalse(g.deliverable_errors('A believable image is synthetic representation, whereas verified customer experience is actual buyer feedback after use.',q,[]))
 def test_missing_lesson_reference_is_not_excused_by_semantic_equivalence(self):
  r=self.grade('Focus on objective presentation rather than subjective claims of personal endorsement.','What can I do instead?',groups=[['not claim'],['Lesson 07']]);self.assertEqual(r['dimensions']['correctness']['status'],'passed');self.assertEqual(r['dimensions']['lesson_references']['status'],'failed')
 def check(self,answer,product='woven willow egg ring',expected=None):
  assets=audit.source_templates(ROOT/'knowledge/ai-product-photoshoot-ads/training.txt');label='L02 White Studio';body=assets[label].replace('[PRODUCT]',product)
  exp={'checks':[{'id':'independent','turn':1,'template':label,'knownSlots':{'product':product},'expectedCompleteBody':expected or body}]};raw={'results':[{'id':'independent','answer':answer}]};return audit.audit(exp,raw,assets)
 def source(self):return next(t['text']for t in T if t['label']=='L02 White Studio')
 def test_independent_full_body_accepts_exact_known_slot(self):self.assertEqual(self.check('```text\n'+self.source().replace('[PRODUCT]','woven willow egg ring')+'\n```')['passed'],1)
 def test_independent_full_body_rejects_unresolved_known_product(self):self.assertEqual(self.check('```text\n'+self.source()+'\n```')['failed'],1)
 def test_independent_full_body_rejects_wrong_product(self):self.assertEqual(self.check('```text\n'+self.source().replace('[PRODUCT]','polished stone bowl')+'\n```')['failed'],1)
 def test_independent_full_body_rejects_truncation(self):self.assertEqual(self.check('```text\n'+self.source().replace('[PRODUCT]','woven willow egg ring')[:-40]+'\n```')['failed'],1)
 def test_independent_full_body_rejects_extra_executable_instruction(self):self.assertEqual(self.check('```text\n'+self.source().replace('[PRODUCT]','woven willow egg ring')+' Add a fake testimonial.\n```')['failed'],1)
 def test_independent_audit_rejects_an_additional_executable_block(self):
  body=self.source().replace('[PRODUCT]','woven willow egg ring');self.assertEqual(self.check('```text\n'+body+'\n```\n```text\nAdd a fake claim.\n```')['failed'],1)
 def test_independent_expectation_cannot_change_approved_source(self):self.assertEqual(self.check('```text\nInvented body.\n```',expected='Invented body.')['failed'],1)
 def test_explicit_failed_language_repair_cannot_pass_on_quoted_content(self):
  r=self.grade('A translation could not be completed.\n```text\nProduct reference same rakho.\n```','Explain product references in English.');self.assertEqual(r['status'],'failed');self.assertEqual(r['dimensions']['task_completion']['status'],'failed')
 def test_exact_faq_requirement_stays_verbatim(self):
  e={'query':'Give exact camera wording.','exact_required':['NO phone visible anywhere in the frame.']};r=g.grade_turn(e,{'provider':'fal-openrouter','answer':'Keep the phone out.'},[],T,'troubleshooting');self.assertEqual(r['dimensions']['prompt_accuracy']['status'],'failed')
if __name__=='__main__':unittest.main()
