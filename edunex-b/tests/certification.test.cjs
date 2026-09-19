const test=require('node:test');const assert=require('node:assert/strict');
const rules=require('../services/completionRules');
const {renderCertificatePage}=require('../services/certificateTemplate');
const {heartbeat,eligibility,manifest,identity}=rules;
const user={isMobileVerified:true,fullName:'Test Learner'};
test('certificate template renders verified data and escapes learner content',()=>{
 const html=renderCertificatePage({certificateId:'SKM-123',userName:'A <Learner>',courseTitle:'AI & Media',issuedAt:'2026-09-18T00:00:00.000Z',totalLessons:34,status:'active'});
 assert.match(html,/A &lt;Learner&gt;/);assert.match(html,/AI &amp; Media/);assert.match(html,/34 Lessons/);assert.match(html,/VERIFIED RECORD/);assert.doesNotMatch(html,/{{[A-Z_]+}}/);
});
test('certificate template marks revoked certificates',()=>{
 const html=renderCertificatePage({certificateId:'REVOKED-1',userName:'Learner',courseTitle:'Course',issuedAt:'2026-09-18T00:00:00.000Z',status:'revoked'});
 assert.match(html,/is-revoked/);assert.match(html,/revoked-banner/);assert.match(html,/REVOKED RECORD/);
});
function sample(old,position,seconds=5,sessionId='s'){return heartbeat(old,{position,duration:100,now:seconds*1000,sessionId});}
test('first sample and seeking do not grant coverage',()=>{
 const first=sample(null,80);assert.deepEqual(first.intervals,[]);
 const next=sample(first,100,6);assert.deepEqual(next.intervals,[]);
});
test('continuous playback adds coverage; replay does not double count',()=>{
 let state=sample(null,0,0);state=sample(state,10,5);assert.equal(rules.covered(state.intervals,100),10);
 state=sample(state,0,10);state=sample(state,10,15);assert.equal(rules.covered(state.intervals,100),10);
});
test('long gaps and session changes anchor without credit',()=>{
 const first=sample(null,0,0);assert.deepEqual(sample(first,30,50).intervals,[]);
 assert.deepEqual(sample(first,10,5,'other').intervals,[]);
});
test('invalid duration, NaN and out-of-range position are rejected',()=>{
 for(const position of [NaN,-1,Infinity,500])assert.throws(()=>sample(null,position));
 assert.throws(()=>heartbeat(null,{position:1,duration:0,now:1,sessionId:'s'}));
});
test('90 percent coverage of every lesson is required, without rounded completion',()=>{
 const videos=Array.from({length:201},(_,i)=>({id:String(i),duration:100}));
 const rows=videos.slice(0,200).map(v=>({videoId:v.id,intervals:[[0,90]]}));
 assert.equal(eligibility({videos,rows,user}).eligible,false);
 rows.push({videoId:'200',intervals:[[0,89.99]]});assert.equal(eligibility({videos,rows,user}).eligible,false);
 rows.at(-1).intervals=[[0,90]];assert.equal(eligibility({videos,rows,user}).eligible,true);
});
test('course percentage stays stable when more lesson durations become known',()=>{
 const videos=Array.from({length:34},(_,index)=>({id:String(index),duration:index===0?100:0}));
 const rows=[{videoId:'0',intervals:[[0,100]]}];
 const before=eligibility({videos,rows,user});
 videos[1].duration=200;
 const after=eligibility({videos,rows,user});
 assert.equal(before.progressPercent,3);
 assert.equal(after.progressPercent,3);
 assert.equal(after.completedLessons,1);
});
test('empty courses, unverified profiles and missing assessment pass block issuance',()=>{
 assert.equal(eligibility({videos:[],rows:[],user}).eligible,false);
 const options={videos:[{id:'a',duration:100}],rows:[{videoId:'a',intervals:[[0,100]]}],user};
 assert.equal(eligibility({...options,user:{fullName:'A'}}).eligible,false);
 assert.equal(eligibility({...options,user:{isMobileVerified:true}}).eligible,false);
 assert.equal(eligibility({...options,questions:[{}]}).eligible,false);
 assert.equal(eligibility({...options,questions:[{}],assessment:{score:70,passed:true}}).eligible,true);
});
test('unrecognized and legacy completion IDs provide no evidence',()=>{
 const result=eligibility({videos:[{id:'a',duration:100}],rows:[{videoId:'other',intervals:[[0,100]],completed:true},{videoId:'a',watchedSeconds:100}],user});assert.equal(result.eligible,false);
});
test('criteria changes create a new version while cosmetic title changes do not',()=>{
 const course={videos:[{_id:'a',title:'One',duration:100}]};const one=manifest(course,{});
 assert.equal(one.version,manifest({...course,title:'Rename'},{}).version);
 assert.notEqual(one.version,manifest({videos:[{_id:'a',duration:101}]},{}).version);
 assert.notEqual(one.version,manifest({videos:[{_id:'a',duration:100,videoUrl:'new-source'}]},{}).version);
 assert.notEqual(one.version,manifest(course,{questions:[{prompt:'Q',options:['A','B'],answer:0}]}).version);
 assert.equal(identity('user','course',one.version),identity('user','course',one.version));
 assert.notEqual(identity('user','course',one.version),identity('other','course',one.version));
});
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(options={}){
 const stored=new Map();
 const course={_id:'course',title:'Course',status:'published',videos:[{_id:'a',duration:100}]};
 const query=value=>({lean:async()=>value});
 const subscription=Object.prototype.hasOwnProperty.call(options,'subscription') ? options.subscription : {status:'active',currentPeriodEnd:new Date(Date.now()+60000)};
 const models={Course:{findOne:()=>({select:projection=>{assert.equal(projection,'-thumbnail -thumbnailHorizontal -thumbnailVertical -videos.thumbnail');return query(course);}})},CertificationPolicy:{findById:()=>query(null)},LearningProgress:{find:()=>query([])},AssessmentResult:{findById:()=>query(null)},Subscription:{findOne:()=>query(subscription)},Certificate:{findOneAndUpdate:({_id},update)=>{const key=String(_id);if(!stored.has(key))stored.set(key,{_id:key,...update.$setOnInsert});return query(stored.get(key));}}};
 const sandbox={module:{exports:{}},require(name){if(name==='node:crypto')return require('node:crypto');if(name==='mongoose')return{Types:{ObjectId:class{constructor(id){this.id=id;}toString(){return this.id;}static isValid(){return true;}}}};if(name.includes('completionRules'))return rules;if(name.includes('subscriptionAccess'))return require('../services/subscriptionAccess');if(name.includes('courseAccess'))return require('../services/courseAccess');return models[name.split('/').at(-1)]||{};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/certificationService.js'),'utf8'),sandbox);
 return{api:sandbox.module.exports,stored,course};
}
test('completion endpoint cannot bypass evidence',async()=>{
 const {api}=harness();await assert.rejects(api.completeVideo({user:{_id:'u',...user},courseId:'course',videoId:'a'}),e=>e.statusCode===409);
});
test('entitlement check honors mobile-compatible user access when subscription row is absent',async()=>{
 const {api}=harness({subscription:null});
 await api.access({_id:'u',subscriptionStatus:'subscribed'});
 await api.access({_id:'u',subscriptionStatus:'active',subscriptionExpiry:new Date(Date.now()+60000)});
 await assert.rejects(api.access({_id:'u',subscriptionStatus:'active',subscriptionExpiry:new Date(Date.now()-60000)}),e=>e.statusCode===403);
 await assert.rejects(api.access({_id:'u',subscriptionStatus:'none'}),e=>e.statusCode===403);
});
test('repeated issuance shares a deterministic primary key and never restores revoked records',async()=>{
 const {api,stored,course}=harness();const ctx={course,version:'v1'},status={eligible:true,totalLessons:1,assessmentRequired:false};
 const [a,b]=await Promise.all([api.issue({_id:'u',...user},ctx,status),api.issue({_id:'u',...user},ctx,status)]);
 assert.equal(a.certificateId,b.certificateId);assert.equal(stored.size,1);
 stored.values().next().value.status='revoked';assert.equal((await api.issue({_id:'u',...user},ctx,status)).status,'revoked');
 assert.equal(await api.issue({_id:'u',...user},ctx,{eligible:false}),null);
});

test('compatibility and certification modules load together',()=>{
 const compatibility=require('../services/mobileCompatibilityService');
 assert.equal(typeof compatibility.trackEvent,'function');
 assert.equal(typeof compatibility.updateVideoProgress,'function');
 assert.equal(typeof require('../routes/certification'),'function');
});

test('learner certificate DTO omits private email and admin audit notes',()=>{
 const {certificateView}=require('../services/certificationService');
 const value=certificateView({_id:'a',certificateId:'b',userEmail:'private@example.test',audit:[{reason:'internal'}],userName:'Learner'});
 assert.equal(value.userEmail,undefined);assert.equal(value.audit,undefined);assert.equal(value.learnerName,'Learner');
});

test('progress context excludes image blobs while preserving the completion version',async()=>{
 const {api,course}=harness();
 course.videos[0].videoUrl='https://example.test/lesson.mp4';
 course.completionOrder=['a'];
 const expected=rules.manifest(course,null);
 const actual=await api.context({_id:'u'},'course');
 assert.equal(actual.version,expected.version);
 assert.equal(actual.course.videos[0].duration,100);
 assert.equal(actual.course.videos[0].videoUrl,course.videos[0].videoUrl);
});

test('automatic duration discovery carries saved playback into the new course version',async(t)=>{
 const Learning=require('../models/LearningProgress');
 const Course=require('../models/Course');
 const service=require('../services/certificationService');
 const originalFind=Learning.find,originalBulkWrite=Learning.bulkWrite,originalFindById=Course.findById;
 t.after(()=>{Learning.find=originalFind;Learning.bulkWrite=originalBulkWrite;Course.findById=originalFindById;});
 Learning.find=()=>({lean:async()=>[{userId:'u',courseId:'course',version:'old',videoId:'a',intervals:[[0,92]],position:92,revision:3}]});
 Course.findById=()=>({select:()=>({lean:async()=>({videos:[{_id:'a'}]})})});
 let operations=[];
 Learning.bulkWrite=async(value)=>{operations=value;return{upsertedCount:value.length};};
 assert.equal(await service.migrateLearningVersion('course','old','new'),1);
 assert.equal(operations.length,1);
 assert.deepEqual(operations[0].updateOne.update.$setOnInsert.intervals,[[0,92]]);
 assert.equal(operations[0].updateOne.update.$setOnInsert.version,'new');
});
