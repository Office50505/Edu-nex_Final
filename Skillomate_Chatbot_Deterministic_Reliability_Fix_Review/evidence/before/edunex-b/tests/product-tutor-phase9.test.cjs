require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {PRODUCT_RECORDS,PRODUCT_TEMPLATES,productSlots,productFacts,productRequestContext,wantsProductPrompt}=require('../services/productTutorKnowledge');
const {retrieveKnowledge}=require('../services/tutorKnowledge');
const {productTutorReply,validateProductReply,advertisingRisk,explanationLanguageMatches,tutorLanguage}=require('../services/productTutorResponse');
const {productResponseSelection}=require('../services/productTutorIntent');
const course={_id:'phase9',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
function run(message,history=[],saved={},includeMaterials=true){const facts=productFacts(message,history,saved);const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials});knowledge.productContext=facts;return {facts,knowledge,result:productTutorReply({message,history,knowledge})};}
const body=reply=>reply.match(/```text\n([\s\S]*?)\n```/)?.[1];
for(const product of ['etched walnut seal box','braided flax cup ring','blue porcelain incense boat'])for(const heading of ['L02 Product Sheet','L03 Hands close-up','L06 Arc'])test(`phase9 overlapping request phrases preserve ${product} in ${heading}`,()=>{
 const message=`Return every word of the approved ${heading} template for a ${product}.`;
 const {result}=run(message);assert.equal(productSlots(message).product,product);assert.equal(result.policy,'exact_template');assert.equal(body(result.reply),PRODUCT_TEMPLATES.find(t=>t.heading===heading).content.replace(/\[product\]/gi,product));
});
for(const person of ['man','woman'])test(`phase9 complete original character asset stays literal: ${person}`,()=>{
 const {result}=run(`Reproduce the original complete L03 Character Sheet bonus template for an adult ${person}.`);
 assert.equal(body(result.reply),PRODUCT_TEMPLATES.find(t=>t.heading.startsWith('L03 Character Sheet')).content.replace(/\[man\s*\/\s*woman\]/gi,person));
 assert.equal(productSlots(`Give the Character Sheet template for an adult ${person}.`).product,undefined);
});
test('phase9 validation restores the whole approved body rather than accepting a fragment',()=>{
 const message='Give the complete original L02 Dark Premium template for a glazed olive toothpick pot.';const {knowledge,result}=run(message);
 const changed=result.reply.replace('Keep the','Redesign the');const fixed=validateProductReply({message,knowledge,reply:changed});assert.equal(fixed.issue,'exact_template_repair');assert.equal(fixed.reply,result.reply);
});
test('phase9 unknown user facts stay unknown and denied materials stay restricted',()=>{
 const {result}=run('Return the complete approved L02 Product Sheet template.');assert.match(result.reply,/\[PRODUCT\]/);
 assert.equal(run('Return the full L02 White Studio template.',[],{},false).result,null);
});
for(const q of [
 'Explain the complete workflow from product photos through a final ad in Lesson 08.',
 'Give the Lesson 08 final workflow and tell me where course prompts are available.',
 'Which reference photo of a copper seed scoop should I keep and why? One crops the handle.',
 'Explain the difference between a believable image and verified customer experience in Hinglish.',
])test(`phase9 confidence policy delegates reasoning/compound requests: ${q}`,()=>{
 const {knowledge,result}=run(q);assert.equal(result,null);assert.equal(knowledge.responseSelection.mode,'model');
});
test('phase9 compound retrieval includes both final assembly and notes sources',()=>{
 const {knowledge}=run('Give the Lesson 08 final workflow and tell me where course prompts are available.');
 assert.ok(knowledge.records.some(r=>r.intentTags?.includes('final_assembly')));assert.ok(knowledge.records.some(r=>r.intentTags?.includes('prompt_location')));
});
test('phase9 whole journey retrieves grounded intermediate workflows',()=>{
 const {knowledge}=run('Explain the complete workflow from product photos through a final ad in Lesson 08.');
 for(const tag of ['product_sheet','ad_plan','video','ugc','final_assembly'])assert.ok(knowledge.records.some(r=>r.intentTags?.includes(tag)),tag);
});
for(const q of ['What are the Lesson 06 video settings?','Explain the Lesson 02 product sheet workflow.','My model has extra fingers in Lesson 03. Give the fix.'])test(`phase9 clear saved facts remain deterministic: ${q}`,()=>assert.ok(run(q).result));
for(const q of ['My UGC clip has a second phone that enters the shot. Give the exact camera clarification.','UGC mein mobile screen ke kone se nazar aa raha hai. Exact camera instruction batao.','UGC में मोबाइल नज़र आ रहा है। सटीक कैमरा निर्देश दीजिए।'])test(`phase9 phone framing variants retrieve complete FAQ: ${q}`,()=>{
 const {knowledge,result}=run(q);assert.equal(knowledge.requestContext.topic,'phone_visibility');assert.ok(result.reply.includes('The camera itself is her phone. NO phone visible anywhere in the frame.'));
});
test('phase9 exact settings select the settings workflow rather than arbitrary troubleshooting',()=>{
 const {knowledge,result}=run('Which exact Lesson 06 settings are recorded, and which reference images should I attach?');assert.equal(knowledge.requestContext.topic,'video');assert.match(result.reply,/Ingredients.*16:9.*Omni 1\.1 Flash.*720p.*6 sec/s);assert.doesNotMatch(result.reply,/Lesson 02/);
});
test('phase9 recall requires an actual past-facts request',()=>{
 const info=run('ChatGPT gave a generic ad for my carved chestnut stamp. Which product facts should I supply, and what should I tell it about adding features?');assert.notEqual(info.result?.policy,'conversation_product_facts');assert.match(info.result.reply,/price|features/i);
 const recall=run('What price and channel did I tell you?',[],{product:'carved chestnut stamp',price:'317',channel:'Etsy'});assert.match(recall.result.reply,/317.*Etsy/);
});
test('phase9 descriptive colour in a Hindi reasoning question is not a colour-change action',()=>{
 const {knowledge,result}=run('मेरे पास नारंगी रंग की लकड़ी की कटोरी है। तस्वीर में सजावट पीछे रखने का कारण हिंदी में समझाइए।');assert.notEqual(knowledge.requestContext.topic,'colour');assert.equal(result,null);
});
test('phase9 recolouring paraphrase survives a language replacement with the repair intact',()=>{
 const message='The shape becomes different when I recolour my ribbon spool. Give the course correction in English.';const {knowledge}=run(message);assert.equal(knowledge.requestContext.topic,'colour_shape');
 const fixed=validateProductReply({message,knowledge,reply:'Sirf rang badlo. Yeh fix hai, shape same rakho.'});assert.equal(fixed.issue,'response_language_mismatch');assert.match(fixed.reply,/Lesson 04/);assert.match(fixed.reply,/Only change the colour/);assert.match(fixed.reply,/keep everything else exactly the same/);
});
for(const safe of ['AI कलाकार को असली ग्राहक की समीक्षा की तरह न दिखाएँ।','AI ko sirf product dikhane ke liye use karo, na ki yeh claim karne ke liye ki woh ek real customer hai.','AI actor ko asli customer review mat batao.'])test(`phase9 actual prohibition stays safe: ${safe}`,()=>assert.equal(advertisingRisk(safe),null));
for(const unsafe of ['AI कलाकार असली ग्राहक है; समीक्षा मत बदलो।','No background music. The AI actor is a genuine customer.','AI actor asli customer hai aur review mat dikhao.'])test(`phase9 unrelated negation cannot excuse customer claim: ${unsafe}`,()=>assert.ok(advertisingRisk(unsafe)));
test('phase9 safe explanatory provider text is preserved',()=>{
 const message='Explain the difference between a believable product image and verified customer experience in Hinglish.';const {knowledge}=run(message);
 const reply='Believable image AI se banti hai, jabki verified customer experience actual buyer ke use aur feedback par based hai. AI ko sirf product dikhane ke liye use karo, na ki yeh claim karne ke liye ki woh ek real customer hai.';
 const checked=validateProductReply({message,knowledge,reply});assert.equal(checked.issue,null);assert.equal(checked.reply,reply);
});
test('phase9 ambiguous language validation asks for a bounded repair and retains original content on failure',()=>{
 const message='Explain why a clear reference matters for learners in English.';const {knowledge}=run(message);const reply='Reference mein product ka poora handle dikhao. Yeh choice clear hai.';const fixed=validateProductReply({message,knowledge,reply});
 assert.equal(fixed.repairRequest.kind,'language');assert.equal(fixed.repairRequest.originalAnswer,reply);assert.ok(fixed.reply.includes(reply));assert.match(fixed.reply,/translation could not be completed/i);
});
test('phase9 language state preserves minimal continuation without overriding a new question',()=>{
 const facts=productFacts('Lesson 06 की सेटिंग हिंदी में बताइए।');assert.equal(facts.language,'hindi');assert.equal(tutorLanguage('Again',[],facts),'hindi');assert.equal(tutorLanguage('Explain the video settings.',[],facts),'english');
});
test('phase9 known entity still survives language changes and product switches',()=>{
 const a=productFacts('My product is a hammered silver loom comb. Price is 1570. Material: metal.');const b=productFacts('My product is a wool shuttle pouch.',[],a);assert.equal(b.product,'wool shuttle pouch');assert.equal(b.price,undefined);assert.deepEqual(b.attributes,[]);
});
test('phase9 lessons, headings, IDs and other-course gates remain intact',()=>{
 assert.equal(PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').length,8);assert.equal(PRODUCT_TEMPLATES.length,19);assert.equal(new Set(PRODUCT_RECORDS.map(r=>r.chunkId)).size,PRODUCT_RECORDS.length);
 const message='Return a full approved L02 White Studio prompt.';for(const slug of ['ai-influencer','ai-filmmaking'])assert.equal(productTutorReply({message,knowledge:{...run(message).knowledge,activeCourse:{...course,slug}}}),null);
});

test('phase9 unmatched exact heading requests clarification instead of a workflow or model invention',()=>{
 const {result}=run('Return the complete approved L02 Underwater Shot template.');assert.equal(result.policy,'missing_exact_asset');assert.match(result.reply,/heading/i);assert.doesNotMatch(result.reply,/Ingredients|5–7/);
});
test('phase9 prior supplied attribute evidence survives omitted client history',()=>{
 const saved=productFacts('My product is a linen tool wrap. Features: waterproof.');
 const message='Explain these supplied product details in English.';const {knowledge}=run(message,[],saved);
 const fixed=validateProductReply({message,knowledge,reply:'The linen tool wrap is waterproof, according to the supplied facts.'});assert.equal(fixed.issue,null);
 const other=run(message,[],{product:'cotton ribbon box'});assert.equal(validateProductReply({message,knowledge:other.knowledge,reply:'It is waterproof.'}).issue,'unsupported_product_claim');
});
test('phase9 short continuation preserves a compound request for the model',()=>{
 const history=[{role:'user',content:'Explain the Lesson 08 final workflow and tell me where course prompts are available.'}];
 const {result,knowledge}=run('Again.',history);assert.equal(result,null);assert.equal(knowledge.responseSelection.mode,'model');
});

test('phase9 a negated saved-prompt request does not force literal output',()=>{
 const query='Which image of an entire stitched cotton tea sleeve should I keep and why? Give a concrete decision, not a saved prompt.';
 assert.equal(wantsProductPrompt(query),false);assert.equal(run(query).result,null);
 assert.equal(wantsProductPrompt('Do not use a summary; give the complete approved L02 Product Sheet prompt.'),true);
});

test('phase9 unrelated questions do not acquire a saved lesson while referring alternatives retain it',()=>{
 assert.equal(run('Who won the local election?',[],{lessonNumber:7,topic:'ugc'}).knowledge.requestContext.lessonNumber,null);
 const saved={lessonNumber:7,topic:'ugc'};const message='What alternative can I do instead?';const {knowledge}=run(message,[],saved);assert.equal(knowledge.requestContext.lessonNumber,7);const fixed=validateProductReply({message,knowledge,reply:'Use an honest product demonstration without personal claims.'});assert.match(fixed.reply,/Lesson 07/);
});
