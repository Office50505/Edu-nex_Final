const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const id='6aa51e9769c836f66ddd3be7', lessonId='6aa51e9769c836f66ddd3bc5';
const {playlistProjection,playlistPayload}=require('../services/coursePlaylist');
function harness({subscription={status:'active',currentPeriodEnd:new Date(Date.now()+60000)},course={_id:id,status:'published',videos:[{_id:lessonId,provider:'aws_cloudfront',videoUrl:'https://d2vntxz4x493rp.cloudfront.net/course/master.m3u8'}]},trialCourse={_id:id},signingError=false}={}){
 const routes=[],grants=[];let queries=0;
 const checkModule={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/checkSubscription'),'utf8'),{module:checkModule,require:name=>{
  if(name.includes('subscriptionAccess'))return require('../services/subscriptionAccess');
  if(name.includes('courseAccess'))return require('../services/courseAccess');
  if(name.endsWith('/Subscription'))return {findOne:async()=>subscription};
  if(name.endsWith('/AppleSubscription')||name.endsWith('/GooglePlaySubscription'))return {findOne:async()=>null};
  if(name.endsWith('/Course'))return {findOne:()=>({sort:()=>({select:()=>({lean:async()=>trialCourse})})})};
  return {};
 },Date});
 const protect=()=>{},check=checkModule.exports.checkSubscription;
 const context={module:{exports:{}},process,URL,Buffer,require(name){
  if(name==='express')return {Router:()=>Object.fromEntries(['get','post','patch','delete','put'].map(m=>[m,(...args)=>routes.push(args)]))};
  if(name==='mongoose')return {Types:{ObjectId:{isValid:value=>/^[a-f0-9]{24}$/.test(value)}}};
  if(name.endsWith('/auth'))return {protect};
  if(name.endsWith('/checkSubscription'))return {checkSubscription:check};
  if(name.endsWith('/Course'))return {findById:()=>{queries++;return {select:projection=>{assert.equal(projection,playlistProjection);return {lean:async()=>course};}};}};
  if(name.endsWith('/coursePlaylist'))return {playlistProjection,playlistPayload};
  if(name.endsWith('/videoSources'))return {inferProvider:v=>v.provider};
  if(name.endsWith('/cloudFrontPlayback'))return {issueGrant:(url,identity)=>{if(signingError)throw Error('unavailable');grants.push(identity);return {hlsUrl:'/api/playback/hls.m3u8?grant=fixture',expiresAt:Date.now()+900000};}};
  if(/razorpay|paymentMode/.test(name))throw Error('Course startup must not load payment providers');
  return {};
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../routes/content'),'utf8'),context);
 const route=routes.find(r=>r[0]==='/courses/:id/lessons');assert.equal(route[1][0],protect);assert.equal(route[1][1],check);
 return {grants,queries:()=>queries,async call(playback='0'){
  const req={params:{id},query:playback===undefined?{}:{playback},user:{_id:'learner'},authSessionId:'current-session'};
  const res={code:200,headers:{},status(n){this.code=n;return this;},json(v){this.body=v;return this;},set(k,v){this.headers[k]=v;return this;}};
  let allowed=false;await check(req,res,()=>{allowed=true;});if(allowed)await route[2](req,res);return res;
 }};
}
test('authorized playlist includes selected lesson grant without a separate billing or authorization request',async()=>{
 const h=harness();const res=await h.call();assert.equal(res.code,200);assert.equal(h.queries(),1);assert.equal(h.grants.length,1);
 assert.equal(h.grants[0].sessionId,'current-session');assert.equal(h.grants[0].userId,'learner');assert.equal(h.grants[0].videoId,lessonId);
 assert.match(res.body.videos[0].hlsUrl,/grant=/);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['Referrer-Policy'],'no-referrer');
});
test('expired or absent subscriptions never read the course or issue a grant',async()=>{
 for(const subscription of [null,{status:'active',currentPeriodEnd:new Date(0)},{status:'trial',trialExpiresAt:new Date(0)}]){
  const h=harness({subscription});const res=await h.call();assert.equal(res.code,403);assert.equal(h.queries(),0);assert.equal(h.grants.length,0);
 }
});
test('legacy active subscriptions without an expiry retain access',async()=>{
 const h=harness({subscription:{status:'active'}});const res=await h.call();assert.equal(res.code,200);assert.equal(h.queries(),1);assert.equal(h.grants.length,1);
});
test('trial playback unlocks the same primary AI Influencer course shown first in the catalog',async()=>{
 const checkModule={exports:{}},queries=[];
 const aiCourse='111111111111111111111111',newerCourse='222222222222222222222222';
 vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/checkSubscription'),'utf8'),{module:checkModule,require:name=>{
  if(name.includes('subscriptionAccess'))return require('../services/subscriptionAccess');
  if(name.includes('courseAccess'))return require('../services/courseAccess');
  if(name.endsWith('/Subscription'))return {findOne:async()=>({status:'trial',trialExpiresAt:new Date(Date.now()+60000)})};
  if(name.endsWith('/AppleSubscription')||name.endsWith('/GooglePlaySubscription'))return {findOne:async()=>null};
  if(name.endsWith('/Course'))return {findOne:query=>{queries.push(query);return {sort:sort=>({select:()=>({lean:async()=>queries.length===1?{_id:aiCourse}: {_id:newerCourse}})})};}};
  return {};
 },Date});
 const req={params:{id:aiCourse},user:{_id:'trial-user'}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 let allowed=false;await checkModule.exports.checkSubscription(req,res,()=>{allowed=true;});
 assert.equal(allowed,true);
 assert.equal(queries.length,1);
});
test('playback authorization uses the same trial course selector as lesson startup',async()=>{
 const serviceModule={exports:{}};
 let checkedCourseId='';
 vm.runInNewContext(fs.readFileSync(require.resolve('../services/certificationService'),'utf8'),{module:serviceModule,require:name=>{
  if(name==='mongoose')return {Types:{ObjectId:{isValid:()=>true}}};
  if(name.endsWith('/Course'))return {};
  if(name.endsWith('/Subscription'))return {findOne:()=>({lean:async()=>({status:'trial',trialExpiresAt:new Date(Date.now()+60000)})})};
  if(name.endsWith('/AppleSubscription')||name.endsWith('/GooglePlaySubscription'))return {findOne:()=>({lean:async()=>null})};
  if(name.includes('subscriptionAccess'))return require('../services/subscriptionAccess');
  if(name.includes('courseAccess'))return require('../services/courseAccess');
  if(name.includes('checkSubscription'))return {isTrialUnlockedCourse:async courseId=>{checkedCourseId=String(courseId);return true;}};
  if(name.includes('adminFeatureSettings'))return {};
  if(name.includes('completionRules'))return {};
  return {};
 },Date,console});
 await serviceModule.exports.access({_id:'trial-user'},id);
 assert.equal(checkedCourseId,id);
});
test('a purchased course grants access without a subscription',async()=>{
 const checkModule={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/checkSubscription'),'utf8'),{module:checkModule,require:name=>name.includes('subscriptionAccess')?require('../services/subscriptionAccess'):name.includes('courseAccess')?require('../services/courseAccess'):/\/(?:Subscription|AppleSubscription|GooglePlaySubscription)$/.test(name)?{findOne:async()=>null}:name.endsWith('/Course')?{findOne:()=>({sort:()=>({select:()=>({lean:async()=>null})})})}:{},Date});
 const req={params:{id},user:{_id:'course-owner',subscriptionStatus:'none',purchasedCourses:[id]}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 let allowed=false;await checkModule.exports.checkSubscription(req,res,()=>{allowed=true;});
 assert.equal(allowed,true);assert.equal(req.courseAccess.type,'purchase');
});
test('course trial and yearly access expire while permanent access remains active',()=>{
 const {activeCourseEntitlement,activeCourseEntitlements}=require('../services/courseAccess');
 const now=Date.now();
 assert.equal(activeCourseEntitlement({courseEntitlements:[{course:id,accessType:'trial',expiresAt:new Date(now-1)}]},id,now),null);
 assert.equal(activeCourseEntitlement({courseEntitlements:[{course:id,accessType:'yearly',expiresAt:new Date(now+1000)}]},id,now).accessType,'yearly');
 assert.equal(activeCourseEntitlement({courseEntitlements:[{course:id,accessType:'permanent',expiresAt:null}]},id,now).accessType,'permanent');
 assert.deepEqual(activeCourseEntitlements({purchasedCourses:[id],courseEntitlements:[]},now),[{courseId:id,accessType:'permanent',expiresAt:null}]);
 assert.equal(activeCourseEntitlements({purchasedCourses:[id],courseEntitlements:[{course:id,accessType:'trial',expiresAt:new Date(now-1)}]},now).length,0);
});
test('admin-granted user access works without a payment subscription document',async()=>{
 const checkModule={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/checkSubscription'),'utf8'),{module:checkModule,require:name=>name.includes('subscriptionAccess')?require('../services/subscriptionAccess'):name.includes('courseAccess')?require('../services/courseAccess'):/\/(?:Subscription|AppleSubscription|GooglePlaySubscription)$/.test(name)?{findOne:async()=>null}:name.endsWith('/Course')?{findOne:()=>({sort:()=>({select:()=>({lean:async()=>null})})})}:{},Date});
 const req={user:{_id:'manual-user',subscriptionStatus:'active',subscriptionExpiry:new Date(Date.now()+60000)}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 let allowed=false;await checkModule.exports.checkSubscription(req,res,()=>{allowed=true;});
 assert.equal(allowed,true);assert.equal(req.subscription,null);assert.equal(req.subscriptionAccess.active,true);
});
test('draft courses cannot produce playlist grants, signing failure still returns usable lesson metadata',async()=>{
 const draft=harness({course:{_id:id,status:'draft',videos:[]}});assert.equal((await draft.call()).code,404);assert.equal(draft.grants.length,0);
 const broken=harness({signingError:true});const res=await broken.call();assert.equal(res.code,200);assert.equal(res.body.videos[0].hlsUrl,undefined);
});
test('lesson ID selects only the requested lesson, and Bunny remains unchanged',async()=>{
 const course={_id:id,status:'published',videos:[{_id:'bunny',provider:'bunny_stream',bunnyVideoId:'bunny-id'}, {_id:lessonId,provider:'aws_cloudfront',videoUrl:'https://d2vntxz4x493rp.cloudfront.net/course/master.m3u8'}]};
 const h=harness({course});const res=await h.call(lessonId);assert.equal(h.grants.length,1);assert.equal(h.grants[0].videoId,lessonId);assert.equal(res.body.videos[0].expiresAt,undefined);assert.ok(res.body.videos[1].expiresAt);
});
