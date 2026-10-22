'use strict';
// Evaluation boundary only: unmodified route, auth, service and provider prompts.
// Real DB models are replaced with synthetic records and memory-only session storage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const backend=process.cwd();
const localRequire=createRequire(path.join(backend,'package.json'));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const originalFetch=globalThis.fetch;
const PRODUCT_ID='6d0000000000000000000000',OTHER_ID='6e0000000000000000000000',UNKNOWN_ID='6f0000000000000000000000';
const {PRODUCT_RECORDS}=localRequire('./services/productTutorKnowledge');
const courses=[{_id:PRODUCT_ID,slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',status:'published',
 description:'Learn product photos, videos and honest product advertisements.',
 videos:PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').map(r=>({_id:'6d00000000000000000000'+String(r.lessonNumber).padStart(2,'0'),title:r.heading,description:r.content}))},
 {_id:OTHER_ID,slug:'ai-influencer',title:'AI Influencer',status:'published',description:'Synthetic unrelated course. ISOLATION_SENTINEL_RAVEN_42 belongs only to this other course.',videos:[]}];

function providerConfiguration(){
 const endpoint='https://fal.run/openrouter/router/openai/v1/chat/completions';
 const key='synthetic-offline-regression-key',model='google/gemini-2.5-flash';
 return {providerEnv:{FAL_API_KEY:key,FAL_OPENROUTER_MODEL:model,FAL_OPENROUTER_URL:endpoint},endpoint,key,model};
}
const stage=process.env.ISOLATION_STAGE||'after';
const baselineRoot=path.join(__dirname,'baseline_source');
let baselineKnowledge;
if(stage==='before'){
 const filename=path.join(backend,'services/tutorKnowledge.js');
 const m={exports:{}};
 const req=createRequire(filename);
 vm.runInNewContext(fs.readFileSync(path.join(baselineRoot,'services/tutorKnowledge.js'),'utf8'),{require:req,module:m,__dirname:path.dirname(filename)},{filename:'baseline/tutorKnowledge.js'});
 baselineKnowledge=m.exports;
}

async function makeApp(spec){
 const {providerEnv,endpoint,key,model}=providerConfiguration();
 const mongoose=localRequire('mongoose'),jwt=localRequire('jsonwebtoken');
 const signingKey=crypto.randomBytes(32).toString('hex');
 const sessions=new Map(),logs=[],providerRequests=[],dbOperations=[],users=new Map();
 const entitlement=spec.access||'active';
 for(const actor of ['A','B']){
  const id=sha(spec.id+':'+actor).slice(0,24);
  users.set(id,{_id:id,isActive:true,activeSessionId:'synthetic-session-'+actor,fullName:'Synthetic Learner '+actor,
   subscriptionStatus:entitlement==='active'?'active':'none',purchasedCourses:[],courseEntitlements:[],wishlist:[]});
 }
 const actorId=actor=>sha(spec.id+':'+(actor||'A')).slice(0,24);
 const query=value=>({select(){return this},populate(){return this},sort(){return this},limit(){return this},lean:async()=>value});
 const memorySession={
  findOne(filter){dbOperations.push({model:'AiTutorSession',operation:'findOne',filter});return query(sessions.get(`${filter.user}:${filter.course}`)||null)},
  async findOneAndUpdate(filter,update){dbOperations.push({model:'AiTutorSession',operation:'upsert',filter});sessions.set(`${filter.user}:${filter.course}`,structuredClone(update));return update},
  async deleteMany(filter){let count=0;for(const k of sessions.keys())if(k.startsWith(String(filter.user)+':')){sessions.delete(k);count++}dbOperations.push({model:'AiTutorSession',operation:'deleteMany',filter,count});return {deletedCount:count}},
 };
 const models={
  Course:{find:filter=>query(courses.filter(c=>(!filter.status||c.status===filter.status)&&(!filter._id||String(c._id)===String(filter._id))&&(!filter.slug||c.slug===filter.slug)))},
  User:{findById:id=>query(users.get(String(id))||null),updateOne:async()=>({modifiedCount:0})},
  AiTutorSession:memorySession,AiResponseReport:{create:async()=>({synthetic:true})},
  Subscription:{findOne:()=>query(entitlement==='active'?{status:'active',currentPeriodEnd:new Date(Date.now()+86400000)}:entitlement==='expired'?{status:'expired',currentPeriodEnd:new Date(Date.now()-86400000)}:null)},
  AppleSubscription:{findOne:()=>query(null)},GooglePlaySubscription:{findOne:()=>query(null)},Order:{findOne:()=>query(null)},
 };
 const providerFetch=async(url,request)=>{
  if(String(url)!==endpoint)throw Error('Forbidden outbound provider destination');
  const payload=JSON.parse(request.body);
  if(payload.model!==model)throw Error('Unexpected configured-model change');
  if(key&&request.body.includes(key))throw Error('Secret appeared in model payload');
  const evidence={index:providerRequests.length+1,startedAt:new Date().toISOString(),requestSha256:sha(request.body),request:payload,promptModified:false,recordedFixture:false};
  providerRequests.push(evidence);const started=Date.now();
  try{
   const response=await originalFetch(url,{...request,redirect:'error'});
   evidence.httpStatus=response.status;
   const rawBody=await response.clone().text();
   evidence.rawResponseBody=key?rawBody.split(key).join('[REDACTED_PROVIDER_CREDENTIAL]'):rawBody;
   if(response.ok){
    const data=JSON.parse(evidence.rawResponseBody);evidence.rawModelResponse=data.choices?.[0]?.message?.content||data.output||data.text||data.response||data.answer||'';
    evidence.finishReason=data.choices?.[0]?.finish_reason||null;evidence.usage=data.usage||null;
   }
   return response;
  }catch(error){evidence.error={name:error.name,code:error.cause?.code||error.code||null};throw error}
  finally{evidence.durationMs=Date.now()-started;evidence.completedAt=new Date().toISOString()}
 };
 const serviceModule={exports:{}},authModule={exports:{}},complianceModule={exports:{}};
 const sandboxRequire=name=>{
  if(name==='express')return localRequire('express');
  if(name==='mongoose')return mongoose;
  if(name==='jsonwebtoken')return jwt;
  if(name==='node:crypto'||name==='crypto')return crypto;
  if(name.includes('aiTutorService'))return serviceModule.exports;
  if(name.includes('compatAuth'))return authModule.exports;
  if(name.includes('aiCompliance'))return complianceModule.exports;
  const modelName=name.match(/(?:^|\/)models\/([^/]+)$/)?.[1];
  if(modelName){if(!models[modelName])throw Error('Unexpected real-model boundary: '+modelName);return models[modelName]}
  if(name.startsWith('../services/'))return localRequire('./services/'+name.split('/').pop());
  if(stage==='before'&&name==='./tutorKnowledge')return baselineKnowledge;
  if(name.startsWith('./'))return localRequire('./services/'+name.slice(2));
  throw Error('Unexpected assessment dependency: '+name);
 };
 const sandbox={require:sandboxRequire,module:{exports:{}},AbortSignal,process:{env:{...providerEnv,JWT_SECRET:signingKey}},
  console:{info:(...a)=>logs.push({level:'info',text:a.join(' ')}),warn:(...a)=>logs.push({level:'warn',text:a.join(' ')})},fetch:providerFetch};
 for(const [file,module]of [['middleware/compatAuth.js',authModule],['services/aiCompliance.js',complianceModule],['services/aiTutorService.js',serviceModule]]){
  vm.runInNewContext(fs.readFileSync(path.join(stage==='before'&&file==='services/aiTutorService.js'?baselineRoot:backend,file),'utf8'),{...sandbox,module},{filename:file});
 }
 vm.runInNewContext(fs.readFileSync(path.join(stage==='before'?baselineRoot:backend,'routes/ai.js'),'utf8'),sandbox,{filename:'routes/ai.js'});
 const express=localRequire('express'),http=require('node:http');const app=express();app.use(express.json());app.use('/api/ai',sandbox.module.exports);
 const server=http.createServer(app);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const base='http://127.0.0.1:'+server.address().port;
 return {
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))},
  async chat(turn,history=[],turnIndex=1){
   const start=Date.now(),captureStart=providerRequests.length,logStart=logs.length,dbStart=dbOperations.length;
   const actor=turn.actor||'A',id=actorId(actor);const mode=turn.auth||spec.auth||'valid';
   let token=jwt.sign({userId:id,sessionId:mode==='invalid_session'?'wrong-session':'synthetic-session-'+actor},signingKey,{expiresIn:mode==='expired'?-5:3600});
   if(mode==='invalid')token='invalid.synthetic.token';
   const headers={'Content-Type':'application/json'};if(mode!=='missing')headers.Authorization='Bearer '+token;
   const courseRef=turn.course||'product';const courseId=courseRef==='product'?PRODUCT_ID:courseRef==='other'?OTHER_ID:UNKNOWN_ID;
   const body={message:turn.message,history:turn.omitHistory?[]:history,debugAi:true,assistantName:'Skillomate AI',pagePath:'/courses/ai-product-photoshoot-ads',
    ...(turn.noCourseScope?{}:{courseId}),...(turn.noConversationId?{}:{conversationId:turn.conversation||spec.id+'-conversation'})};
   if(turn.lesson)body.lessonId='6d00000000000000000000'+String(turn.lesson).padStart(2,'0');
   if(turn.extraBody)Object.assign(body,turn.extraBody);
   let result,statusCode=0,error=null;
   try{
    const response=await originalFetch(base+'/api/ai/'+(turn.endpoint||'chat'),{method:turn.method||'POST',headers,body:turn.method==='DELETE'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
    statusCode=response.status;result=await response.json();
   }catch(e){error={name:e.name,code:e.cause?.code||e.code||null};result=null}
   const persisted=[...sessions.entries()].map(([scope,value])=>({scope,...structuredClone(value)}));
   return {turn:turnIndex,request:body,syntheticActor:actor,syntheticActorId:id,authMode:mode,access:entitlement,statusCode,response:result,error,
    latencyMs:Date.now()-start,providerRequests:providerRequests.slice(captureStart),applicationLogs:logs.slice(logStart),dbOperations:dbOperations.slice(dbStart),persistedSessions:persisted,
    transport:'Actual unmodified Express /api/ai pipeline and compatible JWT auth; synthetic models and memory sessions',externalPromptModification:false};
  },
 };
}
module.exports={makeApp,providerConfiguration,courseFixture:courses,PRODUCT_ID,OTHER_ID,UNKNOWN_ID};
