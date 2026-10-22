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
 console.log(JSON.stringify({cases:results.length,turns:results.flatMap(c=>c.turns).length,fullBodyMatches:results.flatMap(c=>c.turns).filter(t=>t.fullExpectedBodyMatches).length,deniedExternalRequests}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
