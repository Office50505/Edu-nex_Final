const test=require('node:test');const assert=require('node:assert/strict');
const rules=require('../services/completionRules');
const {heartbeat,eligibility,manifest,identity}=rules;
const user={isMobileVerified:true,fullName:'Test Learner'};
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
function harness(){
 const stored=new Map();
 const course={_id:'course',title:'Course',status:'published',videos:[{_id:'a',duration:100}]};
 const query=value=>({lean:async()=>value});
 const models={Course:{findOne:()=>query(course)},CertificationPolicy:{findById:()=>query(null)},LearningProgress:{find:()=>query([])},AssessmentResult:{findById:()=>query(null)},Subscription:{findOne:()=>query({status:'active',currentPeriodEnd:new Date(Date.now()+60000)})},Certificate:{findOneAndUpdate:({_id},update)=>{const key=String(_id);if(!stored.has(key))stored.set(key,{_id:key,...update.$setOnInsert});return query(stored.get(key));}}};
 const sandbox={module:{exports:{}},require(name){if(name==='node:crypto')return require('node:crypto');if(name==='mongoose')return{Types:{ObjectId:class{constructor(id){this.id=id;}toString(){return this.id;}static isValid(){return true;}}}};if(name.includes('completionRules'))return rules;return models[name.split('/').at(-1)]||{};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/certificationService.js'),'utf8'),sandbox);
 return{api:sandbox.module.exports,stored,course};
}
test('completion endpoint cannot bypass evidence',async()=>{
 const {api}=harness();await assert.rejects(api.completeVideo({user:{_id:'u',...user},courseId:'course',videoId:'a'}),e=>e.statusCode===409);
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
