require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {backend}=require('./ai-tutor-fixture.cjs');
const {requestTutorProvider}=require('../services/tutorProvider');
const previous=require('./fixtures/unified-course-catalog.json').courses;
const landing=require('./fixtures/landing-page-course.json');
const courses=[...previous,landing],viewing=previous.find(c=>c.slug==='ai-local-buisness-ads');
const user={_id:'merge-offline',purchasedCourses:[],fullName:'PRIVATE_MERGE_PROFILE',email:'PRIVATE_MERGE_EMAIL@example.invalid',mobileNumber:'9876543210',age:79,gender:'PRIVATE_MERGE_GENDER'};
const make=options=>backend({courses,user,unifiedKnowledge:true,console:{info(){},warn(){},log(){}},...options});
const input=message=>({message,courseId:viewing._id,lessonId:viewing.videos[1]._id,conversationId:'merge-check',debugAi:true});
const hookQuestion='Viral Hook Formula. My niche is repairing old radios. My audience is beginners. Give two hooks in English.';
const bad='1. Hook: 97% of creators use this method.\n2. Hook: Start with the actual first radio inspection.';
const good='1. Question Hook: What will the first radio inspection reveal?\n2. Visual Hook: Start with a close-up of the radio before the first check.\nPayoff: show the actual inspection and findings.';

test('unified provider context excludes automatic account data and private history while retaining learner project details',async()=>{
 const api=make({reply:'Use the supplied business details to plan the page, and verify the actual files before publishing.'});
 const r=await api.rawChat({...input('AI Se Landing Page Banao. Explain page planning for my fictional shop Copper Wheel in English.'),
  pagePath:'/profile/PRIVATE_MERGE_PATH',history:[{role:'assistant',content:'PRIVATE_MERGE_HISTORY',privateAccount:true},{role:'assistant',content:'Your Skillomate profile: PRIVATE_MERGE_LEGACY'}]});
 assert.equal(r.statusCode,200);assert.equal(api.calls.length,1);
 const payload=JSON.stringify(api.calls[0]);
 assert.doesNotMatch(payload,/PRIVATE_MERGE_|9876543210/);assert.match(payload,/Copper Wheel/);assert.match(payload,/AI Se Landing Page Banao/);
 const k=await api.service.buildContext(user,viewing._id,'Explain AI Se Landing Page Banao.',[],{unifiedKnowledge:true,learnerContext:{summary:'PRIVATE_MERGE_INJECTED'}});
 assert.doesNotMatch(k.context,/PRIVATE_MERGE_/);
 for(const view of k.courseViews)assert.doesNotMatch(view.knowledge.context,/PRIVATE_MERGE_/);
});
for(const consent of ['absent','declined','outdated'])test('unified inference requires current consent: '+consent,async()=>{
 const api=make({consent});const r=await api.rawChat(input(hookQuestion));
 assert.equal(r.statusCode,403);assert.equal(r.result.code,'AI_CONSENT_REQUIRED');assert.equal(api.calls.length,0);
});
test('withdrawing after unified generation prevents its repair from being sent',async()=>{
 let api;api=make({replies:[bad,good],async providerHook(_payload,n){if(n===1)await api.request('PUT','/consent',{granted:false});}});
 const r=await api.rawChat(input(hookQuestion));assert.equal(api.calls.length,1);assert.equal(r.statusCode,403);assert.equal(r.result.code,'AI_CONSENT_REQUIRED');assert.equal(r.result.answer,undefined);
});
test('length continuation rechecks consent before sending a second request',async()=>{
 const api=make();let attempts=0;
 await assert.rejects(requestTutorProvider({url:'https://offline.invalid',key:'fixture',payload:{messages:[{role:'system',content:'Fixture'}]},
  beforeRequest:()=>api.consent.service.requireAiConsent('learner'),extractText:r=>r.choices[0].message.content,
  fetchImpl:async()=>{attempts++;await api.request('PUT','/consent',{granted:false});return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({choices:[{finish_reason:'length',message:{content:'Incomplete fixture prefix'}}]})};},
 }),e=>e.code==='AI_CONSENT_REQUIRED');assert.equal(attempts,1);
});
test('long formatted assistant history survives with privacy filtering and the total budget',()=>{
 const api=make(),body='Exact formatted answer:\n\n'+('Keep this line unchanged.\n'.repeat(400));
 const result=api.service.sanitizeHistory([{role:'assistant',content:'PRIVATE_MERGE_HISTORY',privateAccount:true},{role:'assistant',content:body},{role:'user',content:'Continue the same task.'}]);
 assert.equal(result.length,2);assert.equal(result[0].content,body.trim());assert.ok(result[0].content.length>2000);assert.ok(result.reduce((n,x)=>n+x.content.length,0)<=64000);
});
test('notes-backed current-lesson summary remains local inside unified Nex AI',async()=>{
 const api=make({noKey:true});const r=await api.rawChat({message:'Summarize this lesson',courseId:landing._id,lessonId:landing.videos[0]._id});
 assert.equal(r.statusCode,200);assert.equal(api.calls.length,0);assert.match(r.result.answer,/saved lesson material/);assert.doesNotMatch(r.result.answer,/PRIVATE_MERGE_/);
});
