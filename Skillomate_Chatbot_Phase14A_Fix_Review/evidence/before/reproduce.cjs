'use strict';
// Investigation artifact only. Executes the existing Phase 12 makeApp function unchanged.
// Run from Untitled/edunex-b. No credentials/config are loaded. External fetch is denied.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const backend = process.cwd();
const localRequire = createRequire(path.join(backend,'package.json'));
const old = path.join(backend,'reports/ai-product-photoshoot-ads-evaluation/phase12_live_20261015_110001');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const runner = fs.readFileSync(path.join(old,'evaluation_runner.cjs'),'utf8');
const functionText = runner.slice(runner.indexOf('async function makeApp('),runner.indexOf('\nasync function main()'));
if (!functionText.startsWith('async function makeApp(')) throw Error('Existing runner shape changed');
const knowledge = localRequire('./services/tutorKnowledge');
const {PRODUCT_RECORDS,PRODUCT_TEMPLATES,...pk} = localRequire('./services/productTutorKnowledge');
const ps = localRequire('./services/productTutorState');
const pi = localRequire('./services/productTutorIntent');
const courseId='6d0000000000000000000000';
const course=JSON.parse(fs.readFileSync(path.join(old,'execution_manifest.json'),'utf8')).fixture;
let deniedExternalRequests=0;
const gatedFetch=async (url,options)=>{
  const u=new URL(url);
  if(u.protocol!=='http:' || u.hostname!=='127.0.0.1'){
    deniedExternalRequests++;
    throw Error('Phase13 external transport prohibited');
  }
  return globalThis.fetch(url,options);
};
const sandbox={fs,path,vm,crypto,require,localRequire,backend,knowledge,PRODUCT_RECORDS,courseId,course,sha,
  providerEnv:{FAL_KEY:'phase13-synthetic-never-sent'},key:'phase13-synthetic-never-sent',
  endpoint:'https://fal.run/openrouter/router/openai/v1/chat/completions',
  AbortSignal,console,fetch:gatedFetch,module:{exports:{}}};
vm.runInNewContext(functionText+'\nmodule.exports=makeApp;',sandbox,{filename:'phase12-makeApp-unmodified.cjs'});
const makeApp=sandbox.module.exports;
const definitions=JSON.parse(fs.readFileSync(path.join(old,'unseen_definitions_frozen.json'),'utf8'));
const saved=JSON.parse(fs.readFileSync(path.join(old,'application_raw_results.json'),'utf8'));
const ids=['phase12_new_001','phase12_new_002','phase12_new_005','phase12_new_029'];
const write=(name,data)=>fs.writeFileSync(path.join(__dirname,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
async function main(){
 const results=[];
 for(const id of ids){
  const test=[...definitions.single_turn_tests,...definitions.conversation_tests].find(t=>t.id===id);
  const app=await makeApp(id);const history=[];const turns=[];
  try{
   for(const [index,t] of (test.turns||[test]).entries()){
    const q=t.user||t.query;const actual=await app.chat(q,history,index+1,Boolean(t.omit_client_history));
    const pastCase=saved.results.find(r=>r.id===id);const past=(pastCase.turns||[pastCase])[index];
    const expected=PRODUCT_TEMPLATES.find(a=>a.heading===t.expected_template);
    // Independent oracle: literal source substitutions from frozen expected_slots,
    // never application extraction or rendering functions.
    let body=expected.content;const slots=t.expected_slots||{};
    if(slots.product)body=body.replace(/\[product\]/gi,()=>slots.product);
    if(slots.part)body=body.replace(/\[the part, e\.g\. [^\]]+\]/g,()=>slots.part);
    if(slots.colour)body=body.replace(/\[new colour, e\.g\. [^\]]+\]/g,()=>slots.colour);
    const fenced=actual.answer?.match(/```(?:text)?\s*\n([\s\S]*?)\n```/)?.[1];
    turns.push({expectedTemplate:t.expected_template,expectedSlots:slots,expectedBody:body,
      fullExpectedBodyMatches:fenced===body,byteIdenticalToPhase12:actual.answer===past.answer,
      phase12AnswerSha256:sha(past.answer||''),actualAnswerSha256:sha(actual.answer||''),actual});
    history.push({role:'user',content:q},{role:'assistant',content:actual.answer||''});
   }
  } finally{await app.close()}
  results.push({id,turns});
 }
 write('reproduction_results.json',{executedAt:new Date().toISOString(),method:'Existing Phase12 makeApp function extracted unchanged; actual Express loopback route; current modules; synthetic auth/entitlement/course; memory-only sessions; external transport denied',makeAppSha256:sha(functionText),deniedExternalRequests,results});
 const probes=[];const probe=(id,q,previous={},history=[])=>{
   const facts=pk.productFacts(q,history,previous,{courseId,conversationId:'phase13-probes'});
   probes.push({id,query:q,previous,extractEntity:ps.extractEntity(q),extraSlots:ps.extraSlots(q),slots:pk.productSlots(q,history,previous),facts,requestContext:pk.productRequestContext(q,history,previous),wantsTemplate:pk.wantsProductPrompt(q),candidate:pk.findProductTemplate(q,history)?.heading||null});return facts;
 };
 const first=probe('base','My product is a cork reading stand. Price is 420. I sell on Etsy. Material is cork. Change the two side rails to sky blue. Give the exact L02 White Studio prompt.');
 probe('english-switch','Replace the product with a ceramic incense holder. Give the entire approved L02 Dark Premium prompt.',first);
 probe('roman-hindi-switch','Ab product ko ceramic incense holder se replace karo. L02 Dark Premium ka complete approved prompt do.',first);
 probe('explicit-reset','Forget the previous product and start over. Give the exact L02 White Studio prompt.',first);
 probe('english-correction','Correction: price is 510. Give a caption.',first);
 probe('hindi-material','हमारा प्रोडक्ट मिट्टी का दीपक है। सामग्री: मिट्टी। रंग: हल्का नीला। केवल हाथ न दिखाएँ।');
 probe('hindi-colour','केवल बाहरी ढक्कन का रंग हल्का नीला करें। L04 Colour Variant Sheet का पूरा approved template दीजिए।');
 probe('english-passive','Only the colour of the three corner clips should be changed to muted teal. Return the approved L04 Colour Variant Sheet template.');
 probe('english-active-control','Change the three corner clips to muted teal. Return the approved L04 Colour Variant Sheet template.');
 probe('negated-template','Explain the whole course in Hinglish; photo prompt mat dena.');
 probe('educational-heading','Explain why L02 White Studio is useful.');
 probe('open-image','Create an original image prompt for my cork reading stand in a bright studio.');
 probe('repeat','Again.',first);
 probe('hindi-identity-english','हमारा प्रोडक्ट मिट्टी का दीपक है। Explain in English.');
 const {backend:fixture}=localRequire('./tests/ai-tutor-fixture.cjs');
 const sessions=new Map();const app=fixture({courses:[course],subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+86400000)},user:{_id:'learner'},sessions});
 const routeStates=[];
 const requests=[
  {id:'conversation-A',message:'My product is a cork reading stand. Give the exact L02 White Studio prompt.',conversationId:'phase13-A'},
  {id:'conversation-B-fresh',message:'Give the exact L02 White Studio prompt.',conversationId:'phase13-B'},
  {id:'conversation-A-after-B',message:'Give the exact L02 White Studio prompt.',conversationId:'phase13-A'},
  {id:'product-declared-again',message:'My product is a cork reading stand. Give the exact L02 White Studio prompt.',conversationId:'phase13-A'},
  {id:'explicit-reset-same-id',message:'Forget the previous product and start over. Give the exact L02 White Studio prompt.',conversationId:'phase13-A'},
  {id:'missing-conversation-id',message:'Give the exact L02 White Studio prompt.'},
 ];
 for(const r of requests){const {id,...body}=r;const response=await app.rawChat({...body,courseId,debugAi:true,history:[]});routeStates.push({id,request:body,response,persisted:[...sessions.values()].map(s=>({conversationId:s.conversationId,productContext:s.productContext}))});}
 write('targeted_probes.json',{executedAt:new Date().toISOString(),method:'Direct current-module probes plus existing in-process backend fixture; not production DB or live model evaluation',probes,routeStates,stubProviderCalls:app.calls.length,externalRequests:deniedExternalRequests});
 console.log(JSON.stringify({cases:results.length,turns:results.reduce((n,r)=>n+r.turns.length,0),byteIdenticalTurns:results.flatMap(r=>r.turns).filter(t=>t.byteIdenticalToPhase12).length,criticalFailuresReproduced:results.filter(r=>r.turns.some(t=>!t.fullExpectedBodyMatches)).length,deniedExternalRequests,probes:probes.length,routeStateProbes:routeStates.length,stubProviderCalls:app.calls.length}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
