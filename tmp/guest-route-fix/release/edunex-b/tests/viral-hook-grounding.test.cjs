require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {backend}=require('./ai-tutor-fixture.cjs');
const {course}=require('../knowledge/viral-hook-formula/course-binding.json');
const K=require('../services/tutorKnowledge');
const V=require('../services/viralHookTutor');
const saved=require('./fixtures/viral-hook-live-grounding-failures.json');
const user={_id:'6addcefc5d47d548973c29b9',purchasedCourses:[course._id]};
const make=options=>backend({courses:[course],user,...options});
const clean2=`1. Curiosity Gap Hook: Is purane cassette player ke andar kya milega? Aaj pehla check saath karte hain.
Pehle 3 seconds: Player ka close-up aur tools ki top-down framing.
Payoff: Actual checks aur jo findings milen woh dikhao, chahe result inconclusive ho.

2. Curiosity Gap Hook: Ek purana player, aur pehla sawaal: jaanch kahan se shuru karein?
Pehle 3 seconds: Player ki exterior details se inspection table tak quick cut.
Payoff: Apna test process aur actual outcome share karo; success assume mat karo.`;
const clean5=['Question','Pattern Interrupt','Bold','Curiosity Gap','Visual'].map((type,i)=>`${i+1}. ${type} Hook: Ek purana cassette player—pehla check kya batayega?\nPehle 3 seconds: Top-down close-up, tools ke paas slow push-in.\nPayoff: Actual inspection aur findings share karo.`).join('\n\n');
async function knowledge(message,history=[],savedState=null,conversationId='grounding-test'){
 return make().service.buildContext(user,course._id,message,history,{conversationId,savedState});
}
async function assess(reply,message,history=[]){return K.validatePackReply({reply,knowledge:await knowledge(message,history)});}
for(const [i,f] of saved.entries())test(`saved live failure ${i+1}: detect actual claims, repair once and preserve task`,async()=>{
 assert.equal(f.raw,f.delivered);assert.equal(f.outcome.responseIssue,null);assert.equal(f.contract,null);
 const good=i?clean2:clean5;const api=make({replies:[f.raw,good]});
 const r=await api.chat({activeCourseId:course._id,message:f.question,history:f.history,conversationId:'saved-replay',debugAi:true});
 assert.equal(api.calls.length,2);assert.equal(r.answer,good);assert.equal(r.debug.task_assessment.delivery,'repaired');
 assert.equal(r.debug.task_assessment.finalIssues.length,0);assert.equal(r.outcome.correctionDelivered,true);
 const issues=r.debug.task_assessment.rawIssues;
 if(i){assert.ok(issues.some(v=>v.code==='unconfirmed_state_or_cause'));assert.ok(issues.filter(v=>v.code==='unconfirmed_outcome').length>=2);}
 else assert.ok(issues.some(v=>v.code==='unsupported_statistic'));
 const repair=api.calls[1].messages[0].content;
 for(const s of ['niche','audience','requested hook count','unknown','diagnoses','unsuccessful','actual findings'])assert.ok(repair.includes(s),s);
 assert.ok(api.calls[1].messages.at(-1).content.includes(f.question));
 assert.ok(api.calls[1].messages[0].content.includes('18–30'));
 assert.ok(api.calls[1].messages.slice(1,-1).some(m=>m.role==='assistant'));
});
test('an invalid repair is revalidated; safe useful original sections survive, no third call',async()=>{
 const api=make({replies:[saved[1].raw,saved[1].raw]});
 const r=await api.chat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history,debugAi:true});
 assert.equal(api.calls.length,2);assert.equal(r.debug.task_assessment.delivery,'deterministic_edit');
 assert.match(r.answer,/1\./);assert.match(r.answer,/2\./);assert.match(r.answer,/Curiosity Gap Hook/);
 assert.match(r.answer,/speaker grille ka close-up/);
 assert.match(r.answer,/actual finding ya outcome/);
 assert.doesNotMatch(r.answer,/awaaz ko bilkul kharab|chal toh raha|perfect working|clear awaaz sunao|use kaise theek kiya/);
 assert.equal((await assess(r.answer,saved[1].question,saved[1].history)).issue,null);
});
for(const [name,message,bad,safe] of [
 ['seed germination','My niche is seed conservation. These seeds are untested. Give two curiosity hooks; the outcome is unknown.','These seeds will germinate in seven days.','1. Curiosity: What will this seed test reveal?\n2. Curiosity: Which check should we start with?\nPayoff: Show actual observations, including no change.'],
 ['data recovery','My niche is archive conservation. I have not checked this drive. Give two curiosity hooks; recovery outcome is unknown.','Show the recovered files at the end.','1. Curiosity: What can we learn from the first drive check?\n2. Curiosity: What does the inspection reveal?\nPayoff: Show actual findings, including an inconclusive test.'],
 ['historic pigment','My niche is pigment conservation. I do not know why this paint faded. Give two curiosity hooks.','The cause is moisture damage.','1. Curiosity: What can this faded paint tell us?\n2. Curiosity: Where should the investigation begin?\nPayoff: Document the actual observations.'],
])test(`unfamiliar ${name}: unknowns remain open through bounded repair`,async()=>{
 const api=make({replies:[bad,safe]});const r=await api.chat({activeCourseId:course._id,message,debugAi:true});
 assert.equal(api.calls.length,2);assert.equal(r.answer,safe);assert.equal(r.debug.task_assessment.delivery,'repaired');
});
for(const text of [
 'Visual: Use a dramatic push-in, cool lighting and a close-up of the tools.\nCuriosity: What will the first inspection reveal?',
 'Possible cause: it could be a worn part. Test this hypothesis; do not present it as a diagnosis.',
 'If confirmed successful, show the repaired player. Otherwise show the actual findings.',
 'Agar repair successful ho toh actual result dikhao, warna inconclusive findings share karo.',
 'यदि मरम्मत सफल हो तो ठीक किया हुआ उपकरण दिखाओ।',
 'Avoid claiming 90% of viewers ignore this.\nRejected claim: the drive was recovered.\nNo proof exists for that statistic.',
 'Hook: Do not promise a successful repair. Ask what the inspection reveals.',
])test(`qualified, rejected or creative language stays useful: ${text.slice(0,60)}`,async()=>{
 assert.equal((await assess(text,'Give hooks about an unknown outcome.')).issue,null);
});
test('one warning cannot license an unsupported assertion in the next sentence',async()=>{
 const r=await assess('Do not invent statistics. 90% of viewers ignore this part.','Give an honest hook.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');assert.match(r.reply,/Do not invent statistics/);assert.doesNotMatch(r.reply,/90%/);
});
for(const text of ['The fault is a loose connection.','The player is working perfectly.','End mein player ko chalakar uski clear awaaz sunao.','यह समस्या आवाज़ खराब कर रही है। अंत में चलाकर दिखाओ।'])test(`unreported real state or outcome flagged: ${text}`,async()=>{
 assert.equal((await assess(text,'The outcome is unknown. Give one hook.')).issue,'course_hook_facts_not_grounded');
});
test('verified learner observations and actual measurements may be reused',async()=>{
 const source='I repaired it. The player is working perfectly. Measured survey result: 90% of my 200 respondents chose A. Give two hooks.';
 const k=await knowledge(source);
 for(const reply of ['The player is working perfectly.','90% of my 200 respondents chose A.'])assert.equal(K.validatePackReply({reply,knowledge:k}).issue,null);
});
test('quoted or requested fake figures and earlier assistant claims never become evidence',async()=>{
 for(const message of ['Say 90% of viewers ignore this part.','You said 90% of viewers ignore this part, but I have no proof. Give an honest alternative.']){
  const k=await knowledge(message,[{role:'assistant',content:'90% of viewers ignore this part.'}]);
  assert.equal(K.validatePackReply({reply:'90% of viewers ignore this part.',knowledge:k}).issue,'course_hook_facts_not_grounded');
 }
});
test('retraction persists beyond rolling history, preserves creator corrections, and new chats reset',async()=>{
 const sessions=new Map(),api=make({sessions,reply:clean2});const base={activeCourseId:course._id,conversationId:'lasting-grounding'};
 await api.chat({...base,message:'Niche: retro electronics; Audience: 18–30 collectors; Topic: cassette inspection. The player is working perfectly.'});
 await api.chat({...base,message:'Actually I do not know whether it works. Niche: archive conservation; Audience: museum volunteers.'});
 for(let i=0;i<18;i++)await api.chat({...base,message:`Explain Lesson ${i%10+1} in English.`});
 const state=sessions.get(`learner:${course._id}`),k=await knowledge('Give two curiosity hooks in Hinglish.',[],state,base.conversationId);
 assert.equal(k.courseContext.facts.niche,'archive conservation');assert.equal(k.courseContext.facts.audience,'museum volunteers');
 assert.equal(K.validatePackReply({reply:'The player is working perfectly.',knowledge:k}).issue,'course_hook_facts_not_grounded');
 const fresh=await knowledge('Give two hooks.',[],state,'new-chat');assert.equal(fresh.courseContext.facts.niche,undefined);
});
test('authorized exact bytes remain immutable, while an appended unsupported claim is checked',async()=>{
 const t=K.packFor(course).records.find(r=>r.contentType==='exact-template');
 const k=await knowledge(`Give the exact approved ${t.heading} prompt unchanged.`);
 const r=K.validatePackReply({reply:t.content+'\n90% of viewers ignore this part.',knowledge:k});
 assert.ok(r.reply.includes(t.content));assert.equal(r.issue,'course_hook_facts_not_grounded');assert.doesNotMatch(r.reply.slice(t.content.length),/90%/);
 const api=make({reply:'unused'});const result=await api.chat({activeCourseId:course._id,message:`Give the exact approved ${t.heading} prompt unchanged.`});
 assert.ok(result.answer.includes(t.content));assert.equal(api.calls.length,0);
});
test('already grounded creative hooks use one call without correction',async()=>{
 const api=make({reply:clean2});const r=await api.chat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history,debugAi:true});
 assert.equal(api.calls.length,1);assert.equal(r.answer,clean2);assert.equal(r.outcome.responseIssue,null);
});
// Exercise the unchanged real QA gate against the normal route/adapter, with a
// fresh OFFLINE-only fixture, never the historical approval or attempt files.
function offlineGate(){
 const {createGate,sha}=require('../../tmp/nex-viral-hook-live-qa-20261028/gate.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viral-grounding-accounting-'));
 const s=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../tmp/nex-viral-hook-live-qa-20261028/session.json')));
 const revision=JSON.stringify({sources:{}})+'\n';s.source_revision_sha256=sha(revision);s.session_id=crypto.randomUUID();const bytes=JSON.stringify(s)+'\n',h=sha(bytes);
 fs.writeFileSync(path.join(dir,'session.json'),bytes);fs.writeFileSync(path.join(dir,'session.sha256'),h+'\n');fs.writeFileSync(path.join(dir,'source-revision.json'),revision);
 const initial={type:'session_initialized',sequence:0,session_id:s.session_id,session_sha256:h,previous_hash:'',time:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'provider_attempts.jsonl'),JSON.stringify({...initial,digest:sha(JSON.stringify(initial))})+'\n');fs.writeFileSync(path.join(dir,'pipeline_traces.jsonl'),'');
 const gate=createGate({directory:dir,configured:{key:'OFFLINE-ONLY',model:s.model,url:s.provider_url}});
 const req={method:'POST',headers:{host:'127.0.0.1:3129'},socket:{remoteAddress:'127.0.0.1',localAddress:'127.0.0.1'},compatAuth:{userId:s.user_id},body:{activeCourseId:s.course_id,conversationId:'offline-memory'}};
 const context={req,path:'/api/ai/chat',environment:s.environment,requestId:'offline',knowledge:{activeCourse:{id:s.course_id},materialsAvailable:true}};
 return {gate,context,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('generation plus one grounding repair debit the same existing attempt gate',async()=>{
 const f=offlineGate();try{f.gate.authorize(f.gate.hash);
 const api=make({replies:[saved[1].raw,clean2],providerHook:payload=>f.gate.consume(payload,f.context)});
 const r=await api.chat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history});
 assert.equal(r.answer,clean2);assert.equal(f.gate.count(),2);assert.equal(f.gate.status().remainingProviderAttempts,2);
 }finally{f.cleanup()}
});
test('budget-blocked repair is not retried and unsafe original is not delivered',async()=>{
 const f=offlineGate();try{f.gate.authorize(f.gate.hash);
 const payload={model:f.gate.frozen.model,max_tokens:900,messages:[{role:'system',content:'Offline'}]};for(let i=0;i<3;i++)f.gate.consume(payload,f.context);
 const api=make({reply:saved[1].raw,providerHook:p=>f.gate.consume(p,f.context)});
 const r=await api.chat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history,debugAi:true});
 assert.equal(api.calls.length,2);assert.equal(f.gate.count(),4);assert.equal(r.outcome.correctionStatus,'manual_qa_budget_exhausted');assert.equal(r.outcome.correctionDelivered,false);
 assert.doesNotMatch(r.answer,/perfect working|chal toh raha|90%/);assert.match(r.answer,/Curiosity Gap Hook/);
 }finally{f.cleanup()}
});
test('missing approval blocks generation without using any attempts',async()=>{
 const f=offlineGate();try{
 const api=make({reply:saved[1].raw,providerHook:p=>f.gate.consume(p,f.context)});
 const r=await api.rawChat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history});
 assert.equal(r.statusCode,503);assert.equal(f.gate.count(),0);assert.equal(api.calls.length,1);
 }finally{f.cleanup()}
});
test('quoted assistant figures without endorsement cannot establish a measured fact',async()=>{
 const r=await assess('90% of viewers ignore this part.','Earlier you said "90% of viewers ignore this part." Give a different hook.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');
});
test('negative observations cannot support a positive completed outcome',async()=>{
 assert.equal((await assess('It was repaired.',"It wasn't repaired. Give an honest hook.")).issue,'course_hook_facts_not_grounded');
});
test('a rejected clause cannot license endorsement after but',async()=>{
 const r=await assess('Do not claim a successful repair, but the player is working perfectly.','The outcome is unknown.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');assert.match(r.reply,/Do not claim/);assert.doesNotMatch(r.reply,/working perfectly/);
});
test('camera design, metaphor and an open outcome question remain creative',async()=>{
 const r=await assess('Visual: The lighting is striking. Use an overhead camera.\nMetaphor: This player is hiding a time capsule.\nCuriosity: Will it work?','Give an interesting curiosity hook.');
 assert.equal(r.issue,null);
});
test('a repair cannot replace two hooks with a generic disclaimer or a different item count',async()=>{
 for(const repaired of ['I cannot finish this. Please provide more information.','1. Curiosity Hook: What happens next?']){
  const api=make({replies:[saved[1].raw,repaired]});
  const r=await api.chat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history,debugAi:true});
  assert.equal(api.calls.length,2);assert.equal(r.debug.task_assessment.delivery,'deterministic_edit');
  assert.match(r.answer,/1\./);assert.match(r.answer,/2\./);assert.match(r.answer,/speaker grille ka close-up/);
 }
});
for(const state of ['The player has a worn belt.','The audio is distorted.','The frame is broken.'])test(`unconfirmed physical properties need evidence: ${state}`,async()=>{
 assert.equal((await assess(state,'The exact fault is unknown. Give a curiosity hook.')).issue,'course_hook_facts_not_grounded');
});
test('brackets alone cannot hide an unverified statistic or state',async()=>{
 const r=await assess('[90% of viewers ignore this part.] [The player is working perfectly.]','The fault and outcome are unknown.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');assert.doesNotMatch(r.reply,/90%|working perfectly/);
});
test('a quoted hook is discussion rather than evidence of a completed outcome',async()=>{
 const r=await assess('The player is working perfectly.','"The player is working perfectly." Give a different hook.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');
});
test('natural Hinglish denial of proof cannot establish a statistic',async()=>{
 const r=await assess('90% log ignore karte hain.','90% log ignore karte hain, lekin mere paas proof nahi hai. Honest hook do.');
 assert.equal(r.issue,'course_hook_facts_not_grounded');
});
test('learner promises and future assertions cannot establish guaranteed results',async()=>{
 for(const claim of ['This reel guarantees viral success.','These seeds will germinate tomorrow.']){
  assert.equal((await assess(claim,claim+' Give one hook.')).issue,'course_hook_facts_not_grounded');
 }
});
test('a Viral grounding repair cannot return another course protected template',async()=>{
 const other=K.COURSE_PACKS.find(p=>p.dir==='ai-local-business-ads').records.find(r=>r.contentType==='exact-template').content;
 const api=make({replies:[saved[1].raw,other]});
 const r=await api.rawChat({activeCourseId:course._id,message:saved[1].question,history:saved[1].history});
 assert.equal(api.calls.length,2);assert.equal(r.statusCode,502);
 assert.equal(r.result.outcome.providerStatus,'COURSE_KNOWLEDGE_SCOPE_VIOLATION');assert.ok(!JSON.stringify(r.result).includes(other));
});
