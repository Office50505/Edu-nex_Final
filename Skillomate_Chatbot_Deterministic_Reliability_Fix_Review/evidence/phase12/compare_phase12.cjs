'use strict';
// Controlled before/after pipeline replay; historical upstream texts are transport fixtures.
// This is not a fresh live evaluation. No keys, production database or remote requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const backend=process.cwd();const actualRequire=createRequire(path.join(backend,'package.json'));
const stage=process.argv[2];if(!['before','after','final'].includes(stage))throw Error('Expected before/after/final');
const old=path.join(backend,'reports/ai-product-photoshoot-ads-evaluation/phase12_live_20261015_110001');
const artifact=__dirname;const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const protectedModules=new Set(['productTutorState','productTutorKnowledge','productTutorIntent','productTutorResponse','productTutorTasks','productTutorGrounding','tutorKnowledge']);
const cache=new Map();
function localRequire(name){
 const resolved=actualRequire.resolve(name);
 const match=resolved.match(/\/services\/([^/]+)\.js$/);
 if(stage!=='before'||!match||!protectedModules.has(match[1]))return actualRequire(name);
 if(cache.has(resolved))return cache.get(resolved).exports;
 const m={exports:{}};cache.set(resolved,m);
 const filename=path.join(artifact,'../before/edunex-b/services',match[1]+'.js');
 const requireFromFile=createRequire(resolved);
 const mappedRequire=dep=>{
  const target=requireFromFile.resolve(dep);const service=target.match(/\/services\/([^/]+)\.js$/);
  return service&&protectedModules.has(service[1])?localRequire('./services/'+service[1]):requireFromFile(dep);
 };
 const fn=vm.runInThisContext('(function(require,module,exports,__filename,__dirname){\n'+fs.readFileSync(filename,'utf8')+'\n})',{filename:resolved+' [working-tree baseline]'});
 fn(mappedRequire,m,m.exports,resolved,path.dirname(resolved));return m.exports;
}
const knowledge=localRequire('./services/tutorKnowledge');
const {PRODUCT_RECORDS}=localRequire('./services/productTutorKnowledge');
const manifest=JSON.parse(fs.readFileSync(path.join(old,'execution_manifest.json')));
const course=manifest.fixture,courseId=course._id;
const runner=fs.readFileSync(path.join(old,'evaluation_runner.cjs'),'utf8');
const makeAppSource=runner.slice(runner.indexOf('async function makeApp('),runner.indexOf('\nasync function main()'));
const raw=JSON.parse(fs.readFileSync(path.join(old,'application_raw_results.json')));
const verdicts=JSON.parse(fs.readFileSync(path.join(old,'phase12_live_results.json')));
const defs=JSON.parse(fs.readFileSync(path.join(old,'all_test_cases_frozen.json')));
let currentQueue=[],transportRequests=[],unexpectedTransportRequests=0;
const gatedFetch=async(url,options)=>{
 const u=new URL(url);
 if(u.protocol==='http:'&&u.hostname==='127.0.0.1')return globalThis.fetch(url,options);
 if(String(url)!==manifest.providerEndpoint)throw Error('Forbidden outbound destination');
 const recorded=currentQueue.shift();transportRequests.push({fixtureReplay:true,matchedRecordedResponse:Boolean(recorded),requestSha256:sha(options.body)});
 if(!recorded){unexpectedTransportRequests++;throw Error('No pre-recorded upstream response for changed route');}
 return new Response(JSON.stringify({choices:[{message:{content:recorded.rawModelResponse},finish_reason:recorded.finishReason||'stop'}],usage:recorded.usage}),{status:200,headers:{'Content-Type':'application/json'}});
};
const sourceFs={...fs,readFileSync(file,...args){if(stage==='before'&&['routes/ai.js','services/aiTutorService.js'].some(rel=>String(file)===path.join(backend,rel)))return fs.readFileSync(path.join(artifact,'../before/edunex-b',path.relative(backend,file)),...args);return fs.readFileSync(file,...args)}};
const sandbox={fs:sourceFs,path,vm,crypto,require,localRequire,backend,knowledge,PRODUCT_RECORDS,courseId,course,sha,
 providerEnv:{FAL_KEY:'phase14a-synthetic-never-sent',FAL_OPENROUTER_MODEL:manifest.model},key:'phase14a-synthetic-never-sent',endpoint:manifest.providerEndpoint,
 AbortSignal,console,fetch:gatedFetch,module:{exports:{}}};
vm.runInNewContext(makeAppSource+'\nmodule.exports=makeApp;',sandbox);
const makeApp=sandbox.module.exports;
async function main(){
 const results=[];
 // Compare all 40 previously scored passing cases, preserving turn history and omitted-history flags.
 for(const verdict of verdicts.case_results.filter(c=>c.verdict==='PASSED')){
  const def=[...defs.single_turn_tests,...defs.conversation_tests].find(c=>c.id===verdict.id);
  const saved=raw.results.find(c=>c.id===verdict.id);const prior=saved.turns||[saved];
  const app=await makeApp(verdict.id);const history=[];const turns=[];
  try{for(const [i,t]of(def.turns||[def]).entries()){
   const original=prior[i];currentQueue=[...(original.providerRequests||[])];transportRequests=[];
   const actual=await app.chat(t.user||t.query,history,i+1,Boolean(t.omit_client_history));
   turns.push({originalAnswer:original.answer,answerByteIdentical:actual.answer===original.answer,
    originalOutcome:original.outcome,originalProviderRequests:original.providerRequests?.length||0,
    unusedRecordedResponses:currentQueue.length,transportRequests:[...transportRequests],actual});
   history.push({role:'user',content:t.user||t.query},{role:'assistant',content:actual.answer||''});
  }}finally{await app.close()}
  results.push({id:verdict.id,category:def.category,turns});
 }
 const summary={cases:results.length,turns:results.reduce((n,c)=>n+c.turns.length,0),byteIdenticalCases:results.filter(c=>c.turns.every(t=>t.answerByteIdentical)).length,
  changedCases:results.filter(c=>c.turns.some(t=>!t.answerByteIdentical)).map(c=>c.id),replayedProviderInvocations:results.flatMap(c=>c.turns).reduce((n,t)=>n+t.transportRequests.length,0),unexpectedTransportRequests,externalProviderInvocations:0};
 const output={executedAt:new Date().toISOString(),stage,method:'Actual Phase12 makeApp/Express loopback pipeline; before loads five saved working-tree modules in memory; recorded Phase12 upstream responses only, no live inference',sourceHashes:Object.fromEntries([...protectedModules].map(n=>['services/'+n+'.js',sha(fs.readFileSync(stage==='before'?path.join(artifact,'../before/edunex-b/services',n+'.js'):path.join(backend,'services',n+'.js')))])),summary,results};
 fs.writeFileSync(path.join(artifact,stage,'phase12_passing_replay.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
