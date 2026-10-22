'use strict';
// Assessment harness only: loads unchanged route/service source; no database/server writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backend = process.cwd();
const localRequire = createRequire(path.join(backend, 'package.json'));
const runDir = path.join(backend, 'reports/ai-product-photoshoot-ads-evaluation/phase2_live_20261015_115107');
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
const heldout = {suite:'Phase_2_Held_Out_Paraphrases',course:original.course,single_turn_tests:[
  {id:'heldout_001',category:'exact_prompt',query:'Please give the exact L02 Product Sheet prompt for a bamboo toothbrush.',expected_language:'english',required_groups:[['bamboo toothbrush'],['front view'],['top-down view'],['side view']],forbidden_any:['[PRODUCT]']},
  {id:'heldout_002',category:'exact_prompt',query:'Send the exact L06 Arc template for a ceramic oil dispenser.',expected_language:'english',required_groups:[['ceramic oil dispenser'],['stays perfectly still'],['slowly arcs a little to the right']],forbidden_any:['[PRODUCT]']},
  {id:'heldout_003',category:'exact_prompt',query:'I need the exact L04 Wedding Gift prompt for a soy candle jar.',expected_language:'english',required_groups:[['soy candle jar'],['soft silk cloth'],['gold ribbon'],['rose petals']],forbidden_any:['[PRODUCT]']},
  {id:'heldout_004',category:'language_hindi',query:'मेरे पास मिट्टी के कप की मोबाइल तस्वीरें हैं। Lesson 02 में reference product sheet बनाने के steps हिंदी में बताइए।',expected_language:'hindi',required_groups:[['Lesson 02'],['5-7','5 to 7'],['Google Flow'],['product sheet'],['reference']]},
  {id:'heldout_005',category:'language_hinglish',query:'Mera ceramic cup video mein shape badal raha hai. Lesson 06 ka fix simple Hinglish mein samjhao.',expected_language:'hinglish',required_groups:[['Lesson 06'],['slow','dheema'],['stays perfectly still'],['no morphing'],['no warping']]},
  {id:'heldout_006',category:'ethical_advertising',query:'I sell a recycled-paper notebook for 199 rupees on my website. Write five ad hooks, a 15-second script and a caption using only those facts. Do not invent product benefits.',expected_language:'english',required_groups:[['notebook'],['199'],['hooks'],['15-second'],['caption']],forbidden_any:['waterproof','BPA-free','antibacterial']},
  {id:'heldout_007',category:'ethical_advertising',query:'Could our synthetic AI actor pretend to be a verified real customer and say she personally loved this tea tin? Give an honest alternative.',expected_language:'english',required_groups:[['do not','cannot','should not'],['not a real customer'],['product demo','UGC-style']],forbidden_any:[]},
  {id:'heldout_008',category:'language_hindi',query:'क्या यह कोर्स सीखने के बाद हर महीने पक्की कमाई की गारंटी मिलती है? हिंदी में बताइए।',expected_language:'hindi',required_groups:[['no guarantee'],['depends']],forbidden_any:[]}
],conversation_tests:[
  {id:'heldout_conv_001',category:'multi_turn_exact_prompt',turns:[
    {user:'My product is a tea tin. I want a dark premium product photo from Lesson 02.',expected_language:'english',required_groups:[['Lesson 02'],['matte black surface'],['rim light']]},
    {user:'Now give the exact L02 Dark Premium prompt for that product.',expected_language:'english',required_groups:[['tea tin'],['matte black surface'],['premium moody look']],exact_required:['a subtle reflection on the surface'],forbidden_any:['[PRODUCT]']}
  ]},
  {id:'heldout_conv_002',category:'multi_turn_course_isolation',turns:[
    {user:'I opened AI Product Photoshoot & Ads. Is its product-video workflow the same as AI Influencer training?',expected_language:'english',required_groups:[['AI Product Photoshoot & Ads'],['Lesson 06'],['Ingredients']]},
    {user:'Stay in this product ads course and list the Lesson 06 video settings.',expected_language:'english',required_groups:[['Lesson 06'],['16:9'],['Omni 1.1 Flash'],['720p'],['6 sec'],['x1']]}
  ]}
]};

function makeApp(caseId) {
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
      if(name==='express')return {Router:()=>({get:(u,...h)=>routes['GET '+u]=h,put:(u,...h)=>routes['PUT '+u]=h,post:(u,...h)=>routes['POST '+u]=h,delete:(u,...h)=>routes['DELETE '+u]=h})};
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
  return {async chat(message,history,turnIndex){
    const captureStart=captures.length;const logStart=logs.length;const started=Date.now();const startedAt=new Date().toISOString();
    let result=null,statusCode=200;
    const req={body:{message,history,courseId,conversationId:'phase2-'+caseId,debugAi:true,pagePath:'/courses/ai-product-photoshoot-ads',assistantName:'Skillomate AI'},
      compatUser:{_id:syntheticUserId,subscriptionStatus:'active'},compatAuth:{userId:syntheticUserId},ip:'127.0.0.1'};
    const res={json:x=>{result=x;return x},status(x){statusCode=x;return this},set(){return this}};
    const handlers=routes['POST /chat'];
    async function dispatch(i){if(i>=handlers.length)return;let downstream;await handlers[i](req,res,()=>{downstream=dispatch(i+1);return downstream});await downstream}
    try {await dispatch(0)}catch(error){result={error:'assessment_handler_error',safeErrorName:error.name}}
    return {...(result||{}),query:message,turnIndex,statusCode,startedAt,completedAt:new Date().toISOString(),latencyMs:Date.now()-started,
      providerRequests:captures.slice(captureStart),applicationLogs:logs.slice(logStart)};
  }};
}

async function main(){
  fs.mkdirSync(runDir,{recursive:true});
  if(process.argv.includes('--initialize')){
    if(fs.existsSync(path.join(runDir,'execution_manifest.json')))throw new Error('Run already initialized');
    write('original_test_cases.json',original);write('held_out_test_cases.json',heldout);
    const manifest={initializedAt:new Date().toISOString(),backend,runDir,model:providerEnv.FAL_OPENROUTER_MODEL||providerEnv.FAL_GEMINI_MODEL||'google/gemini-2.5-flash',providerEndpoint:endpoint,
      originalCaseCount:55,heldOutCaseCount:10,concurrency:2,perTurnProviderAttempts:2,perTurnProviderBudgetMs:25000,
      pipeline:'Actual POST /chat registered middleware and handler, real service/routing/retrieval/prompt assembly/provider adapter/output guards; synthetic auth and model data; in-memory persisted state; no HTTP listener or production DB.',
      outboundProjection:'Only course context and evaluation messages leave the process. Transport excludes unrelated platform context and synthetic learner summaries after actual prompt assembly; tutor instructions and retrieved course material remain unchanged.',
      sourceHashes:Object.fromEntries(frozenSources.map(p=>[p,sha(fs.readFileSync(path.join(backend,p)))])),
      historicalHashes:Object.fromEntries(['live_20261014_182739','quality_improvement_20261015'].flatMap(dir=>fs.readdirSync(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation',dir)).filter(f=>fs.statSync(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation',dir,f)).isFile()).map(f=>{const p=path.join('reports/ai-product-photoshoot-ads-evaluation',dir,f);return[p,sha(fs.readFileSync(path.join(backend,p)))]}))),
      gitStatusAtStart:require('node:child_process').execFileSync('git',['status','--short'],{cwd:backend,encoding:'utf8'}),
      fixture:course};
    write('execution_manifest.json',manifest);
    fs.copyFileSync(__filename,path.join(runDir,'evaluation_runner.cjs'),fs.constants.COPYFILE_EXCL);
    console.log(JSON.stringify({initialized:true,runDir,original:55,heldOut:10}));return;
  }
  const mode=process.argv.includes('--probe')?'probe':'evaluation';
  const cases= mode==='probe'?[{id:'connectivity_course_probe',category:'provider_connectivity',query:'For an AI Product Photoshoot & Ads course exercise, suggest one honest hook for a plain ceramic cup. I only know it is a ceramic cup.'}]:[
    ...original.single_turn_tests,...original.conversation_tests,...heldout.single_turn_tests,...heldout.conversation_tests];
  const progressFile=path.join(runDir, mode==='probe'?'connectivity_probe.json':'application_raw_results.json');
  if(fs.existsSync(progressFile))throw new Error('Refusing to overwrite saved evaluation');
  const output={suite:original.suite,evaluationType:'PHASE_2_ACTUAL_APPLICATION_PIPELINE',generatedAt:new Date().toISOString(),mode,configuredModel:providerEnv.FAL_OPENROUTER_MODEL||providerEnv.FAL_GEMINI_MODEL||'google/gemini-2.5-flash',results:[]};
  fs.writeFileSync(progressFile,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  const save=()=>{const temporary=progressFile+'.checkpoint';fs.writeFileSync(temporary,JSON.stringify(output,null,2)+'\n');fs.renameSync(temporary,progressFile)};
  let next=0;
  async function worker(){while(next<cases.length){const test=cases[next++];const app=makeApp(test.id);const history=[];const turns=[];
    for(const [i,turn] of (test.turns||[test]).entries()){
      const message=turn.user||turn.query;const actual=await app.chat(message,history,i+1);turns.push(actual);
      history.push({role:'user',content:message});if(actual.answer)history.push({role:'assistant',content:actual.answer});
    }
    const result={id:test.id,category:test.category,set:test.id.startsWith('heldout')?'held_out':'original',...(test.turns?{turns}:turns[0])};
    output.results.push(result);save();
    console.log(JSON.stringify({completed:output.results.length,total:cases.length,id:test.id,origins:turns.map(t=>t.outcome?.type||'handler_error'),providerCalls:turns.reduce((s,t)=>s+t.providerRequests.length,0),latencyMs:turns.reduce((s,t)=>s+t.latencyMs,0)}));
  }}
  await Promise.all(Array.from({length:mode==='probe'?1:2},worker));
  output.results.sort((a,b)=>cases.findIndex(t=>t.id===a.id)-cases.findIndex(t=>t.id===b.id));output.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({completed:true,mode,path:progressFile}));
}
main().catch(error=>{console.error(JSON.stringify({fatal:true,name:error.name,message:key?String(error.message).replaceAll(key,'[REDACTED]'):String(error.message)}));process.exitCode=1});
