require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const { buildBusinessContract } = require('../services/businessRequestContract');
const { assessBusinessResponse, roleOf } = require('../services/businessResponsePipeline');
const { course } = require('../scripts/eval/local-business-registration/real-metadata.json');
const K = require('../services/tutorKnowledge');
const saved = require('./fixtures/task-preserving-live-failures.json').cases;
const user = { _id:'6addcefc5d47d548973c29b9',purchasedCourses:[course._id] };
const make = options => backend({courses:[course],user,...options});
const contract = (message, history = []) => buildBusinessContract({message,history,course,authorized:true,language:'english'});
const promptBody = text => text.match(/```[^\n]*\n([\s\S]*?)\n```/u)?.[1] || '';
const withoutPlaceholders = text => text.replace(/\[[^\]]*\]/gu,'');

for (const savedCase of saved) test(`saved ${savedCase.id}: assess raw model answer and preserve final task`, async () => {
  const api=make({reply:savedCase.rawAnswer});
  const knowledge=await api.service.buildContext(user,course._id,savedCase.request.message,savedCase.request.history,{conversationId:savedCase.request.conversationId});
  const raw=api.service.assessTaskResponse({reply:savedCase.rawAnswer,knowledge});
  const result=await api.chat({...savedCase.request,debugAi:true});
  assert.equal(api.calls.length,1);
  assert.equal(result.debug.task_assessment.finalIssues.length,0);
  assert.equal(result.debug.task_assessment.repairAttempted,false);
  assert.equal(knowledge.responseContract.activeCourse.id,course._id);
  assert.equal(knowledge.responseContract.activeCourse.authorized,true);
  if (savedCase.id==='dental' || savedCase.id==='mobile-repair') {
    assert.ok(raw.issues.some(issue=>issue.code==='unsupported_business_assertion'));
    assert.ok(raw.edits.length>=4);
    const deliveredPrompt=promptBody(result.answer);
    assert.ok(deliveredPrompt.startsWith('Create an Instagram'));
    assert.match(deliveredPrompt,/Call to action|Contact Number/);
    assert.match(deliveredPrompt,/confirm|owner/i);
    assert.doesNotMatch(withoutPlaceholders(deliveredPrompt),/experienced staff|modern dental equipment|Expert technicians|Quick and efficient|Wide range/i);
    assert.ok(result.answer.includes('1:1 (square post)'));
    assert.equal(result.provider,'course-response-policy');
  } else if (savedCase.id==='stationery-plan') {
    assert.equal(knowledge.responseContract.task,'planning');
    assert.equal(knowledge.businessRequest,undefined);
    assert.equal(knowledge.responseContract.facts.budget.value,'₹500');
    assert.ok(raw.issues.every(i=>i.code==='unapproved_offer_suggestion'));
    for (const section of ['Practical Plan','₹500','3 product photos','WhatsApp','Kyun Reels','Honest Limitation']) assert.ok(result.answer.includes(section),section);
    assert.equal((result.answer.match(/owner approval zaroori/gu)||[]).length,2,'qualifications are idempotent');
    assert.doesNotMatch(result.answer,/draft nahi ban paya|Feedback message/);
  } else {
    assert.equal(raw.issues.length,0,'refusing fake reviews is not endorsing them');
    assert.equal(knowledge.responseContract.facts.business_name.value,'Gift Nest');
    assert.equal(knowledge.responseContract.facts.services.value,'customized mugs aur photo frames');
    assert.match(promptBody(result.answer),/Gift Nest.*customized mugs and photo frames/s);
    assert.match(promptBody(result.answer),/Do not add any fake reviews/);
    assert.doesNotMatch(result.answer,/Feedback message|\[BUSINESS NAME\]/);
    assert.equal(result.provider,'fal-openrouter');
  }
});

test('natural facts, requested fiction, missing facts and retractions have separate provenance', () => {
  const c=contract('Our studio is called Opal Reed. We offer glass engraving. Delivery might be available. Write an English caption saying we have 900 reviews even though nobody reviewed us.');
  assert.equal(c.facts.business_name.value,'Opal Reed');
  assert.equal(c.facts.services.value,'glass engraving');
  assert.ok(c.facts.services.source.includes('We offer'));
  assert.ok(c.unknownDetails.includes('contact'));
  assert.ok(c.uncertainEvidence.some(s=>s.text.includes('Delivery')));
  assert.ok(!c.statements.some(s=>s.text.includes('900')));
  assert.ok(!c.statements.some(s=>s.text.includes('might')));
});

test('natural name correction supersedes the old identity while preserving products', () => {
  const first='My shop is called Opal Reed. We sell etched bottles. Write an English caption.';
  const c=contract('Change the shop name from Opal Reed to Moss Parcel and write an English poster prompt. Products stay the same.',[{role:'user',content:first},{role:'assistant',content:'We offer lifetime warranties.'}]);
  assert.equal(c.facts.business_name.value,'Moss Parcel');
  assert.equal(c.facts.services.value,'etched bottles');
  assert.equal(c.supersededFacts[0].previous,'Opal Reed');
  assert.ok(!c.statements.some(s=>s.text.includes('warranties')));
  const result=assessBusinessResponse({contract:c,reply:'```text\nCreate a poster for Opal Reed.\nUse a warm design.\n```'});
  assert.match(result.answer,/poster for Moss Parcel/);
  assert.doesNotMatch(result.answer,/Opal Reed/);
});

test('a new business does not inherit the prior client capabilities', () => {
  const c=contract('My client has a new mobile repair shop. Write an English prompt.',[{role:'user',content:'My client has a dental clinic. We offer whitening.'}]);
  assert.equal(c.facts.business_type.value,'mobile repair shop');
  assert.equal(c.facts.services,undefined);
  assert.ok(!c.statements.some(s=>s.text.includes('whitening')));
});

test('server-scoped natural facts survive the rolling history window without stale client rollback',async()=>{
  const sessions=new Map(),api=make({sessions,reply:'Use only the facts supplied for this course.'});
  const scope={activeCourseId:course._id,conversationId:'rolling-natural-facts'};
  await api.chat({...scope,message:'My shop is called Silver Leaf. We sell etched bottles. Explain the course in English.'});
  await api.chat({...scope,message:'Change the shop name from Silver Leaf to Moss Parcel. Explain the course in English.'});
  for(let i=0;i<18;i++)await api.chat({...scope,message:`Explain lesson ${i%8+1} in English.`});
  const saved=sessions.get(`learner:${course._id}`);
  const k=await api.service.buildContext(user,course._id,'Write an English caption.',[],{conversationId:scope.conversationId,savedState:saved});
  assert.equal(k.responseContract.facts.business_name.value,'Moss Parcel');
  assert.equal(k.responseContract.facts.services.value,'etched bottles');
  const fresh=await api.service.buildContext(user,course._id,'Write an English caption.',[],{conversationId:'different-chat',savedState:saved});
  assert.equal(fresh.responseContract.facts.business_name,undefined);
});

test('withdrawn facts cannot return when negative-history entries age out',()=>{
  const options={course,authorized:true,language:'english',conversationId:'withdrawn-fact'};
  let state=buildBusinessContract({...options,message:'We offer free delivery.'});
  state=buildBusinessContract({...options,previousState:state,message:'Correction: delivery is not confirmed.'});
  for(let i=0;i<20;i++)state=buildBusinessContract({...options,previousState:state,message:`There is no approved price for item ${i}.`});
  assert.equal(state.facts.services,undefined);
  assert.ok(!state.statements.some(s=>/free delivery/i.test(s.text)));
  const answer=assessBusinessResponse({reply:'Our shop offers free delivery.',contract:{...state,task:'creative_deliverable',format:'caption'}});
  assert.ok(answer.issues.length);
});

test('previously unseen capability is assessed as a sourced assertion, not a known forbidden phrase', () => {
  const c=contract('Our business is called Tide Dial. We restore compasses. Give an English poster prompt.');
  const raw='```text\nCreate a poster for Tide Dial.\n- We restore compasses.\n- Repairs underwater cameras within eighteen minutes.\nUse a calm layout.\n```';
  const a=assessBusinessResponse({reply:raw,contract:c});
  assert.ok(a.issues.some(i=>i.code==='unsupported_business_assertion'&&i.text.includes('underwater cameras')));
  assert.match(a.answer,/- We restore compasses\./);
  assert.match(a.answer,/Use a calm layout/);
  assert.doesNotMatch(withoutPlaceholders(promptBody(a.answer)),/underwater cameras/);
  assert.equal(assessBusinessResponse({reply:a.answer,contract:c}).issues.length,0);
});

test('subjective design, confirmed unusual facts and educational explanations remain usable', () => {
  const c=contract('Our shop includes wheelchair access. Write an English poster prompt.');
  const reply='```text\nCreate an inviting poster.\n- Our shop includes wheelchair access.\nUse cozy colours and readable fonts.\n```';
  assert.equal(assessBusinessResponse({reply,contract:c}).answer,reply);
  assert.equal(assessBusinessResponse({reply,contract:c}).issues.length,0);
  const explanation=contract('Explain what organic certification means in English.');
  assert.equal(assessBusinessResponse({reply:'Organic certification is a documented standard; verify the actual certificate before making a business claim.',contract:explanation}).issues.length,0);
});

test('quoted/refused claims are separated from a later endorsed assertion', () => {
  const c=contract('Write a truthful English poster prompt for our shop.');
  assert.equal(roleOf('Fake reviews add karna policy ke khilaaf hai.',false,c),'refusal_or_qualification');
  const raw='Do not write fake reviews, but our shop offers free delivery. Create a truthful poster.';
  const a=assessBusinessResponse({reply:raw,contract:c});
  assert.ok(a.issues.some(i=>i.text?.includes('free delivery')));
  assert.ok(a.needsRepair,'mixed prose requires one bounded repair instead of losing the task');
});

test('a quoted client request is discussion, while draft placeholders remain unendorsed',()=>{
  const c=contract('Our shop is called Tide Dial. Write an English poster prompt. We have no delivery information.');
  const reply='The client requested "free delivery".\n```text\nCreate a poster for Tide Dial.\nOur shop offers [OWNER-CONFIRMED DELIVERY, if available].\n```';
  const a=assessBusinessResponse({reply,contract:c});
  assert.equal(a.issues.length,0);
  assert.equal(a.answer,reply);
});

test('without a minimum order is a positive delivery claim, not a refusal',()=>{
  const c=contract('Write an English ad caption for a new studio; delivery has not been confirmed.');
  const a=assessBusinessResponse({reply:'Our studio offers free delivery without a minimum order.',contract:c});
  assert.ok(a.issues.some(i=>i.code==='course_business_unverified_claim'));
});

test('budget allocation suggestions are distinct from an actual product price or offer', () => {
  const c=contract('My total marketing budget is ₹600. Compare a poster and a reel and give a practical English plan.');
  const reply='Try posters first using existing photos. Consider ₹200 for printing and keep ₹400 for a later experiment. Compare enquiries; results are uncertain.';
  assert.equal(c.task,'planning');
  const a=assessBusinessResponse({reply,contract:c});
  assert.equal(a.issues.length,0);
  assert.equal(a.answer,reply);
  const over=assessBusinessResponse({reply:'Spend ₹800 on printing. Compare actual enquiries.',contract:c});
  assert.equal(over.needsRepair,true);
  assert.ok(over.issues.some(i=>i.code==='proposed_spend_exceeds_budget'));
});

test('a repair preserves task, language and known facts and is revalidated once', async () => {
  const raw='Our shop offers lifetime warranties. Use the supplied photo to make the poster.';
  const repaired='```text\nCreate a poster for Paper Lantern.\nUse the supplied photo and [OWNER-CONFIRMED WARRANTY, if any].\n```';
  const api=make({replies:[raw,repaired]});
  const result=await api.chat({activeCourseId:course._id,message:'Our shop is called Paper Lantern. Give an English poster prompt. Warranty is unconfirmed.',debugAi:true});
  assert.equal(api.calls.length,2);
  assert.equal(result.debug.task_assessment.delivery,'repaired');
  assert.equal(result.debug.task_assessment.finalIssues.length,0);
  assert.match(result.answer,/Paper Lantern/);
  assert.match(promptBody(result.answer),/supplied photo/);
  const repairSystem=api.calls[1].messages[0].content;
  assert.match(repairSystem,/Preserve task=creative_deliverable, format=prompt, language=english/);
  assert.match(repairSystem,/Paper Lantern/);
});

test('unsafe repair or repair transport failure ends in an honest task-specific limitation', async () => {
  const bad='Our shop offers lifetime warranties. Use the supplied photo to make the poster.';
  for (const options of [{replies:[bad,bad]},{reply:bad,failAt:[2]}]) {
    const api=make(options);
    const r=await api.chat({activeCourseId:course._id,message:'Our shop is called Fern Paper. Give an English poster prompt. Warranty is unconfirmed.',debugAi:true});
    assert.equal(api.calls.length,2);
    assert.equal(r.debug.task_assessment.delivery,'relevant_limitation');
    assert.match(r.answer,/requested prompt.*Fern Paper/);
    assert.doesNotMatch(r.answer,/Feedback message|course overview|lifetime warranties/);
    assert.equal(r.outcome.liveModelAnswer,false);
  }
});

test('repair cannot return a protected template from another course',async()=>{
  const other=require('../services/productTutorKnowledge').PRODUCT_RECORDS.find(r=>r.contentType==='exact-template').content;
  const api=make({replies:['Our shop offers lifetime warranties. Use the supplied photo to make the poster.',other]});
  const r=await api.rawChat({activeCourseId:course._id,message:'Our shop is called Fern Paper. Give an English poster prompt. Warranty is unconfirmed.'});
  assert.equal(api.calls.length,2);
  assert.equal(r.statusCode,502);
  assert.equal(r.result.outcome.providerStatus,'COURSE_KNOWLEDGE_SCOPE_VIOLATION');
  assert.ok(!JSON.stringify(r.result).includes(other));
});

test('a marketing budget cannot establish the product price',()=>{
  const c=contract('My marketing budget is ₹500. Write an English ad caption. Product prices are not provided.');
  assert.equal(c.facts.price,undefined);
  const result=assessBusinessResponse({reply:'Offer price ₹500.',contract:c});
  assert.ok(result.issues.length>0);
  assert.doesNotMatch(withoutPlaceholders(result.answer),/Offer price ₹500/);
});

test('planning retrieval keeps channel principles and omits unrelated template bodies and tutor instructions', async () => {
  const api=make({reply:'Start with a small poster experiment using your existing photos.'});
  const question='I have a tiny budget and two product photos. Should I make a poster or a reel? Give an English plan.';
  const k=await api.service.buildContext(user,course._id,question,[]);
  assert.equal(k.responseContract.task,'planning');
  assert.ok(k.records.some(r=>[6,7,8].includes(r.lessonNumber)));
  assert.ok(k.records.every(r=>!['course-rules','exact-template','example-answers'].includes(r.contentType)));
  assert.ok(!k.records.some(r=>r.lessonNumber===4));
  await api.chat({activeCourseId:course._id,message:question});
  const system=api.calls[0].messages[0].content;
  assert.doesNotMatch(system,/Prompt maange toh course ka exact prompt|Jahan kaam ka lesson|Skillomate platform reference material/);
  for (const r of K.packFor(course).records.filter(r=>r.contentType==='exact-template')) assert.ok(!system.includes(r.content));
});

// Use the actual 12-attempt durable gate with isolated fixture files. Never
// authorize, append to, reset or modify the real historical QA accounting.
function accountingFixture() {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
  const {createGate}=require('../../tmp/nex-final-qa-20261027/gate.cjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'task-preserving-accounting-'));
  const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  const session=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../tmp/nex-final-qa-20261027/session.json')));
  const revision=JSON.stringify({sources:{'edunex-b/services/businessResponsePipeline.js':sha(fs.readFileSync(path.resolve(__dirname,'../services/businessResponsePipeline.js')))}});
  session.source_revision_sha256=sha(revision);
  const bytes=JSON.stringify(session),hash=sha(bytes);
  fs.writeFileSync(path.join(directory,'source-revision.json'),revision);
  fs.writeFileSync(path.join(directory,'session.json'),bytes);
  fs.writeFileSync(path.join(directory,'session.sha256'),hash+'\n');
  const record={type:'session_initialized',sequence:0,session_id:session.session_id,session_sha256:hash,previous_hash:'',time:new Date().toISOString()};
  fs.writeFileSync(path.join(directory,'provider_attempts.jsonl'),JSON.stringify({...record,digest:sha(JSON.stringify(record))})+'\n');
  const gate=createGate({directory,configured:{key:'offline-fixture',model:session.model,url:session.provider_url}});
  const context={path:'/api/ai/chat',environment:session.environment,req:{method:'POST',headers:{host:'127.0.0.1:3129'},socket:{remoteAddress:'127.0.0.1',localAddress:'127.0.0.1'},compatAuth:{userId:session.user_id},body:{activeCourseId:session.course_id,conversationId:'offline-repair-accounting'}},knowledge:{activeCourse:{id:session.course_id},materialsAvailable:true}};
  return {gate,context,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}

for (const approval of ['open','awaiting','one-left']) test(`generation and bounded repair share durable accounting: ${approval}`,async()=>{
  const f=accountingFixture();
  try {
    if(approval!=='awaiting')f.gate.authorize(f.gate.hash);
    const payload={model:f.gate.frozen.model,max_tokens:900,messages:[{role:'system',content:'Offline fixture'}]};
    if(approval==='one-left')for(let i=0;i<11;i++)f.gate.consume(payload,f.context);
    const raw='Our shop offers lifetime warranties. Use the supplied photo to make the poster.';
    const repaired='```text\nCreate a poster for Paper Lantern.\nUse the supplied photo.\n```';
    const api=make({replies:[raw,repaired],providerHook:body=>f.gate.consume(body,f.context)});
    const r=await api.rawChat({activeCourseId:course._id,message:'Our shop is called Paper Lantern. Give an English poster prompt. Warranty is unconfirmed.',debugAi:true});
    if(approval==='open'){
      assert.equal(f.gate.count(),2);assert.equal(api.calls.length,2);
      assert.equal(r.result.debug.task_assessment.delivery,'repaired');
    }else if(approval==='awaiting'){
      assert.equal(f.gate.count(),0);assert.equal(api.calls.length,1);
      assert.equal(r.statusCode,503);assert.equal(r.result.outcome.providerStatus,'manual_qa_awaiting_approval');
    }else{
      assert.equal(f.gate.count(),12);assert.equal(api.calls.length,2);
      assert.equal(r.result.debug.validation_repair.status,'manual_qa_budget_exhausted');
      assert.equal(r.result.outcome.correctionStatus,'manual_qa_budget_exhausted');
      assert.equal(r.result.outcome.correctionDelivered,false);
      assert.match(r.result.answer,/approval|attempt budget/);
      assert.equal(r.result.debug.task_assessment.delivery,'relevant_limitation');
      assert.doesNotMatch(r.result.answer,/lifetime warranties/);
    }
  } finally { f.cleanup(); }
});

test('a failed repair transport still consumes its durable attempt without a third call',async()=>{
  const f=accountingFixture();
  try{
    f.gate.authorize(f.gate.hash);
    const api=make({reply:'Our shop offers lifetime warranties. Use the supplied photo to make the poster.',failAt:[2],providerHook:body=>f.gate.consume(body,f.context)});
    const r=await api.chat({activeCourseId:course._id,message:'Our shop is called Paper Lantern. Give an English poster prompt. Warranty is unconfirmed.',debugAi:true});
    assert.equal(f.gate.count(),2);assert.equal(api.calls.length,2);
    assert.equal(r.debug.task_assessment.delivery,'relevant_limitation');
  }finally{f.cleanup();}
});
