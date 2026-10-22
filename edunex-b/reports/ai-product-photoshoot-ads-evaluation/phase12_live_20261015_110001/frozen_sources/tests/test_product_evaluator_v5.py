"""Phase 7 independent multilingual, safety and deliverable contracts."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
g=load('phase7_grader',ROOT/'scripts/eval/grade_product_photoshoot_ads_results_v5.py');T=g.templates_from_source(ROOT/'knowledge/ai-product-photoshoot-ads/training.txt')
legacy=load('phase7_v4_contract',ROOT/'tests/test_product_evaluator_v4.py');legacy.g=g;legacy.T=T
class V5CompatibilityTests(legacy.Phase5EvaluatorTests):pass
class Phase7EvaluatorTests(unittest.TestCase):
 def grade(self,answer,q='Explain honest UGC.',history=None,groups=None,language='english'):
  return g.grade_turn({'query':q,'required_groups':groups or [],'expected_language':language},{'provider':'fal-openrouter','answer':answer},history or [],T,'general')
 def test_hindi_combining_marks_are_part_of_product_identity(self):
  for q,name in [('मेरा प्रोडक्ट कांच की स्याही बोतल है।','कांच की स्याही बोतल'),('मेरे प्रोडक्ट का नाम पीतल का पत्ता है।','पीतल का पत्ता'),('मुझे सिर्फ नाम सूती चाय थैली पता है।','सूती चाय थैली')]:self.assertEqual(g.expected_slots(q,[])['product'],name)
 def test_roman_and_natural_name_declarations(self):
  for q,name in [('My product is called a carved wood paperweight.','carved wood paperweight'),('I only know the name woven willow tray.','woven willow tray'),('Mere product ka naam cork coaster hai.','cork coaster')]:self.assertEqual(g.expected_slots(q,[])['product'],name)
 def test_hindi_product_exact_template_must_be_complete_and_correct(self):
  history=['मेरा प्रोडक्ट मिट्टी की मेज घड़ी है।'];q='Copy the exact L02 White Studio prompt.';t=next(t for t in T if t['label']=='L02 White Studio')
  good=t['text'].replace('[PRODUCT]','मिट्टी की मेज घड़ी')
  self.assertEqual(self.grade(good,q,history)['dimensions']['prompt_accuracy']['status'],'passed')
  for bad in [t['text'],good.replace('मिट्टी की मेज घड़ी','लकड़ी की घड़ी'),good[:-40]]:self.assertEqual(self.grade(bad,q,history)['dimensions']['prompt_accuracy']['status'],'failed')
 def test_product_change_does_not_keep_old_colour_slots(self):
  slots=g.expected_slots('My product is called a reed coaster.',['My product is a metal lamp.','Change the base to red.']);self.assertEqual(slots,{'product':'reed coaster'})
 def test_referring_clip_does_not_replace_remembered_product(self):
  history=['मेरा प्रोडक्ट पीतल की घंटी है।','Explain the repair for that clip and keep anti-warping.']
  self.assertEqual(g.expected_slots('Copy the exact L06 Light Sweep prompt for that same item.',history).get('product'),'पीतल की घंटी')
 def test_unknown_and_personal_name_are_not_product_evidence(self):
  for q in ['My name is Mira.','My product is unknown.']:self.assertNotIn('product',g.expected_slots(q,[]))
 def test_direct_demonstrate_equivalent_and_negation(self):
  self.assertTrue(g.concept_present('Demonstrate the product or showcase its features.',['product demo']))
  self.assertFalse(g.concept_present('Do not demonstrate the product.',['product demo']))
 def test_course_no_after_lesson_label_is_contextual(self):
  q='Is this the AI Filmmaking course?'
  self.assertEqual(self.grade('Lesson 01\n\nNo, this is the AI Product Photoshoot & Ads course.',q,groups=[['not AI Filmmaking']])['status'],'passed')
  for bad in ['Lesson 01\n\nYes, this is AI Filmmaking. No fake claims.', 'Use the sheet. No, other advice.']:self.assertEqual(self.grade(bad,q,groups=[['not AI Filmmaking']])['status'],'failed')
 def test_review_object_negation_is_scoped(self):
  for a in ['AI actor ko asli customer review mat batao.','AI ko असली ग्राहक की समीक्षा मत बताओ।']:self.assertFalse(g.unsafe_claims(a))
  for a in ['AI actor asli customer hai aur review mat dikhao.','AI actor is a genuine customer. Do not invent benefits.']:self.assertTrue(g.unsafe_claims(a))
 def test_three_short_hooks_means_three_actual_hooks(self):
  q='My product is a reed basket. Write three short hooks.';good='Hooks\n1. Meet reed basket.\n2. View reed basket.\n3. See its details.'
  self.assertFalse(g.deliverable_errors(good,q,[]));self.assertTrue(g.deliverable_errors('Hooks\n1. Meet reed basket.',q,[]))
 def test_hindi_hook_quantity_is_not_default_five(self):
  q='मेरा प्रोडक्ट सूती कवर है। तीन छोटे हुक लिखिए।';good='Hooks\n1. सूती कवर देखिए।\n2. विवरण देखिए।\n3. पास से देखिए।'
  self.assertFalse(g.deliverable_errors(good,q,[]));self.assertTrue(g.deliverable_errors(good.rsplit('\n',1)[0],q,[]))
 def test_concrete_demo_requires_actions_and_spoken_example(self):
  q='My product is a cork bowl. Show a concrete honest product demo example.'
  self.assertTrue(g.deliverable_errors('Choose Ingredients, attach references and generate UGC.',q,[]))
  self.assertFalse(g.deliverable_errors('1. Show the cork bowl.\n2. Move to a close view.\nExample line: Here is the cork bowl.',q,[]))
 def test_informational_demo_does_not_require_script(self):self.assertFalse(g.deliverable_errors('It shows a product honestly.','What is an honest product demo?',[]))
 def test_indirect_request_requires_output_but_explanation_does_not(self):
  self.assertTrue(g.deliverable_errors('Please give me more facts.','I would like three short hooks for a jute pen pouch.',[]))
  self.assertFalse(g.deliverable_errors('Hooks are attention grabbing openings.','Could you explain what ad hooks mean?',[]))
 def test_demo_for_wrong_product_does_not_pass(self):
  answer='1. Show the lamp.\n2. Move to a close view.\nExample line: Meet the lamp.'
  self.assertTrue(g.deliverable_errors(answer,'Show a concrete honest demo example.',['My product is a jute pen pouch.']))
 def test_supplied_hindi_name_does_not_change_hinglish_narrative(self):
  q='Give an honest demo example in Hinglish.';h=['मेरा प्रोडक्ट मिट्टी की कलम थाली है।'];a='मिट्टी की कलम थाली ko dikhao. Yeh example hai.'
  self.assertEqual(self.grade(a,q,h,language='hinglish')['dimensions']['language']['status'],'passed')
  self.assertEqual(self.grade('अब इसे दिखाइए।',q,h,language='hinglish')['dimensions']['language']['status'],'failed')
  self.assertEqual(self.grade('Use मिट्टी की कलम थाली.',q,h,language='hindi')['dimensions']['language']['status'],'failed')
 def test_fallback_never_passes_quality_or_live_scope(self):
  result=g.grade_turn({'query':'Explain the course.'},{'provider':'built-in-course-guide','answer':'Saved guidance','outcome':{'type':'provider_fallback','liveModelAnswer':False}},[],T,'general','end_to_end');self.assertEqual(result['status'],'provider_fallback')
 def test_faq_exact_instruction_remains_strict(self):
  exact='The camera itself is her phone. NO phone visible anywhere in the frame.'
  e={'query':'Give exact camera clarification.','exact_required':[exact]};a={'provider':'fal-openrouter','answer':'Keep the phone off screen.'};self.assertEqual(g.grade_turn(e,a,[],T,'troubleshooting')['dimensions']['prompt_accuracy']['status'],'failed')
if __name__=='__main__':unittest.main()
