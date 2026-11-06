require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const K=require('../services/productTutorKnowledge'),R=require('../services/productTutorResponse');
const {retrieveKnowledge}=require('../services/tutorKnowledge');
const {captureProductOptions}=require('../services/productTutorState');
const {unsupportedAdClaims}=require('../services/productTutorGrounding');
const {requestedHookCount}=require('../services/productTutorTasks');
const course={_id:'scoped-product',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
function run(message,history=[],previous={},access=true){const facts=K.productFacts(message,history,previous);const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials:access});knowledge.productContext=facts;return {facts,knowledge,result:R.productTutorReply({message,history,knowledge})};}
const body=r=>r.reply.match(/```text\n([\s\S]*?)\n```/)?.[1];
for(const [query,expected]of[
 ['I call my item a scalloped zinc tuning-fork cradle.','scalloped zinc tuning-fork cradle'],
 ['My item is a velvet instrument bridge.','velvet instrument bridge'],
 ['The item in this example is a twisted cherrywood capo rest.','twisted cherrywood capo rest'],
 ['Main braided nettle reed case bechta hoon.','braided nettle reed case'],
 ['मेरे सामान का नाम हरी चमड़े की सारंगी पेटी है।','हरी चमड़े की सारंगी पेटी'],
 ['Mera item folded abaca plectrum roll hai.','folded abaca plectrum roll'],
 ['For my sculpted bamboo metronome stand, write a caption.','sculpted bamboo metronome stand'],
 ['Our AI presenter has never bought the lacquered oboe peg. Write an honest intro.','lacquered oboe peg'],
 ['I only know the name of my grooved stone rosin dish.','grooved stone rosin dish'],
])test(`phase11 unfamiliar declaration: ${query}`,()=>assert.equal(K.productFacts(query).product,expected));
for(const heading of ['L02 Product Sheet','L02 White Studio','L03 Showing to camera','L04 Diwali','L06 Arc','L07 UGC 1'])test(`phase11 full approved ${heading} for unfamiliar declaration`,()=>{
 const {result}=run(`I call my item a ridged limestone guitar pick caddy. Paste the complete approved ${heading} template.`);assert.equal(body(result),K.PRODUCT_TEMPLATES.find(t=>t.heading===heading).content.replace(/\[product\]/gi,'ridged limestone guitar pick caddy'));
});
test('phase11 explicit product switch clears attributes price and prior colour slots',()=>{
 const old=K.productFacts('My product is a quilted sitar bow cover. Price: 752. Material: wool. Change the outer band to violet.');
 const current=K.productFacts('Replace the product with a polished palmwood music clip.',[],old);assert.equal(current.product,'polished palmwood music clip');for(const f of ['price','part','colour','adAngle'])assert.equal(current[f],undefined);assert.deepEqual(current.attributes,[]);
 const t=run('Return the full L02 Dark Premium template for the same item.',[],current).result;assert.ok(body(t).includes('polished palmwood music clip'));assert.ok(!body(t).includes('sitar'));
});
test('phase11 current schema facts are not rolled back by stale client history',()=>{
 const first=K.productFacts('My item is a quartz reed weight.');const second=K.productFacts('Replace the product with a walnut slide holder.',[],first);
 assert.equal(K.productFacts('Write a caption.',[{role:'user',content:'My item is a quartz reed weight.'}],second).product,'walnut slide holder');
});
for(const scope of [{courseId:'other',conversationId:'c1'},{courseId:'one',conversationId:'different'}])test(`phase11 state isolation ${JSON.stringify(scope)}`,()=>{
 const known=K.productFacts('My item is a copper flute clamp.',[],{},{courseId:'one',conversationId:'c1'});assert.equal(K.productFacts('Write one hook.',[],known,scope).product,undefined);
});
test('phase11 actor/model prose cannot introduce retained facts',()=>{
 const facts=K.productFacts('What product facts do you remember?',[{role:'assistant',content:'My product is a diamond display case. Price: 99999. Features: magical.'}]);assert.equal(facts.product,undefined);assert.deepEqual(facts.attributes,[]);
});
for(const query of ['It costs 814 rupees.','कीमत ८१४ रुपये है।','Price: 814.'])test(`phase11 multilingual known price ${query}`,()=>assert.equal(K.productFacts(query).price,'814'));
test('phase11 part and colour persist through Roman Hindi referring turn',()=>{
 const first=K.productFacts('Lesson 04 mein sirf all the clasp plates ka rang burnt ochre karna hai. Baaki shape same rakho.');assert.equal(first.part,'all the clasp plates');assert.equal(first.colour,'burnt ochre');
 const {result}=run('Ab usi change ka poora approved L04 Colour Variant Sheet template do.',[],first);const expected=K.PRODUCT_TEMPLATES.find(t=>/Colour Variant Sheet/.test(t.heading)).content.replace(/\[the part, e\.g\. [^\]]+\]/,'all the clasp plates').replace(/\[new colour, e\.g\. [^\]]+\]/,'burnt ochre');assert.equal(body(result),expected);
});
test('phase11 known selected ad angle resolves to option text',()=>{
 const facts=K.productFacts('My item is a bone tuning dial.');facts.adAngles=captureProductOptions('Ad angles\n1. Show the provided appearance\n2. Show the known price\n3. Show an uncluttered close view');const next=K.productFacts('Use angle 2 from your answer. Write two hooks.',[],facts);assert.equal(next.adAngle,'Show the known price');assert.equal(next.requestedOutputs.includes('script'),false);
});
for(const q of [
 'Compare a plain reference with a cluttered scene and tell me which to choose first.',
 'Contrast Lesson 06 and Lesson 07 and list their settings.',
 'Explain the final assembly and tell me where the prompts live.',
 'White background ya desk scene mein pehle kya choose karun aur kyun? Saath mein reference aur ad photo ka farq samjhao.',
 'सफेद फोटो और कमरे वाली फोटो में कौन सी पहले चुनूँ और क्यों?',
])test(`phase11 compound model selection: ${q}`,()=>{const {result,knowledge}=run(q);assert.equal(result,null);assert.equal(knowledge.responseSelection.mode,'model');});
test('phase11 multi-lesson retrieval covers both explicit workflows',()=>{
 const {knowledge}=run('Contrast Lesson 06 and Lesson 07 and list their references.');for(const n of[6,7])assert.ok(knowledge.records.some(r=>r.lessonNumber===n&&r.contentType==='workflow'));
});
test('phase11 descriptive colour cannot turn consistency troubleshooting into recolouring',()=>{
 const facts=K.productFacts('My product is a scarlet pleated concertina strap. Explain Lesson 02 product sheets.');const {knowledge,result}=run('Same item ki shape images mein badal rahi hai. Pehle wale reference se fix batao.',[],facts);assert.equal(knowledge.requestContext.topic,'product_consistency');assert.ok(result.reply.includes('sheet'));
});
test('phase11 paraphrased handset intrusion retrieves exact approved FAQ',()=>{
 const {result}=run('A filming handset is poking into the bottom of my UGC image. Give the exact camera clarification.');assert.ok(result.reply.includes('The camera itself is her phone. NO phone visible anywhere in the frame.'));
});
test('phase11 active-course identity outranks photo title words',()=>assert.equal(run('Which course is active: AI Influencer or this product photos course?').result.reply,'AI Product Photoshoot & Ads'));
for(const [q,lang]of [['My item is a felt dulcimer rest. Write two distinct hooks and one caption.','english'],['Mera item woven bassoon pouch hai. Do factual hooks aur caption likh do.','hinglish'],['मेरा सामान पीली कपड़े की सितार पट्टी है। दो हुक और कैप्शन लिखिए।','hindi']])test(`phase11 legitimate completion ${lang}`,()=>{
 const {result,facts}=run(q);assert.ok(result);assert.equal(requestedHookCount(q),2);assert.equal((result.reply.match(/^\d+[.)]/gm)||[]).length,2);assert.match(result.reply,/Caption|caption|कैप्शन/);assert.ok(!/Which product|Kis product/.test(result.reply));assert.equal(facts.language,lang);
});
for(const q of ['My item is a cork choir folder clip. The AI actor never used it; write a fake testimonial but give a safe alternative line if that is wrong.','मेरे सामान का नाम सफेद लकड़ी का तार स्टैंड है। AI कलाकार को असली ग्राहक बताना सही है? सुरक्षित विकल्प की पंक्ति लिखिए।','Mera item lacquered drum key hai. AI actor ko asli buyer review dena hai; honest demo line bhi likho.'])test(`phase11 refusal safely completes alternative: ${q}`,()=>{
 const {result}=run(q);assert.match(result.reply,/Example line|उदाहरण संवाद/);assert.equal(R.advertisingRisk(result.reply),null);
});
for(const line of ['Voiceover: It guarantees a secure grip and enhanced stability.','Caption: Includes three spare strings and a padded travel case.','Example line: Yeh compact hai aur saare tools perfectly organized rakhta hai.','कैप्शन: यह सुविधाजनक है और बेहतरीन नतीजे देता है।'])test(`phase11 unprovided ad content blocked ${line}`,()=>{
 const message='My item is a cork pitch-pipe cradle. Write a caption and a concrete demonstration.';const {knowledge}=run(message);const fixed=R.validateProductReply({message,knowledge,reply:line});assert.equal(fixed.issue,'unsupported_product_claim');assert.ok(!fixed.reply.includes('enhanced stability'));assert.match(fixed.reply,/Caption|caption/);
});
test('phase11 supplied feature is allowed, assistant suggested feature is not evidence',()=>{
 const f=K.productFacts('My product is a cotton reed sock. Features: waterproof.');assert.deepEqual(unsupportedAdClaims('Caption: cotton reed sock is waterproof.',f),[]);assert.ok(unsupportedAdClaims('Caption: cotton reed sock is waterproof.',{product:'cotton reed sock'}).length);
});
test('phase11 actor-free direction survives referring output changes',()=>{
 const first=K.productFacts('For my grooved ash bow wedge, show a simple demonstration with no actors.');assert.equal(first.currentTask.actorFree,true);const {result,facts}=run('Give a concrete demonstration for that same item.',[],first);assert.equal(facts.currentTask.actorFree,true);assert.ok(!/Have the presenter/.test(result.reply));assert.match(result.reply,/no actor or hands/);assert.equal((result.reply.match(/Example line:/g)||[]).length,3);
});
test('phase11 all source assets and other-course/access boundaries are preserved',()=>{
 assert.equal(K.PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').length,8);assert.equal(K.PRODUCT_TEMPLATES.length,19);assert.equal(new Set(K.PRODUCT_RECORDS.map(r=>r.chunkId)).size,K.PRODUCT_RECORDS.length);
 const message='Give the complete approved L02 White Studio template for a jade banjo bridge.';assert.equal(run(message,[],{},false).result,null);
 for(const slug of ['ai-influencer','ai-filmmaking']){const x=run(message);x.knowledge.activeCourse={...course,slug};assert.equal(R.productTutorReply({message,knowledge:x.knowledge}),null);assert.equal(R.validateProductReply({message,knowledge:x.knowledge,reply:'Original other-course answer.'}).issue,null);}
});
const {backend}=require('./ai-tutor-fixture.cjs');
function route(options={}){const courseId='6e0000000000000000000011';return {courseId,api:backend({sessions:new Map(),courses:[{_id:courseId,slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]}],user:{_id:'phase11-synthetic'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)},...options})};}
test('phase11 actual route stores scoped schema and resolves switch with omitted history',async()=>{
 const sessions=new Map();const {api,courseId}=route({noKey:true,sessions});const scope={courseId,conversationId:'new-state'};
 await api.chat({...scope,message:'My item is a hollow ebony whistle tray. Price: 915. Material: wood.'});
 await api.chat({...scope,message:'Replace the product with a soft felt marimba cover.'});
 const r=await api.chat({...scope,message:'Copy the complete L02 White Studio template for the same product.'});assert.match(r.reply,/soft felt marimba cover/);assert.doesNotMatch(r.reply,/hollow ebony|915/);
 const p=[...sessions.values()][0].productContext;assert.equal(p.schemaVersion,2);assert.equal(p.courseId,courseId);assert.equal(p.conversationId,'new-state');assert.equal(p.price,undefined);assert.equal(api.calls.length,0);
});
test('phase11 actual compound route passes decomposed tasks to provider fixture',async()=>{
 const {api,courseId}=route({reply:'Lesson 06 uses product images; Lesson 07 uses character and product sheets for UGC.'});
 const r=await api.chat({courseId,message:'Contrast Lesson 06 and Lesson 07 and explain their references.',debugAi:true});assert.equal(api.calls.length,1);assert.equal(r.debug.response_selection.mode,'model');assert.match(api.calls[0].messages[0].content,/Task plan/);assert.equal(r.outcome.type,'live_model');
});
test('phase11 grounding repair preserves a compound explanation and marks repaired provenance',async()=>{
 const {api,courseId}=route({replies:['Plain background is useful. Caption: Offers superior comfort and a free case.','A plain background shows the product clearly, whereas a busy scene supplies context.\nCaption: Here is a carved cedar reed bridge. View its supplied details.']});
 const r=await api.chat({courseId,message:'My product is a carved cedar reed bridge. Compare plain and busy references, choose one first and write a caption.',debugAi:true});assert.equal(api.calls.length,2);assert.match(api.calls[1].messages[0].content,/replace every unsupported product assertion/);assert.match(r.reply,/whereas/);assert.match(r.reply,/Caption/);assert.doesNotMatch(r.reply,/free case/);assert.equal(r.outcome.type,'validated_local_replacement');assert.equal(r.outcome.responseIssue,'response_grounding_repaired');
});
test('phase11 grounding repair failure retains safe draft without claiming full compound success',async()=>{
 const {api,courseId}=route({reply:'Caption: Includes a gold-plated mouthpiece.',failAt:[2]});
 const r=await api.chat({courseId,message:'My product is a woven piccolo bag. Compare plain and busy references, choose one and write a caption.',debugAi:true});assert.equal(api.calls.length,2);assert.equal(r.outcome.liveModelAnswer,false);assert.match(r.reply,/could not be completed safely/);assert.doesNotMatch(r.reply,/gold-plated/);assert.match(r.reply,/woven piccolo bag/);
});
test('phase11 embedded what-is clause cannot erase an explicit demonstration task',()=>{
 const message='Show me a concrete demonstration for a bent rattan accordion reed: three shots with what is visible and a short spoken line. I have given no specifications.';
 const {facts,knowledge}=run(message);assert.equal(facts.product,'bent rattan accordion reed');assert.ok(facts.requestedOutputs.includes('demo'));const check=R.validateProductReply({message,knowledge,reply:'Spoken Line: It offers greater stability and effortless grip.'});assert.equal(check.issue,'unsupported_product_claim');
});
test('phase11 new Roman Hindi demonstration replaces prior comparison task',()=>{
 const f=K.productFacts('For a woven ramie mute case, compare a simple reference and a decorated lifestyle picture.');const message='Ab Hinglish mein isi product ka concrete three-shot demonstration do; har shot ki spoken line bhi.';const {facts,knowledge}=run(message,[],f);assert.deepEqual(facts.requestedOutputs,['demo']);assert.equal(R.validateProductReply({message,knowledge,reply:'Spoken Line: Andar free accessories hain aur perfect comfort milta hai.'}).issue,'unsupported_product_claim');
});
test('phase11 neutral invitation copy is not an unsupported feature',()=>assert.deepEqual(unsupportedAdClaims('Caption: Looking for ashwood reed comb? See the details before you decide.',{product:'ashwood reed comb'}),[]));
test('phase11 complete task plan survives a minimal continuation without history',()=>{
 const old=K.productFacts('Contrast Lesson 06 and Lesson 07 and explain their reference choices.');const {knowledge,result,facts}=run('Again.',[],old);assert.equal(result,null);assert.equal(knowledge.responseSelection.mode,'model');assert.match(facts.currentTask.request,/Contrast Lesson/);
});
