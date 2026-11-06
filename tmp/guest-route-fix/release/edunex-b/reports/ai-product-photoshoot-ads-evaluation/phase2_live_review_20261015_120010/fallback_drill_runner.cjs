'use strict';
// Assessment harness only: loads unchanged route/service source; no database/server writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backend = process.cwd();
const localRequire = createRequire(path.join(backend, 'package.json'));
const runDir = path.join(backend, 'reports/ai-product-photoshoot-ads-evaluation/phase2_live_review_20261015_120010');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (name, data) => fs.writeFileSync(path.join(runDir, name), JSON.stringify(data, null, 2)+'\n', {flag:'wx'});
const config = localRequire('dotenv').parse(fs.readFileSync(path.join(backend, '.env')));
const providerEnv = {};
for (const name of ['FAL_KEY','FAL_API_KEY','FAL_OPENROUTER_MODEL','FAL_GEMINI_MODEL','FAL_OPENROUTER_URL']) {
  if (process.env[name] || config[name]) providerEnv[name] = process.env[name] || config[name];
}
const endpoint = providerEnv.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions';
const url = new URL(endpoint);
if (url.protocol !== 'https:' || url.hostname !== 'fal.run' || url.username || url.password || url.search) throw new Error('Approved provider boundary rejected endpoint');
const key = providerEnv.FAL_API_KEY || providerEnv.FAL_KEY;
if (!key) throw new Error('Approved provider key not configured');
const knowledge = localRequire('./services/tutorKnowledge');
const { PRODUCT_RECORDS } = localRequire('./services/productTutorKnowledge');
const courseId = '6d0000000000000000000000';
const course = {_id:courseId, slug:'ai-product-photoshoot-ads', title:'AI Product Photoshoot & Ads',
  description:'Create AI product photos, product videos and honest UGC-style ads.',
  videos:PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').map(r=>({
    _id: '6d00000000000000000000'+String(r.lessonNumber).padStart(2,'0'), title:r.heading, description:r.content,
  }))};
const frozenSources = [
  'routes/ai.js','services/aiTutorService.js','services/aiCompliance.js','services/tutorKnowledge.js',
  'services/productTutorKnowledge.js','services/productTutorResponse.js','services/tutorProvider.js',
  'services/subscriptionAccess.js','knowledge/ai-product-photoshoot-ads/training.txt',
  'knowledge/ai-product-photoshoot-ads/guidance.json',
  'scripts/eval/grade_product_photoshoot_ads_results_v2.py','scripts/eval/product_photoshoot_ads_test_cases.json',
  'tests/ai-chat-history.test.cjs','tests/tutor-knowledge.test.cjs','tests/product-tutor-quality.test.cjs',
  'tests/mobile-course-ai.test.cjs','tests/mobile-course-ai-cache.test.cjs','tests/test_product_evaluator.py',
  'tests/helpers/deny-network.cjs',
];
const originalPath = path.join(backend,'scripts/eval/product_photoshoot_ads_test_cases.json');
const original = JSON.parse(fs.readFileSync(originalPath));
const heldout = JSON.parse(fs.readFileSync(path.join(runDir, 'held_out_definitions_frozen.json')));
heldout.course = original.course;

async function makeApp(caseId, faultMode = null) {
  const routes = {}; const state = new Map(); const captures = []; const logs = [];
  const serviceModule = {exports:{}};
  const query = data=>({select(){return this},populate(){return this},sort(){return this},limit(){return this},lean:async()=>data});
  const mongoose = localRequire('mongoose');
  const syntheticUserId = sha(caseId).slice(0,24);
  const session = {
    findOne(filter) {return {...query(null),lean:()=>{const p=Promise.resolve(state.get(String(filter.course))||null);return p}}},
    async findOneAndUpdate(filter, update) {state.set(String(filter.course), update);return update},
    async deleteMany(){return {deletedCount:0}}
  };
  const approvedFetch = async (requestUrl, request) => {
    if (String(requestUrl)!==endpoint) throw new Error('Provider allowlist boundary');
    const payload = JSON.parse(request.body);
    const projection = [];
    // Course-only authorization: exclude assembled non-course data at outbound transport boundary.
    for (const message of payload.messages) if (message.role==='system') {
      const before = message.content;
      message.content = message.content.replace(/(\nContext:\n)[\s\S]*?(?=Active course scope:|The learner explicitly asked|No active course scope)/, '$1');
      message.content = message.content.replace(/Safe logged-in learner context:\n[\s\S]*?(?=Published course catalog \(overviews, not full transcripts\):)/, '');
      projection.push({removedCharacters:before.length-message.content.length,
        excluded:['static platform marketing/payment context','synthetic learner profile summary','retrieved platform material']});
    }
    const approvedBody=JSON.stringify(payload);
    if (approvedBody.includes(key) || /(?:\+?91[ -]?)?\d{10}\b/.test(payload.messages.filter(m=>m.role==='user').map(m=>m.content).join('\n'))) throw new Error('Outbound sensitive-data boundary');
    const evidence={startedAt:new Date().toISOString(),requestSha256:sha(approvedBody),request:payload,authorizationProjection:projection};
    captures.push(evidence);
    const started=Date.now();
    try {
      if (faultMode) { evidence.controlledFault = faultMode; const error = new Error('Controlled evaluation transport fault'); if (faultMode === 'timeout') error.name = 'TimeoutError'; else error.code = 'ECONNRESET'; throw error; }
      const response = await globalThis.fetch(requestUrl,{...request,body:approvedBody,redirect:'error'});
      evidence.statusCode=response.status;
      if (response.ok) {
        const data=await response.clone().json();
        const rawText=data.choices?.[0]?.message?.content || data.output || data.text || data.response || data.answer || '';
        evidence.rawModelResponse=typeof rawText==='string'?rawText:JSON.stringify(rawText);
        evidence.finishReason=data.choices?.[0]?.finish_reason||null;
        evidence.usage=data.usage||null;
      }
      return response;
    } catch (error) {
      evidence.error={name:error.name,code:error.cause?.code||error.code||null};
      throw error;
    } finally {evidence.durationMs=Date.now()-started;evidence.completedAt=new Date().toISOString()}
  };
  const sandbox = {
    require(name) {
      if(name==='node:crypto')return crypto;
      if(name==='mongoose')return mongoose;
      if(name==='express')return localRequire('express');
      if(name.includes('aiTutorService'))return serviceModule.exports;
      if(name.includes('compatAuth'))return {requireCompatibleAuth:()=> (req,res,next)=>req.compatAuth?next():res.status(401).json({error:'Invalid synthetic session'})};
      if(name.includes('AiTutorSession'))return session;
      if(name.includes('AiResponseReport'))return {create:async()=>({})};
      if(name.endsWith('/Course'))return {find:filter=>query((!filter._id||filter._id===courseId)&&(!filter.slug||filter.slug===course.slug)?[course]:[])};
      if(name.endsWith('/Subscription'))return {findOne:()=>query({status:'active',currentPeriodEnd:new Date(Date.now()+86400000)})};
      if(name.endsWith('/AppleSubscription')||name.endsWith('/GooglePlaySubscription')||name.endsWith('/Order'))return {findOne:()=>query(null)};
      if(name.endsWith('/User'))return {updateOne:async()=>({})};
      if(name.includes('tutorKnowledge'))return knowledge;
      if(name.startsWith('../services/'))return localRequire('./services/'+name.split('/').pop());
      if(name.startsWith('./'))return localRequire('./services/'+name.slice(2));
      throw new Error('Unexpected assessment dependency: '+name);
    },
    module:{exports:{}},process:{env:providerEnv},AbortSignal,
    console:{info:(...args)=>logs.push({level:'info',text:args.join(' ')}),warn:(...args)=>logs.push({level:'warn',text:args.join(' ')})},
    fetch:approvedFetch,
  };
  vm.runInNewContext(fs.readFileSync(path.join(backend,'services/aiTutorService.js'),'utf8'),{...sandbox,module:serviceModule},{filename:'services/aiTutorService.js'});
  vm.runInNewContext(fs.readFileSync(path.join(backend,'routes/ai.js'),'utf8'),sandbox,{filename:'routes/ai.js'});
  const express = localRequire('express');
  const httpApp = express();
  httpApp.use(express.json());
  httpApp.use((req,res,next)=>{req.compatUser={_id:syntheticUserId,subscriptionStatus:'active'};req.compatAuth={userId:syntheticUserId};next()});
  httpApp.use('/api/ai', sandbox.module.exports);
  const http = require('node:http');
  const server = http.createServer(httpApp);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base = 'http://127.0.0.1:'+server.address().port;
  return {async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}, async chat(message,history,turnIndex){
    const captureStart=captures.length;const logStart=logs.length;const started=Date.now();const startedAt=new Date().toISOString();
    const body={message,history,courseId,conversationId:'phase2-review-'+caseId,debugAi:true,pagePath:'/courses/ai-product-photoshoot-ads',assistantName:'Skillomate AI'};
    let result=null,statusCode=0;
    try {const response=await globalThis.fetch(base+'/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});statusCode=response.status;result=await response.json()}
    catch(error){result={error:'assessment_http_error',safeErrorName:error.name}}
    return {...(result||{}),query:message,turnIndex,statusCode,startedAt,completedAt:new Date().toISOString(),latencyMs:Date.now()-started,
      executionTransport:'real loopback HTTP /api/ai/chat through Express', controlledFault:faultMode,
      providerRequests:captures.slice(captureStart),applicationLogs:logs.slice(logStart)};
  }};
}

async function main(){
  fs.mkdirSync(runDir,{recursive:true});
  if(process.argv.includes('--initialize')){
    if(fs.existsSync(path.join(runDir,'execution_manifest.json')))throw new Error('Run already initialized');
    write('original_test_cases.json',original);write('held_out_test_cases.json',heldout);
    const manifest={initializedAt:new Date().toISOString(),backend,runDir,model:providerEnv.FAL_OPENROUTER_MODEL||providerEnv.FAL_GEMINI_MODEL||'google/gemini-2.5-flash',providerEndpoint:endpoint,
      originalCaseCount:55,heldOutCaseCount:15,concurrency:2,perTurnProviderAttempts:2,perTurnProviderBudgetMs:25000,
      pipeline:'Real loopback HTTP POST /api/ai/chat through Express and the unchanged application router, rate limiter, handler, routing, retrieval, prompt assembly, fal provider adapter and response guards. Synthetic auth/account/course/entitlement fixtures and in-memory persisted conversation storage replace the production data boundary. No production DB.',
      outboundProjection:'Only course context and evaluation messages leave the process. Transport excludes unrelated platform context and synthetic learner summaries after actual prompt assembly; tutor instructions and retrieved course material remain unchanged.',
      sourceHashes:Object.fromEntries(frozenSources.map(p=>[p,sha(fs.readFileSync(path.join(backend,p)))])),
      historicalHashes:Object.fromEntries(['live_20261014_182739','quality_improvement_20261015','phase2_live_20261015_115107'].flatMap(dir=>fs.readdirSync(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation',dir)).filter(f=>fs.statSync(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation',dir,f)).isFile()).map(f=>{const p=path.join('reports/ai-product-photoshoot-ads-evaluation',dir,f);return[p,sha(fs.readFileSync(path.join(backend,p)))]}))),
      gitStatusAtStart:require('node:child_process').execFileSync('git',['status','--short'],{cwd:backend,encoding:'utf8'}),
      fixture:course};
    write('execution_manifest.json',manifest);
    // Runner is already frozen in this directory.
    console.log(JSON.stringify({initialized:true,runDir,original:55,heldOut:15}));return;
  }
  const mode=process.argv.includes('--probe')?'probe':process.argv.includes('--probe-sandbox')?'probe_sandbox':process.argv.includes('--fallback-drills')?'fallback_drills':'evaluation';
  const cases= mode.startsWith('probe')?[{id:'connectivity_course_probe',category:'provider_connectivity',query:'For an AI Product Photoshoot & Ads course exercise, suggest one honest hook for a plain ceramic cup. I only know it is a ceramic cup.'}]:mode==='fallback_drills'?[{id:'controlled_connection_failure',category:'provider_fallback',faultMode:'connection_error',query:'For a course exercise, draft one honest ad hook for a plain brass bookmark using only its name.'},{id:'controlled_timeout',category:'provider_fallback',faultMode:'timeout',query:'Draft one honest ad hook for a plain brass bookmark, with no invented product claims.'}]:[
    ...original.single_turn_tests,...original.conversation_tests,...heldout.single_turn_tests,...heldout.conversation_tests];
  const progressFile=path.join(runDir, mode==='probe'?'connectivity_probe.json':mode==='probe_sandbox'?'connectivity_probe_sandbox.json':mode==='fallback_drills'?'controlled_fallback_results_authorized.json':'application_raw_results.json');
  if(fs.existsSync(progressFile))throw new Error('Refusing to overwrite saved evaluation');
  const output={suite:original.suite,evaluationType:'PHASE_2_ACTUAL_APPLICATION_PIPELINE',generatedAt:new Date().toISOString(),mode,configuredModel:providerEnv.FAL_OPENROUTER_MODEL||providerEnv.FAL_GEMINI_MODEL||'google/gemini-2.5-flash',results:[]};
  fs.writeFileSync(progressFile,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  const save=()=>{const temporary=progressFile+'.checkpoint';fs.writeFileSync(temporary,JSON.stringify(output,null,2)+'\n');fs.renameSync(temporary,progressFile)};
  let next=0;
  async function worker(){while(next<cases.length){const test=cases[next++];const app=await makeApp(test.id,test.faultMode||null);const history=[];const turns=[];
    for(const [i,turn] of (test.turns||[test]).entries()){
      const message=turn.user||turn.query;const actual=await app.chat(message,history,i+1);turns.push(actual);
      history.push({role:'user',content:message});if(actual.answer)history.push({role:'assistant',content:actual.answer});
    }
    const result={id:test.id,category:test.category,set:test.id.startsWith('new15')?'held_out':mode==='evaluation'?'original':'supplemental',...(test.turns?{turns}:turns[0])};
    await app.close();output.results.push(result);save();
    console.log(JSON.stringify({completed:output.results.length,total:cases.length,id:test.id,origins:turns.map(t=>t.outcome?.type||'handler_error'),providerCalls:turns.reduce((s,t)=>s+t.providerRequests.length,0),latencyMs:turns.reduce((s,t)=>s+t.latencyMs,0)}));
  }}
  await Promise.all(Array.from({length:mode.startsWith('probe')?1:2},worker));
  output.results.sort((a,b)=>cases.findIndex(t=>t.id===a.id)-cases.findIndex(t=>t.id===b.id));output.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({completed:true,mode,path:progressFile}));
}
main().catch(error=>{console.error(JSON.stringify({fatal:true,name:error.name,message:key?String(error.message).replaceAll(key,'[REDACTED]'):String(error.message)}));process.exitCode=1});
