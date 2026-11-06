const test=require('node:test');
const assert=require('node:assert/strict');
const {PRODUCT_RECORDS,PRODUCT_TEMPLATES,productSlots,productFacts}=require('../services/productTutorKnowledge');
const {retrieveKnowledge}=require('../services/tutorKnowledge');
const {productTutorReply,validateProductReply,advertisingRisk,explanationLanguageMatches}=require('../services/productTutorResponse');
const course={_id:'phase5-product-course',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
function answer(message,history=[],productContext={}){
 const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:productContext,includeMaterials:true});
 knowledge.productContext=productContext;
 return {knowledge,result:productTutorReply({message,history,knowledge})};
}
const body=reply=>reply.match(/```text\n([\s\S]*?)\n```/)[1];
const colourSource=PRODUCT_TEMPLATES.find(t=>t.heading==='L04 Colour Variant Sheet').content;
for(const [part,colour] of [['the lid','burnt orange'],['all buckle tabs','slate grey'],['the ceramic base','sea green']]){
 for(const tail of [', while keeping the logo unchanged.',' and leaving the remaining details untouched.','; preserve the original layout.']){
  test(`phase5 complete colour slots stop at request clauses: ${part}, ${tail}`,()=>{
   const message=`Copy the approved L04 Colour Variant Sheet prompt, changing ${part} to ${colour}${tail}`;
   const {result}=answer(message);
   const expected=colourSource.replace(/\[the part, e\.g\. [^\]]+\]/,part).replace(/\[new colour, e\.g\. [^\]]+\]/,colour);
   assert.equal(body(result.reply),expected);assert.doesNotMatch(result.reply,/\[the part|\[new colour/);
  });
 }
}
test('phase5 colour-of phrasing strips the operation rather than the supplied part',()=>{
 assert.deepEqual(productSlots('Change the colour of the woven strap to mustard yellow, while preserving the body.'),{part:'the woven strap',colour:'mustard yellow'});
 assert.deepEqual(productSlots('Recolour all side panels to cream white and keep the shape unchanged.'),{part:'all side panels',colour:'cream white'});
});
test('phase5 negative and unknown colour requests do not invent target values',()=>{
 assert.deepEqual(productSlots('Do not change the rim to silver.'),{});
 const {result}=answer('Give the exact L04 Colour Variant Sheet prompt.');
 assert.equal(body(result.reply),colourSource);
});
test('phase5 remembered colour fields fill a later template without client history',()=>{
 const saved=productFacts('Change the colour of the cork stopper to burgundy, while preserving the bottle. Lesson 04.');
 const {result}=answer('Now copy the exact L04 Colour Variant Sheet prompt.',[],saved);
 assert.equal(body(result.reply),colourSource.replace(/\[the part, e\.g\. [^\]]+\]/,'the cork stopper').replace(/\[new colour, e\.g\. [^\]]+\]/,'burgundy'));
});
for(const noun of ['handset','smartphone','phone']){
 test(`phase5 exact camera instruction resolves ${noun} paraphrases`,()=>{
  const {result,knowledge}=answer(`A ${noun} appears on screen in the UGC take. Give the exact camera clarification from this course.`);
  assert.equal(knowledge.requestContext.topic,'phone_visibility');assert.equal(knowledge.requestContext.lessonNumber,7);
  assert.ok(result.reply.includes('The camera itself is her phone. NO phone visible anywhere in the frame.'));
 });
}
test('phase5 phone reference photos are not misclassified as a phone-visibility defect',()=>{
 const {knowledge,result}=answer('How do I make a product sheet from phone photos?');
 assert.equal(knowledge.requestContext.topic,'product_sheet');assert.match(result.reply,/Lesson 02/);
});
for(const message of [
 'After changing the colour, the shape changes too. What is the course fix?',
 'What does the course say when a colour variant changes the shape?',
 'Rang badalne par shape badal gayi. Kya likhu?',
])test(`phase5 colour-shape repair outranks generic course overview: ${message}`,()=>{
 const {knowledge,result}=answer(message);
 assert.equal(knowledge.requestContext.topic,'colour_shape');assert.match(result.reply,/Lesson 04/);
 assert.ok(result.reply.includes('Only change the colour'));assert.ok(result.reply.includes('keep everything else exactly the same'));
});
test('phase5 a shape follow-up keeps the colour lesson rather than video motion',()=>{
 const history=[{role:'user',content:'Explain colour variants in Lesson 04.'}];
 const {result}=answer('The shape changed as well. What should I write?',history);
 assert.match(result.reply,/Lesson 04/);assert.match(result.reply,/Only change the colour/);
});
for(const [message,language] of [
 ['How do the Diwali and wedding scenes in Lesson 04 differ?','english'],
 ['Lesson 04 में दिवाली और शादी की तस्वीरों का अंतर हिंदी में बताइए।','hindi'],
 ['Lesson 04 ke Diwali aur wedding photos ka difference Hinglish mein samjhao.','hinglish'],
])test(`phase5 festive details are grounded in both source assets: ${language}`,()=>{
 const {knowledge,result}=answer(message);
 assert.ok(knowledge.records.some(r=>r.heading==='L04 Diwali'));
 assert.ok(knowledge.records.some(r=>r.heading==='L04 Wedding Gift'));
 assert.ok(explanationLanguageMatches(result.reply,language));
 if(language==='english'){
  assert.match(result.reply,/Diwali[^\n]*diyas[^\n]*marigolds[^\n]*foreground/);
  assert.match(result.reply,/wedding[^\n]*silk[^\n]*ribbon[^\n]*petals/);
 }
 else assert.match(result.reply,/सिल्क|silk/);
});
test('phase5 face-identity troubleshooting returns its own corrective instruction',()=>{
 const {result}=answer('The presenter face keeps changing between images. What is the course repair?');
 assert.match(result.reply,/Lesson 03/);assert.match(result.reply,/keep her face exactly the same as the character sheet/);
 assert.doesNotMatch(result.reply,/five fingers/);
});
test('phase5 a language replacement retains product-video settings after a prior overview',()=>{
 const history=[{role:'user',content:'What does Lesson 01 cover?'}];
 const message='Then explain the product video settings in English.';
 const {knowledge}=answer(message,history);
 const fixed=validateProductReply({message,history,knowledge,reply:'Flow mein Ingredients chuno aur video banao. Yeh settings hain.'});
 assert.equal(fixed.issue,'response_language_mismatch');
 assert.match(fixed.reply,/Lesson 06.*16:9.*Omni 1\.1 Flash.*720p.*6 sec.*x1/s);
 assert.ok(explanationLanguageMatches(fixed.reply,'english'));assert.doesNotMatch(fixed.reply,/Lesson 01/);
});
for(const [message,language] of [['Answer in English and explain those settings again.','english'],['वही सेटिंग हिंदी में बताइए।','hindi'],['Wahi settings Hinglish mein samjhao.','hinglish']]){
 test(`phase5 persisted topic survives language repair without client history: ${language}`,()=>{
  const saved={product:'ceramic butter keeper',lessonNumber:6,topic:'video'};
  const {knowledge}=answer(message,[],saved);
  const wrong=language==='english'?'Flow mein video banao. Yeh settings hain.':'Use these video settings in Flow.';
  const fixed=validateProductReply({message,knowledge,reply:wrong});
  assert.equal(fixed.issue,'response_language_mismatch');assert.match(fixed.reply,/Lesson 06/);
  assert.match(fixed.reply,/16:9/);assert.match(fixed.reply,/720p/);assert.ok(explanationLanguageMatches(fixed.reply,language));
 });
}
test('phase5 a non-referring new question does not inherit saved video intent',()=>{
 const {knowledge}=answer('Who won the national election?',[],{lessonNumber:6,topic:'video'});
 assert.equal(knowledge.requestContext.topic,'');
});
for(const subject of ['AI presenter','synthetic actor','virtual person']){
 test(`phase5 ${subject} cannot be asserted to be an actual customer`,()=>{
  const message='Explain honest UGC advertising.';const {knowledge}=answer(message);
  const fixed=validateProductReply({message,knowledge,reply:`The ${subject} is an actual customer who bought this item.`});
  assert.equal(fixed.issue,'deceptive_testimonial');assert.match(fixed.reply,/not a real customer/);
  assert.equal(advertisingRisk(`Do not say the ${subject} is an actual customer.`),null);
 });
}
test('phase5 testimonial refusal and unknown product facts stay safe across languages',()=>{
 for(const message of ['Can a generated presenter be a genuine buyer giving a testimonial?', 'क्या AI महिला को असली ग्राहक बता सकते हैं?', 'AI actor ko genuine customer review bata sakte hain? Hinglish mein jawab do.']){
  const {result}=answer(message);assert.equal(result.policy,'advertising_safety');assert.equal(advertisingRisk(result.reply),null);
 }
 const {result}=answer('My product is a wool door wreath. Write a caption with only its name.');
 assert.match(result.reply,/Caption:.*wool door wreath/);assert.doesNotMatch(result.reply,/waterproof|I personally|antibacterial/);
});
test('phase5 templates, lesson inventory, identifiers and course restrictions stay intact',()=>{
 assert.deepEqual(PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').map(r=>r.lessonNumber),[1,2,3,4,5,6,7,8]);
 assert.equal(PRODUCT_TEMPLATES.length,19);assert.equal(new Set(PRODUCT_RECORDS.map(r=>r.chunkId)).size,PRODUCT_RECORDS.length);
 const message='Copy exact L04 Diwali prompt for a wooden trinket tray.';
 const denied=retrieveKnowledge({courses:[course],activeCourse:course,message,includeMaterials:false});
 assert.equal(productTutorReply({message,knowledge:denied}),null);
 const other={...course,_id:'other',slug:'ai-influencer'};
 assert.equal(productTutorReply({message,knowledge:{...answer(message).knowledge,activeCourse:other}}),null);
});
test('phase5 Hindi and Hinglish synthetic-customer assertions are rejected while refusals stay safe',()=>{
 for(const [unsafe,safe] of [
  ['AI कलाकार असली ग्राहक है।','AI कलाकार असली ग्राहक नहीं है।'],
  ['AI actor asli customer hai.','AI actor asli customer nahi hai.'],
  ['AI actor asli customer hai.','AI ko asli customer mat batao.'],
 ]){
  assert.equal(advertisingRisk(unsafe),'deceptive_testimonial');assert.equal(advertisingRisk(safe),null);
 }
});
