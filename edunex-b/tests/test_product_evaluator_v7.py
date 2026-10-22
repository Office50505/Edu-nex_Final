"""Phase 11 independent evaluator controls with novel examples and strict negative cases."""
import unittest,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
g=load('phase11_v7',ROOT/'scripts/eval/grade_product_photoshoot_ads_results_v7.py');T=g.templates_from_source(ROOT/'knowledge/ai-product-photoshoot-ads/training.txt')
class Phase11EvaluatorTests(unittest.TestCase):
 def grade(self,q,a,**extra):return g.grade_turn({'query':q,'expected_language':'english',**extra},{'provider':'fal-openrouter','answer':a},[],T,'general')
 def test_independent_declared_slot_rejects_unknown_declaration_body(self):
  label='L02 White Studio';body=next(t['text']for t in T if t['label']==label);q='Return the complete approved L02 White Studio template.'
  for product in ['ribbed borosilicate tuning jar','wicker kalimba shuttle']:
   e={'expected_slots':{'product':product}}
   self.assertEqual(self.grade(q,'```text\n'+body+'\n```',**e)['dimensions']['prompt_accuracy']['status'],'failed')
 def test_unresolved_known_slot_is_not_excused_by_a_commentary_name(self):
  body=next(t['text']for t in T if t['label']=='L06 Arc');q='Return the original L06 Arc template for an alder music peg.'
  r=self.grade(q,'alder music peg\n```text\n'+body+'\n```',expected_slots={'product':'alder music peg'});self.assertEqual(r['dimensions']['prompt_accuracy']['status'],'failed')
 def test_explicit_product_replacement_is_not_stale(self):
  slots=g.expected_slots('Replace the product with a willow reed rack.',['My product is a stone tuning tray.']);self.assertEqual(slots['product'],'willow reed rack')
 def test_descriptive_hindi_case_particles_are_equivalent_only_in_concepts(self):
  self.assertTrue(g.concept_present('अपने मुलायम हरे रंग के कपड़े पाउच को देखें।',['मुलायम हरे रंग का कपड़े पाउच']))
  self.assertFalse(g.concept_present('हरे पाउच को देखें।',['मुलायम हरे रंग का कपड़े पाउच']))
 def test_numbered_eight_lesson_map_counts_but_prices_do_not(self):
  self.assertTrue(g.concept_present('8 lessons: 01 Course Intro; 02 Photos; 08 Finale.',['Lesson 08']))
  self.assertFalse(g.concept_present('The price is 08 rupees.',['Lesson 08']))
 def test_short_hinglish_wrapper_and_approved_english_quote(self):
  for text in ['Course FAQ ka yeh instruction daalo: “The camera itself is her phone.”','“normal home room” instruction use karo.']:
   self.assertFalse(g.grade_language(text,'hinglish'))
  self.assertTrue(g.grade_language('Here is the requested instruction.','hinglish'))
 def test_approved_faq_remains_exact(self):
  e={'exact_required':['The camera itself is her phone. NO phone visible anywhere in the frame.']}
  self.assertEqual(self.grade('Give the exact camera correction.','The camera is your phone.',**e)['dimensions']['prompt_accuracy']['status'],'failed')
 def test_hook_count_accepts_qualifiers_and_rejects_excess(self):
  q='My product is a wool oboe sleeve. Write two distinct name-only hooks.'
  good='Hooks\n1. Meet wool oboe sleeve.\n2. See wool oboe sleeve.'
  self.assertFalse(g.deliverable_errors(good,q,[]));self.assertTrue(g.deliverable_errors(good+'\n3. Another hook.',q,[]))
 def test_hinglish_likh_do_is_a_deliverable_not_permission_to_defer(self):
  q='Mera item rattan cello clamp hai. Do hooks aur caption likh do.'
  errors=g.deliverable_errors('Pehle buyers batao, phir main help kar sakta hoon.',q,[]);self.assertTrue(errors)
 def test_demo_can_use_shot_headings_and_spoken_lines(self):
  q='Show three shots and spoken lines for a reed flute mount.'
  a='Shot 1: Show the reed flute mount.\nSpoken Line: Here is the mount.\nShot 2: Move closer.\nSpoken Line: See its details.\nShot 3: Show another angle.\nSpoken Line: View before ordering.'
  self.assertFalse(g.deliverable_errors(a,q,[]))
 def test_visual_only_demonstration_does_not_require_unrequested_dialogue(self):
  q='Give a concrete demonstration for a reed flute mount: two visible actions, no voice.'
  self.assertFalse(g.deliverable_errors('1. Show the reed flute mount.\n2. Move to another view.',q,[]))
 def test_unsafe_claims_cannot_hide_behind_an_unrelated_negative(self):
  self.assertTrue(g.unsafe_claims('No background music. The AI actor is a genuine customer.'))
  self.assertFalse(g.unsafe_claims('Do not present the AI actor as a genuine customer.'))
 def test_unknown_ad_accessories_and_benefits_are_failed(self):
  q='My product is a softwood bow latch. Write a caption.'
  for a in ['Caption: Includes a padded case and four replacement bows.','Caption: Gives you unmatched vibration control.','Caption: Yeh compact aur super convenient hai.','कैप्शन: यह आरामदायक और बेहतरीन है।']:
   self.assertTrue(g.grounding_errors(a,q,[]),a)
 def test_supplied_feature_can_be_used_but_negative_request_is_not_evidence(self):
  q='My product is a cotton reed mitten. Features: waterproof. Write a caption.'
  self.assertFalse(g.grounding_errors('Caption: cotton reed mitten is waterproof.',q,[]))
  self.assertTrue(g.grounding_errors('Caption: cotton reed mitten is waterproof.','My product is a cotton reed mitten. Do not invent waterproof claims. Write a caption.',[]))
 def test_refusal_without_requested_actual_alternative_is_incomplete(self):
  q='Give a safe alternative line instead of a fabricated customer review.'
  self.assertTrue(g.completion_review('Never invent customer reviews.',q,[]))
  self.assertFalse(g.completion_review('Example line: Here is our product. View its supplied details.',q,[]))
 def test_from_start_product_workflow_needs_executable_steps(self):
  q='My product photos vary. Tell me what to do from the beginning.'
  self.assertTrue(g.completion_review('Make a sheet and reuse it.',q,[]))
  self.assertFalse(g.completion_review('Take phone photos, upload them to make a sheet, review and save it.',q,[]))
 def test_neutral_invitation_does_not_claim_an_unprovided_feature(self):
  self.assertFalse(g.grounding_errors('Caption: Looking for ashwood reed comb? See the details before you decide.','My product is an ashwood reed comb. Write a caption.',[]))
 def test_contextual_reference_can_omit_number_but_cannot_cite_wrong_lesson(self):
  self.assertEqual(self.grade('In this same lesson give the natural-look fix.','Lesson 06: Use a normal home room.',expected_lesson_context=7)['dimensions']['lesson_references']['status'],'failed')
  self.assertEqual(self.grade('In this same lesson give the natural-look fix.','Use a normal home room.',expected_lesson_context=7)['dimensions']['lesson_references']['status'],'passed')
 def test_fallback_is_not_model_success(self):
  r=g.grade_turn({'query':'Give a caption.'},{'provider':'built-in-course-guide','answer':'Saved guide','outcome':{'type':'provider_fallback','liveModelAnswer':False}},[],T,'general','end_to_end');self.assertEqual(r['status'],'provider_fallback')
 def test_numeric_and_template_standards_are_not_softened(self):
  self.assertFalse(g.concept_present('8 seconds',['6']));self.assertFalse(g.concept_present('16:9',['9:16']))
  q='Return the complete L02 Product Sheet template for a cork reed comb.';self.assertEqual(self.grade(q,'Keep it unchanged. Front and side views.')['status'],'failed')
if __name__=='__main__':unittest.main()
