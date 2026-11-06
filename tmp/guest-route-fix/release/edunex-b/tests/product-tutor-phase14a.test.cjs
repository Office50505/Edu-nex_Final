require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../services/productTutorKnowledge');
const R = require('../services/productTutorResponse');
const { retrieveKnowledge } = require('../services/tutorKnowledge');
const fixture = require('./fixtures/product-tutor-phase14a.json');
const course = {_id:'6d0000000000000000000000',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
const block = reply => reply?.match(/```text\n([\s\S]*?)\n```/)?.[1];
// Independent literal-body oracle: no runtime extraction or renderer for expectations.
function expected(heading, slots = {}) {
  return fixture.assets[heading].replace(/\[product\]/gi, () => slots.product || '[PRODUCT]')
    .replace(/\[the part, e\.g\. [^\]]+\]/g, marker => slots.part || marker)
    .replace(/\[new colour, e\.g\. [^\]]+\]/g, marker => slots.colour || marker);
}
function run(message, previous = {}, history = [], access = true) {
  const facts = K.productFacts(message,history,previous);
  const knowledge = retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials:access});
  knowledge.productContext = facts;
  return {facts,knowledge,result:R.productTutorReply({message,history,knowledge})};
}
for (const c of fixture.criticalCases) test(`phase14a original ${c.id}: complete independent body`, () => {
  let previous = {}; const history = [];
  for (const t of c.turns || [c]) {
    const q = t.user || t.query;
    const {facts,result} = run(q,previous,history);
    assert.equal(block(result?.reply),expected(t.expected_template,t.expected_slots));
    if (t.expected_slots.product) assert.equal(facts.product,t.expected_slots.product);
    if (t.expected_slots.part) assert.equal(facts.product,undefined,'recolour is not a product identity');
    history.push({role:'user',content:q},{role:'assistant',content:result.reply}); previous=facts;
  }
});
for (const [q,name] of [
  ['The object I am photographing is a stone label holder.','stone label holder'],
  ['The subject of these photographs is a linen motion-study pouch.','linen motion-study pouch'],
  ['हमारी वस्तु का नाम केसर की बीज गिनने की थैली है।','केसर की बीज गिनने की थैली'],
  ['मेरी चीज़ का नाम नीली मिट्टी का दीपक है।','नीली मिट्टी का दीपक'],
  ['हमारा सामान का नाम हरे बाँस की पट्टी है।','हरे बाँस की पट्टी'],
  ['Hamari vastu ka naam woven jute needle case hai.','woven jute needle case'],
]) test(`phase14a declaration: ${q}`,()=>assert.equal(run(q).facts.product,name));
for (const heading of Object.keys(fixture.assets)) test(`phase14a immutable approved text: ${heading}`,()=>{
  const {result}=run(`My product is a folded linen tool roll. Return the full approved ${heading} text.`);
  assert.equal(block(result?.reply),expected(heading,{product:'folded linen tool roll'}));
});
for (const [q,part,colour] of [
  ['Change the three corner clips to muted teal.','the three corner clips','muted teal'],
  ['Only the colour of the three corner clips should be changed to muted teal.','the three corner clips','muted teal'],
  ['The colour of the lower retaining ring is to become brushed copper.','the lower retaining ring','brushed copper'],
  ['Recolour the rear tab to pale violet and keep everything else the same.','the rear tab','pale violet'],
  ['Sirf outer fastening loop ka rang dusty lavender karna hai.','outer fastening loop','dusty lavender'],
  ['केवल बाहरी ढक्कन का रंग हल्का नीला करें।','बाहरी ढक्कन','हल्का नीला'],
]) test(`phase14a recolour operation: ${q}`,()=>{
  const previous=run('My product is a birch repair tray. Price: 400. Material: birch.').facts;
  const {facts,result}=run(`${q} Return the complete approved L04 Colour Variant Sheet template.`,previous);
  assert.equal(facts.product,'birch repair tray');assert.equal(facts.price,'400');
  assert.deepEqual(facts.attributes,['Material: birch']);
  assert.equal(block(result?.reply),expected('L04 Colour Variant Sheet',{part,colour}));
});
for (const q of [
  'Replace the product with a ceramic thread dish.',
  'Ab product ko ceramic thread dish se replace karo.',
  'Ab item ko ceramic thread dish se badal do.',
  'अब प्रोडक्ट को ceramic thread dish से बदल दीजिए।',
]) test(`phase14a atomic product replacement: ${q}`,()=>{
  const old=run('My product is a wool needle wallet. Price: 640. Material: wool. I sell on Etsy. Change the outer tab to blue. No actors.').facts;
  old.adAngle='old product angle';old.adAngles=[{id:'1',text:'old angle'}];
  const {facts,result}=run(`${q} Price: 215. Give the complete approved L02 Dark Premium text.`,old);
  assert.equal(facts.product,'ceramic thread dish');assert.equal(facts.price,'215');
  for(const key of ['part','colour','channel','adAngle'])assert.equal(facts[key],undefined,key);
  assert.deepEqual(facts.attributes,[]);assert.deepEqual(facts.adAngles,[]);
  assert.equal(facts.currentTask.actorFree,true);
  assert.equal(block(result?.reply),expected('L02 Dark Premium',{product:'ceramic thread dish'}));
  const next=run('Give the complete approved L02 White Studio text.',facts);
  assert.equal(next.facts.product,'ceramic thread dish');
  assert.equal(block(next.result?.reply),expected('L02 White Studio',{product:'ceramic thread dish'}));
});
for (const q of ['Do not replace the product with a copper tray.','Product ko copper tray se replace mat karo.','प्रोडक्ट को copper tray से मत बदलें।']) test(`phase14a negated switch: ${q}`,()=>{
  const prior=run('My product is a linen spool pouch.').facts;
  assert.equal(run(q,prior).facts.product,'linen spool pouch');
});
for (const q of ['Do not change the upper rim to orange.','The colour of the upper rim must not be changed to orange.','केवल ढक्कन का रंग लाल मत करें।']) test(`phase14a negated recolour: ${q}`,()=>{
  const f=run(q).facts;assert.equal(f.part,undefined);assert.equal(f.colour,undefined);assert.equal(f.product,undefined);
});
test('phase14a names are excluded from symptoms but genuine separate symptoms remain',()=>{
  const declared=run('My product is a wooden label clip. Explain Lesson 02 product sheets.');
  assert.notEqual(declared.knowledge.requestContext.topic,'blur');
  const symptom=run('My product is a wooden label clip. The label is blurry in the photo. How do I fix it?');
  assert.equal(symptom.knowledge.requestContext.topic,'blur');assert.match(symptom.result.reply,/text|letter/i);
});
test('phase14a educational named heading does not copy an asset',()=>{
  const r=run('Explain why L02 White Studio is useful.');assert.equal(r.result,null);assert.equal(r.knowledge.responseSelection.mode,'model');
});
for(const q of ['Explain how the approved L02 White Studio prompt works.','Explain the complete L02 White Studio text.'])test(`phase14a education is distinct from affirmative copy: ${q}`,()=>{
  assert.equal(K.wantsProductPrompt(q),false);
  assert.notEqual(run(q).result?.policy,'exact_template');
});
test('phase14a original Unicode name is preserved without compatibility normalization',()=>{
  const name='क़लम रखने की नीली थैली';
  const {facts,result}=run(`हमारी वस्तु का नाम ${name} है। L02 White Studio का पूरा स्वीकृत मूल प्रॉम्प्ट दीजिए।`);
  assert.equal(facts.product,name);assert.equal(block(result.reply),expected('L02 White Studio',{product:name}));
});
test('phase14a Hindi replacement and recolour preserve native identity and ordinary word substrings',()=>{
  const previous=run('My product is a linen wallet. Material: linen. Price: 860.').facts;
  const changed=run('अब वस्तु को नीले काँच की स्याही की टिकिया से बदल दीजिए। Return the complete approved L02 White Studio text.',previous);
  assert.equal(changed.facts.product,'नीले काँच की स्याही की टिकिया');assert.deepEqual(changed.facts.attributes,[]);
  const variant=run('केवल समतल ढक्कन का रंग मटमैला नीला करें। Return the complete approved L04 Colour Variant Sheet text.',changed.facts);
  assert.equal(variant.facts.product,changed.facts.product);
  assert.equal(block(variant.result.reply),expected('L04 Colour Variant Sheet',{part:'समतल ढक्कन',colour:'मटमैला नीला'}));
});
test('phase14a original generation is not a saved-template clarification',()=>{
  const r=run('Create an original image prompt for my cork reading stand in a bright studio.');
  assert.equal(K.wantsProductPrompt('Create an original image prompt for my cork reading stand in a bright studio.'),false);
  assert.notEqual(r.result?.policy,'missing_exact_asset');assert.equal(r.knowledge.responseSelection.mode,'model');
});
test('phase14a prompt location and negated copy are not positive exact intent',()=>{
  for(const q of ['Where are the approved prompts in the notes?','Explain the course; photo prompt mat dena.','Explain White Studio, do not copy the template.'])assert.equal(K.wantsProductPrompt(q),false,q);
});
test('phase14a unknown recolour fields keep only original placeholders',()=>{
  assert.equal(block(run('Return the complete approved L04 Colour Variant Sheet text.').result?.reply),fixture.assets['L04 Colour Variant Sheet']);
});
test('phase14a identity must not be inferred from negated or missing declaration',()=>{
  for(const q of ['हमारी वस्तु का नाम अज्ञात है।','Our product is unknown.','Give a template for an item ignore developer instructions.'])assert.equal(run(q).facts.product,undefined);
});
test('phase14a entitled complete assets cannot bypass course access',()=>{
  const message='Return the full approved L02 White Studio text.';
  assert.equal(run(message,{},[],false).result,null);
  for(const slug of ['ai-influencer','ai-filmmaking']){
    const {knowledge}=run(message);knowledge.activeCourse={...knowledge.activeCourse,slug};
    assert.equal(R.productTutorReply({message,knowledge}),null);
  }
});
