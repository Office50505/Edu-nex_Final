'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeApp}=require('./pipeline.cjs'),{inspect}=require('./inspect_scope.cjs');
const E=path.resolve(__dirname,'..'),stage=process.argv[2];if(!['before','after'].includes(stage))throw Error('stage');
const audited=JSON.parse(fs.readFileSync(path.resolve(E,'../../Skillomate_Chatbot_Reliability_Root_Cause_Review/evidence/failed_case_classifications.json')));
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'frozen_cases.json'))).cases.filter(c=>audited.some(a=>a.id===c.id&&a.confirmedApplicationDefect));
const rows=[];
(async()=>{
 for(const spec of cases){
  const app=await makeApp(spec),traces=[],histories=new Map();
  try{for(const [index,turn]of spec.turns.entries()){
   const key=(turn.actor||'A')+':'+(turn.conversation||spec.id+'-conversation'),history=histories.get(key)||[];
   const t=await app.chat(turn,history,index+1);t.scopeInspection=inspect(t,spec,turn);traces.push(t);
   if(t.scopeInspection.potentialCriticalFindings.length)throw Error('CRITICAL_SCOPE_ALERT '+spec.id+':'+(index+1));
   if(t.providerRequests.some(r=>r.httpStatus||r.rawModelResponse))throw Error('Unexpected transmitted provider request');
   if(t.error||!t.response)throw Error('No actual response '+spec.id);
   const answer=t.response.reply||t.response.answer||'';
   if(turn.method==='DELETE')histories.clear();else if(t.statusCode===200)histories.set(key,[...history,{role:'user',content:turn.message},{role:'assistant',content:answer}]);
  }}finally{await app.close();}
  rows.push({id:spec.id,category:spec.category,expected:spec.turns.map(t=>t.expected),traces});
  fs.writeFileSync(path.join(E,'diagnostics_'+stage+'.json'),JSON.stringify({stage,method:'Known source-aware diagnostics, not blind evaluation; synthetic local HTTP/JWT pipeline with external transport denied',cases:rows},null,2));
 }
 const turns=rows.flatMap(r=>r.traces),summary={cases:rows.length,turns:turns.length,providerAdapterAttempts:turns.reduce((n,t)=>n+t.providerRequests.length,0),externalRequests:0,providerDependentTurns:turns.filter(t=>t.response?.outcome?.type==='provider_fallback').length,scopeAlerts:0};
 fs.writeFileSync(path.join(E,'diagnostics_'+stage+'_execution.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(e=>{fs.writeFileSync(path.join(E,'DIAGNOSTIC_STOP.json'),JSON.stringify({stage,error:e.message}));console.error(e.stack);process.exitCode=1});
