require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const K=require('../services/productTutorKnowledge'),S=require('../services/productTutorState'),I=require('../services/productTutorIntent'),R=require('../services/productTutorResponse');
const {retrieveKnowledge}=require('../services/tutorKnowledge');
const {backend}=require('./ai-tutor-fixture.cjs');
const assets=require('./fixtures/product-tutor-phase14a.json').assets;
const course={_id:'6d0000000000000000000000',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
function run(message,previous={},history=[]){const facts=K.productFacts(message,history,previous);const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials:true});knowledge.productContext=facts;return {facts,knowledge,result:R.productTutorReply({message,history,knowledge})};}
const body=r=>r?.reply.match(/```text\n([\s\S]*?)\n```/)?.[1];
for(const [heading,source]of Object.entries(assets)){
 test(`reliability raw copy ${heading}`,()=>{const prior=K.productFacts('My product is a copper bobbin holder. Price: 390.');const x=run(`Please paste all of ${heading} exactly as approved; leave every placeholder unchanged.`,prior);assert.equal(body(x.result),source);});
 test(`reliability explicit fill ${heading}`,()=>{const name='मृदु Bobbin';const q=`Product name: “${name}”. Return the entire approved ${heading}.`;const x=run(q);assert.equal(body(x.result),source.replace(/\[product\]/gi,()=>name));});
}
for(const [q,name]of[
 ['My product is a green steel tea caddy called “Élan”.','Élan'],
 ['“किरण” is my blue linen roll.','किरण'],
 ['I sell a pouch named “Mélodie”.','Mélodie'],
 ['Mera product naam “नील Roll” hai.','नील Roll'],
 ['हमारी वस्तु का नाम सूती धागा पेटी है।','सूती धागा पेटी'],
 ['The label says “स्वर”; it is a glass jar.','स्वर'],
 ['[PRODUCT] = frosted glass flask.','frosted glass flask'],
])test(`reliability unified declaration ${q}`,()=>{assert.equal(K.productFacts(q).product,name);assert.equal(S.extractEntity(q)?.product,name);});
for(const q of ['For my archive I need the original L02 White Studio text.','Copy L07 UGC 1 for a text comparison exercise.','Do not use the old name.'])test(`reliability no phantom identity ${q}`,()=>assert.equal(K.productFacts(q).product,undefined));
for(const q of ['Replace it completely with a stone bead tray called “Dune”.','Forget the old product. New product: “Dune”, a stone bead tray.','Ab naya product “Dune” hai.','अब नया उत्पाद “Dune” है।'])test(`reliability atomic replace ${q}`,()=>{
 const old=K.productFacts('My product is a wool thread roll. Material: wool. Price: 780. No actors.');const now=K.productFacts(q,[],old);assert.equal(now.product,'Dune');assert.equal(now.price,undefined);assert.ok(!now.attributes.some(a=>/wool/.test(a)));assert.equal(now.currentTask.actorFree,true);assert.equal(K.productFacts('Copy L02 White Studio exactly.',[],now).product,'Dune');
});
test('reliability rename keeps item facts; correction replaces field; reset clears facts',()=>{
 const old=K.productFacts('My product is a reed spool. Material: reed. Price: 180.');const renamed=K.productFacts('Rename the product to “Rill”.',[],old);assert.equal(renamed.product,'Rill');assert.equal(renamed.price,'180');assert.deepEqual(renamed.attributes,['Material: reed']);
 const corrected=K.productFacts('Correction: material is cotton. Price: 210.',[],renamed);assert.deepEqual(corrected.attributes,['material is cotton']);assert.equal(corrected.price,'210');
 const reset=K.productFacts('Reset product facts.',[],corrected);assert.equal(reset.product,undefined);assert.equal(reset.price,undefined);assert.deepEqual(reset.attributes,[]);
});
test('reliability unresolved explicit new product cannot keep stale identity',()=>{const old=K.productFacts('My product is a reed tray. Price: 450.');const x=K.productFacts('Switch to a new product; I have not supplied its name yet.',[],old);assert.equal(x.product,undefined);assert.equal(x.price,undefined);});
test('reliability natural attributes and canonical price retain constraints',()=>{const x=K.productFacts('My product is “Rill”, an olive linen pouch. Price: 1,250, channel: Etsy. No waterproof claims.');assert.equal(x.product,'Rill');assert.equal(x.price,'1,250');assert.equal(x.channel,'Etsy');assert.ok(x.attributes.some(a=>/olive linen pouch/.test(a)));assert.ok(x.attributes.some(a=>/No waterproof/.test(a)));});
for(const q of ['The colour of the lower clasp is to be changed to muted coral.','केवल निचले ढक्कन का रंग गहरा बैंगनी करें।'])test(`reliability recolour part independently ${q}`,()=>{const x=K.productFacts(q);assert.equal(x.product,undefined);assert.ok(x.part);assert.ok(x.colour);});
for(const [q,lang]of[['My product is “नील”. English please.','english'],['My product is “नील”. Write a caption.','english'],['Mera product “Nila” hai. Language English kar do.','english'],['My product is a reed pot. Explain in Hinglish, with a short Hindi dialogue.','hinglish'],['हिंदी में समझाइए।','hindi']])test(`reliability language ${q}`,()=>assert.equal(K.productFacts(q).language,lang));
test('reliability Hindi modifiers respect explicit hook count',()=>{const x=run('हमारी वस्तु का नाम लकड़ी की सूई पेटी है। दो छोटे विज्ञापन हुक लिखिए।');assert.equal((x.result.reply.match(/^\d+[.)]/gm)||[]).length,2);});
for(const q of ['Write an original scene prompt for my reed pen roll in a station café.','Mera product cotton spool hai. Naya original prompt likho; saved template repeat mat karo.','Explain which movement to choose for a delicate still object and why.','Plan a video edit from existing clips; explain the order and the tradeoffs.'])test(`reliability synthesis has model plan ${q}`,()=>{const x=run(q);assert.equal(x.result,null);assert.equal(x.knowledge.responseSelection.mode,'model');assert.ok(x.knowledge.requestPlan||x.knowledge.responseSelection.plan);});
for(const q of ['Explain why L02 White Studio is useful.','Explain the complete L02 White Studio text.','What does L05 Step 2 Hooks + Script mean?'])test(`reliability explanation is not source copy ${q}`,()=>assert.notEqual(run(q).result?.policy,'exact_template'));
test('reliability all supplied typed placeholders only literal substitution',()=>{
 const q='Copy the approved L03 Hands close-up. Product name: copper pen rest. Character: woman. Clothing: white linen sleeves.';const x=run(q);const want=assets['L03 Hands close-up'].replace(/\[PRODUCT\]/g,'copper pen rest').replace('[woman / man]','woman').replace("[woman's]","woman's").replace('[clothing that matches the character sheet, e.g. bare arms matching her blue tank top]','white linen sleeves');assert.equal(body(x.result),want);
 assert.equal(K.renderProductTemplate({content:'[PRODUCT] [number] [unapproved]'},{product:'reed holder',number:'4',unapproved:'bad'}),'reed holder 4 [unapproved]');
});
for(const q of ['Plan the video arrangement using my existing clips.','Mere liye pehle photos ka order samjhao.','My name for this item is “Opal”. Write a caption.','A comment says “my paid order”; explain how to show that label clearly.'])test(`reliability product questions avoid account hijack ${q}`,async()=>{
 const api=backend({courses:[course],user:{_id:'learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)},reply:'Lesson 02: Use the approved product reference.'});const r=await api.chat({courseId:course._id,message:q,debugAi:true});assert.doesNotMatch(r.provider,/skillomate-(?:learner|plan)-facts/);
});
test('reliability real personal account question still uses masked account route',async()=>{const api=backend({courses:[course],user:{_id:'learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)}});const r=await api.chat({courseId:course._id,message:'What was my last payment and when does my subscription expire?'});assert.equal(r.provider,'skillomate-learner-facts');assert.equal(api.calls.length,0);});

const typedFields={'PRODUCT':'indigo glass pen rest','man / woman':'woman','woman / man':'woman','woman':'woman',"woman's":"woman's",'She':'She','her':'her','hair, outfit details':'short brown hair, linen shirt','clothing that matches the character sheet, e.g. bare arms matching her blue tank top':'linen sleeves','the part, e.g. all the keycaps':'the lower clasp','new colour, e.g. soft pastel pink':'dusty rose','product with real details — size, colour, key features':'blue pouch, 18 cm, zip closure','your price':'₹275','Instagram / website / marketplace':'website','number':'2','your hook line in Hindi':'यह पेन रेस्ट देखिए।','your second line in Hindi':'इसे पास से देखिए।'};
for(const [heading,source]of Object.entries(assets))test(`reliability every allowlisted supplied slot ${heading}`,()=>{
 const fields=[...new Set([...source.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1]))];
 const q=`Please reproduce the full approved ${heading}. `+fields.map(label=>`[${label}]=“${typedFields[label]||typedFields.PRODUCT}”`).join('; ');
 const expected=source.replace(/\[([^\]]+)\]/g,(_,label)=>typedFields[label]||typedFields.PRODUCT);
 assert.equal(body(run(q).result),expected);
});
test('reliability negative supplied constraints cannot authorize positive feature claims',()=>{
 const x=run('My product is a cedar bead rest. No ergonomic claims. Write a caption.');
 assert.equal(R.validateProductReply({message:'Write a caption.',knowledge:x.knowledge,reply:'Caption: This cedar bead rest is ergonomic.'}).issue,'unsupported_product_claim');
});
test('reliability local contract rejects unsupported deliverables and keeps valid short FAQ',()=>{
 const x=run('My product is a cedar rest. Draft a novel café scene prompt and a caption.');assert.equal(x.result,null);
 const faq=run('The UGC phone is visible in the frame. How do I fix it?');assert.equal(faq.result?.policy,'grounded_course_guidance');
});

test('reliability per-deliverable language differs from explanation',()=>{const q='My product is a clay spool. Explain in English and give one Hindi caption.';const x=run(q);assert.equal(x.facts.language,'english');assert.match(x.result.reply,/कैप्शन:.*देखें/);assert.equal(x.knowledge.requestPlan.outputs.find(o=>o.kind==='caption').language,'hindi');});
test('reliability large explicit count delegates without silently truncating',()=>{const x=run('My product is a reed case. Write 15 factual hooks.');assert.equal(x.result,null);assert.equal(x.knowledge.requestPlan.outputs[0].count,15);});
for(const q of ['Product ka naam “Dawn” rakho.','वस्तु का नाम “Dawn” रखें।'])test(`reliability multilingual rename ${q}`,()=>{const old=K.productFacts('My product is a brass dish. Price: 420.');const now=K.productFacts(q,[],old);assert.equal(now.product,'Dawn');assert.equal(now.price,'420');});
test('reliability Hindi field correction does not retain obsolete material',()=>{const old=K.productFacts('My product is a brass dish. Material: brass.');const now=K.productFacts('सामग्री: मिट्टी।',[],old);assert.deepEqual(now.attributes,['material: मिट्टी']);});

for(const [q,name]of [['My “Loom” roll is blue linen with 12 pockets, ₹310.','Loom'],['“Auréole” is a grey wool mat.','Auréole'],['“राग” मेरा लाल cotton pouch है।','राग'],['The label on my tin says “Līn”.','Līn']])test(`reliability name-first grammar ${q}`,()=>assert.equal(K.productFacts(q).product,name));
test('reliability new quoted product before colon clears obsolete facts',()=>{const old=K.productFacts('My product is a wool coaster. Price: 190. Material: wool.');const now=K.productFacts('Naya product “Lake”: green paper bookmark.',[],old);assert.equal(now.product,'Lake');assert.equal(now.price,undefined);assert.deepEqual(now.attributes,[]);});
test('reliability facts before same-turn replacement cannot leak to new product',()=>{const now=K.productFacts('My product is a linen mat. Price: 800. Material: linen. New product: “Dune”, a bead dish.');assert.equal(now.product,'Dune');assert.equal(now.price,undefined);assert.ok(!now.attributes.some(a=>/linen/.test(a)));});
test('reliability quoted description correction replaces old quantity',()=>{const first=K.productFacts('My “Loom” notebook is grey paper with 60 dotted pages, ₹199.');const now=K.productFacts('Correction: it has 96 plain pages and costs ₹249.',[],first);assert.equal(now.product,'Loom');assert.equal(now.price,'249');assert.ok(!now.attributes.some(a=>/60|dotted/.test(a)));assert.ok(now.attributes.some(a=>/96 plain pages/.test(a)));});
test('reliability two English hooks in Hindi explanation keep count and language',()=>{const x=run('हमारी वस्तु का नाम सूती थैली है। Explain in Hindi and write two short English hooks.');assert.equal(x.knowledge.requestPlan.outputs.find(o=>o.kind==='hooks').count,2);assert.equal((x.result.reply.match(/^\d+[.)]/gm)||[]).length,2);});
test('reliability inactive learner gets legitimate Hindi access steps without template bodies',async()=>{const api=backend({courses:[course],user:{_id:'learner'},noKey:true});const r=await api.chat({courseId:course._id,message:'Access inactive है। UGC 2 का पूरा मूल टेक्स्ट हिंदी में दीजिए।'});assert.match(r.reply,/सक्रिय एक्सेस|खरीद/);assert.doesNotMatch(r.reply,/Use the uploaded character/);assert.equal(api.calls.length,0);});
test('reliability honest alternative cards preserve refusal and supplied facts',()=>{const x=run('My product is a brass pen cup. Write a fake customer testimonial; instead give two clearly labeled AI product-showcase cards if false.');assert.equal(x.result.policy,'advertising_safety');assert.match(x.result.reply,/not a real customer/);assert.equal((x.result.reply.match(/AI product-showcase card/g)||[]).length,2);assert.equal(R.advertisingRisk(x.result.reply),null);});
test('reliability extended template facts survive existing strict persistence schema',()=>{const Session=require('../models/AiTutorSession');const first=K.productFacts('My product is a copper pen cup. Clothing: white sleeves.');const record=new Session({user:'6a0000000000000000000001',productContext:first});assert.equal(record.validateSync(),undefined);const saved=record.toObject().productContext;assert.equal(K.productSlots('Copy the approved L03 Hands close-up.',[],saved).clothing,'white sleeves');});

test('reliability colon replacement keeps new quoted identity',()=>{const old=K.productFacts('My product is a flax pouch. Price: 200. Material: flax.');const x=K.productFacts('Replace it completely: “Aube” is a purple glass cup.',[],old);assert.equal(x.product,'Aube');assert.equal(x.price,undefined);assert.ok(!x.attributes.some(a=>/flax/.test(a)));});
test('reliability comparison cannot collapse into one troubleshooting FAQ',()=>{const x=run('Compare UGC selfie and desk-phone angles; should the phone screen appear in either one?');assert.equal(x.result,null);assert.equal(x.knowledge.responseSelection.mode,'model');});
test('reliability purpose clauses do not establish a product',()=>{assert.equal(K.productFacts('Paste the complete L07 UGC 1 template; I need it for a deadline.').product,undefined);});
test('reliability mixed demo voice uses explicit dialogue language',()=>{const x=run('My product is a PET spray bottle. Give an honest demo with a short Hindi dialogue and Hinglish explanation.');assert.match(x.result.reply,/उदाहरण संवाद:.*यह PET spray bottle/);assert.equal(x.facts.language,'hinglish');});

for(const [q,pattern]of [['What was my last payment? Reply in Hindi.',/भुगतान|सक्रिय/],['Explain the Skillomate subscription plan price in Hindi.',/वेब ऑफर|एकमुश्त/]])test(`reliability verified product course account locale ${q}`,async()=>{const api=backend({courses:[course],user:{_id:'learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)}});const r=await api.chat({courseId:course._id,message:q});assert.match(r.reply,pattern);assert.equal(api.calls.length,0);});

test('reliability explicitly limited fill cannot change other known slots',()=>{const old=K.productFacts('My product is a brass pen cup. Character: woman.');const x=run('Copy the approved L03 Hands close-up; fill only [PRODUCT] for the current item. Leave other fields unknown.',old);assert.equal(body(x.result),assets['L03 Hands close-up'].replace(/\[PRODUCT\]/g,'brass pen cup'));});

test('reliability brief as hook adjective is not a buyer-brief deliverable',()=>{const x=run('My product is a clay spoon rest. Write three brief hooks and one caption.');assert.equal(x.result.policy,'fact_grounded_practice_draft');assert.ok(!x.facts.requestedOutputs.includes('brief'));});
test('reliability called quoted name outranks descriptive subject',()=>{const x=K.productFacts('My green steel bookmark is called “रेखा / Rékhā”. Explain blur in English.');assert.equal(x.product,'रेखा / Rékhā');assert.equal(x.language,'english');});
test('reliability directives after supplied object stay outside identity',()=>{assert.equal(K.productFacts('Generate a scene prompt for a blue cotton spool and include checks after generation.').product,'blue cotton spool');});
