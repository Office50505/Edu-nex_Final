// Generalized Phase 7 contracts; no evaluation IDs or saved questions.
require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {PRODUCT_RECORDS,PRODUCT_TEMPLATES,productSlots,productFacts,productRequestContext,requestedProductOutputs}=require('../services/productTutorKnowledge');
const {retrieveKnowledge}=require('../services/tutorKnowledge');
const {productTutorReply,validateProductReply,advertisingRisk,explanationLanguageMatches}=require('../services/productTutorResponse');
const {requestedHookCount}=require('../services/productTutorTasks');
const course={_id:'phase7-course',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
function run(message,history=[],saved={}){
 const facts=productFacts(message,history,saved);
 const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials:true});
 knowledge.productContext=facts;
 return {knowledge,facts,result:productTutorReply({message,history,knowledge})};
}
const block=reply=>reply.match(/```text\n([\s\S]*?)\n```/)?.[1];
for(const [query,lang] of [
 ['What will I learn in the AI Product Photoshoot & Ads course?','english'],
 ['Explain the complete AI Product Photoshoot & Ads course curriculum and outcomes.','english'],
 ['AI Product Photoshoot & Ads कोर्स में क्या सिखाया जाता है?','hindi'],
 ['Poore AI Product Photoshoot & Ads course mein kya sikhate hain? Hinglish mein batao.','hinglish'],
])test(`phase7 full course overview: ${lang}, ${query}`,()=>{
 const {result,knowledge}=run(query);assert.equal(knowledge.requestContext.topic,'overview');
 for(let i=1;i<=8;i++)assert.match(result.reply,new RegExp(`0${i}`));
 for(const tool of ['Google Flow','ChatGPT','CapCut'])assert.ok(result.reply.includes(tool));
 assert.ok(explanationLanguageMatches(result.reply,lang));assert.match(result.reply,/learn to create|सीख|sikh|bana/i);
});
for(const [query,topic] of [
 ['How do I take product photos for this course?','product_sheet'],
 ['Explain Lesson 06 video settings in the AI Product Photoshoot & Ads course.','video'],
 ['The shape changed in this course colour workflow. What is the repair?','colour_shape'],
])test(`phase7 specific learner task remains specific: ${topic}`,()=>assert.equal(run(query).knowledge.requestContext.topic,topic));
for(const [declaration,product] of [
 ['My product is called a lacquered maple pen rest.','lacquered maple pen rest'],
 ['Our product is named a felt coin envelope.','felt coin envelope'],
 ['The name of my product is a woven bookmark sleeve.','woven bookmark sleeve'],
 ['I only know the name brass incense tray.','brass incense tray'],
 ['I just know the product name embossed linen sachet.','embossed linen sachet'],
 ['मेरे प्रोडक्ट का नाम लकड़ी की चाबी पट्टी है।','लकड़ी की चाबी पट्टी'],
 ['मुझे केवल नाम तांबे की अगरबत्ती थाली पता है।','तांबे की अगरबत्ती थाली'],
 ['Mere product ka naam painted clay spoon rest hai.','painted clay spoon rest'],
 ['Mujhe sirf naam woven reed coaster maloom hai.','woven reed coaster'],
])test(`phase7 unfamiliar product declaration: ${product}`,()=>{
 assert.equal(productSlots(declaration).product,product);
 const {result}=run('Copy the exact L02 White Studio prompt.',[],productFacts(declaration));
 const source=PRODUCT_TEMPLATES.find(t=>t.heading==='L02 White Studio');
 assert.equal(block(result.reply),source.content.replace(/\[product\]/gi,product));
});
test('phase7 personal names and unset facts do not become product names',()=>{
 for(const text of ['My name is Aria.','My product is unknown.','My product is unset.','Who made this product?'])assert.equal(productSlots(text).product,undefined);
});
test('phase7 changing products clears stale facts and colour/person slots',()=>{
 const old={product:'metal lamp',price:'900',colour:'teal',part:'the base',person:'woman',attributes:['waterproof'],adAngle:'3'};
 const facts=productFacts('My product is called a cork photo stand.',[],old);
 assert.equal(facts.product,'cork photo stand');for(const k of ['price','colour','part','person','adAngle'])assert.equal(facts[k],undefined);assert.deepEqual(facts.attributes,[]);
});
for(const [query,count,lang] of [
 ['I only know the name walnut paperweight. Write three short hooks now.',3,'english'],
 ['My product is called a cotton tea cosy. Could you give two punchy hooks?',2,'english'],
 ['मेरा प्रोडक्ट ऊन का चाय कवर है। तीन छोटे हुक लिखिए।',3,'hindi'],
 ['Mera product bamboo pencil cup hai. Teen chhote hooks likho.',3,'hinglish'],
])test(`phase7 delivers requested quantity with known facts: ${lang}`,()=>{
 const {result,facts}=run(query);assert.equal(requestedHookCount(query),count);
 const hooks=result.reply.split(/\nHooks\n/i)[1]?.split('\n\n')[0].split('\n')||[];
 assert.equal(hooks.length,count);assert.ok(result.reply.includes(facts.product));
 assert.ok(explanationLanguageMatches(result.reply,lang,facts.product));assert.doesNotMatch(result.reply,/waterproof|antibacterial|Which product/);
});
for(const [query,lang] of [
 ['A mobile device appears next to the UGC presenter. Give the exact camera framing clarification.','english'],
 ['मोबाइल फ्रेम में दिख रहा है। Lesson 07 का सटीक कैमरा निर्देश बताइए।','hindi'],
 ['UGC take mein mobile device screen par dikh raha hai. Exact camera instruction batao.','hinglish'],
])test(`phase7 exact phone-framing troubleshooting: ${lang}`,()=>{
 const {knowledge,result}=run(query);assert.equal(knowledge.requestContext.topic,'phone_visibility');
 assert.ok(result.reply.includes('The camera itself is her phone. NO phone visible anywhere in the frame.'));
});
test('phase7 phone photography remains a photo task',()=>assert.equal(run('Can I use photos taken with my mobile phone to make a product sheet?').knowledge.requestContext.topic,'product_sheet'));
for(const query of ['The item changes appearance between reference photos. What can I do?', 'My product looks different across the images. What is the fix?'])test(`phase7 product consistency paraphrase: ${query}`,()=>{
 const {knowledge,result}=run(query);assert.equal(knowledge.requestContext.topic,'product_consistency');assert.match(result.reply,/same|sheet|reference/i);
});
test('phase7 polished product adjective does not trigger UGC troubleshooting',()=>{
 const {knowledge,result}=run('Compare an empty setting and a furnished setting around a polished copper pencil tray. Give a reason for each.');
 assert.equal(knowledge.requestContext.topic,'composition');assert.match(result.reply,/Empty setting:.*polished copper pencil tray/);assert.match(result.reply,/Furnished setting:/);assert.match(result.reply,/attention/);assert.match(result.reply,/scene context/);assert.doesNotMatch(result.reply,/Lesson 07|not a polished ad/);
});
test('phase7 polished footage still retrieves natural UGC repair',()=>{
 const {knowledge,result}=run('The UGC video looks too polished like a commercial ad. How do I fix it?');
 assert.equal(knowledge.requestContext.topic,'natural_ugc');assert.match(result.reply,/not a polished ad/);
});
test('phase7 incidental noun substrings do not select colour or motion',()=>{
 for(const query of ['How can I arrange my reference images?', 'Could you explain promotion options?', 'My product is an orange ceramic dish.']){
  const context=productRequestContext(query);assert.ok(!['colour','colour_shape','colour_shade','motion'].includes(context.topic),JSON.stringify(context));
 }
});
for(const [decl,query,lang] of [
 ['My product is a cork tablet stand.','Show a concrete honest product demonstration example.','english'],
 ['मेरा प्रोडक्ट मिट्टी का कागज भार है।','ईमानदार प्रोडक्ट डेमो का उदाहरण बताइए।','hindi'],
 ['Mera product woven jute coaster hai.','Honest product demo ka idea do, actor kaise dikhaye? Hinglish mein batao.','hinglish'],
])test(`phase7 concrete demo keeps product and safety: ${lang}`,()=>{
 const saved=productFacts(decl);const {result}=run(query,[],saved);
 assert.match(result.reply,/Lesson 07/);assert.ok(result.reply.includes(saved.product));assert.match(result.reply,/Example line|उदाहरण संवाद/);
 assert.equal((result.reply.match(/^\d\. /gm)||[]).length,3);assert.equal(advertisingRisk(result.reply),null);assert.ok(explanationLanguageMatches(result.reply,lang,saved.product));
 assert.doesNotMatch(result.reply,/I personally|waterproof|antibacterial|guaranteed income/);
});
test('phase7 language repair keeps persisted Hindi product and concrete output',()=>{
 const saved={...productFacts('मेरा प्रोडक्ट पीतल की कंघी पेटी है।'),lessonNumber:7,topic:'ugc'};
 const message='Now give an honest demonstration example in Hinglish.';const {knowledge}=run(message,[],saved);
 const fixed=validateProductReply({message,knowledge,reply:'यह केवल सामान्य कोर्स वर्कफ़्लो है।'});
 assert.equal(fixed.issue,'response_language_mismatch');assert.ok(fixed.reply.includes(saved.product));assert.match(fixed.reply,/Example line/);assert.ok(explanationLanguageMatches(fixed.reply,'hinglish',saved.product));
 assert.equal(explanationLanguageMatches(`Use ${saved.product} and take a photo.`,'hindi',saved.product),false);
 assert.equal(explanationLanguageMatches('नया विवरण जोड़ें और काम करें।','hinglish',saved.product),false);
});
test('phase7 a vague retrieval hit cannot assign an unsupported lesson',()=>{
 const message='How should I choose between clean and decorated backgrounds?';const {knowledge}=run(message);
 knowledge.requestContext={topic:'',lessonNumber:null};
 const fixed=validateProductReply({message,knowledge,reply:'Use a clean scene for attention and decoration for context.'});
 assert.equal(fixed.issue,null);assert.doesNotMatch(fixed.reply,/Lesson/);
});
test('phase7 testimonial prohibitions accept the object review but not unrelated negation',()=>{
 for(const safe of ['AI actor ko asli customer review mat batao.','AI presenter ko asli customer testimonial na bolo.','AI को असली ग्राहक की समीक्षा मत बताओ।'])assert.equal(advertisingRisk(safe),null,safe);
 for(const unsafe of ['AI actor asli customer hai aur review mat dikhao.','No background music. AI actor is a genuine customer.','AI actor asli customer hai; benefits mat banao.'])assert.ok(advertisingRisk(unsafe),unsafe);
});
test('phase7 demo request does not authorize customer experience fabrication',()=>{
 const {result}=run('My product is a felt desk mat. Give a demo idea with an AI actor as a genuine customer who bought it.');
 assert.equal(result.policy,'advertising_safety');assert.equal(advertisingRisk(result.reply),null);assert.match(result.reply,/not a real customer/);assert.match(result.reply,/Example line/);
});
test('phase7 factual or informational requests do not force an ad draft',()=>{
 assert.deepEqual(requestedProductOutputs('What details should I provide for ad hooks?'),[]);
 assert.deepEqual(requestedProductOutputs('What is a product demonstration?'),[]);
});
test('phase7 all eight lessons, nineteen bodies and access restrictions remain',()=>{
 assert.deepEqual(PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').map(r=>r.lessonNumber),[1,2,3,4,5,6,7,8]);assert.equal(PRODUCT_TEMPLATES.length,19);
 assert.equal(new Set(PRODUCT_RECORDS.map(r=>r.chunkId)).size,PRODUCT_RECORDS.length);
 const message='Show an honest product demo example for a reed pen basket.';
 const denied=retrieveKnowledge({courses:[course],activeCourse:course,message,includeMaterials:false});assert.equal(productTutorReply({message,knowledge:denied}),null);
 for(const slug of ['ai-influencer','ai-filmmaking'])assert.equal(productTutorReply({message,knowledge:{...run(message).knowledge,activeCourse:{...course,slug}}}),null);
});

test('phase7 a reference to that tray keeps the full declared product name',()=>{
 const saved=productFacts('My product is a glazed cobalt ceramic tray.');
 const {result,facts}=run('Write three hooks for that tray.',[],saved);
 assert.equal(facts.product,'glazed cobalt ceramic tray');assert.match(result.reply,/glazed cobalt ceramic tray/);
});
for(const query of ['Create a product video of my polished brass paper clip.','My product is a polished copper bookmark. What product video settings should I use?'])test(`phase7 polished product in video question is not polished footage: ${query}`,()=>{
 const {knowledge,result}=run(query);assert.equal(knowledge.requestContext.topic,'video');assert.match(result.reply,/Lesson 06/);assert.doesNotMatch(result.reply,/not a polished ad/);
});
for(const [query,lang] of [['हर तस्वीर में प्रोडक्ट अलग दिख रहा है। ठीक कैसे करूँ?','hindi'],['Har photo mein product alag dikh raha hai. Kya fix hai?','hinglish']])test(`phase7 multilingual consistency troubleshooting: ${lang}`,()=>{
 const {knowledge,result}=run(query);assert.equal(knowledge.requestContext.topic,'product_consistency');assert.ok(explanationLanguageMatches(result.reply,lang));
});

test('phase7 indirect informational requests do not trigger unrelated ad generation',()=>{
 for(const q of ['Could you explain what ad hooks mean?','I would like to learn about captions.','Can you explain how scripts work?'])assert.deepEqual(requestedProductOutputs(q),[]);
 const {result}=run('I would like three short hooks.',[],{product:'carved walnut door sign'});
 assert.match(result.reply,/Hooks\n1\./);assert.match(result.reply,/carved walnut door sign/);
});
