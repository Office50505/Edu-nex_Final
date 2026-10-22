'use strict';
// Evaluation orchestration only. Candidate code, provider payloads, and expectations are unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const frozen=JSON.parse(fs.readFileSync(path.join(root,'evaluation_freeze.json')));
for(const [name,hash]of Object.entries(frozen.files)){
 if(sha(fs.readFileSync(path.join(root,name)))!==hash)throw Error('Frozen evaluation changed: '+name);
}
const baseline=JSON.parse(fs.readFileSync(path.join(root,'candidate_manifest.json')));
for(const group of Object.values(baseline.groups))for(const [name,hash]of Object.entries(group)){
 if(sha(fs.readFileSync(path.resolve(process.cwd(),'..',name)))!==hash)throw Error('Frozen candidate changed: '+name);
}
if(fs.existsSync(path.join(root,'SAFETY_STOP.json')))throw Error('Critical stop is active; execution forbidden');
const cases=JSON.parse(fs.readFileSync(path.join(root,'frozen_cases.json'))).cases;
const spec=cases.find(c=>c.id===process.argv[2]);if(!spec)throw Error('Unknown frozen case');
const out=path.join(root,'traces',spec.id+'.json');
if(fs.existsSync(out))throw Error('Case already executed; evidence must not be overwritten');
const {makeApp}=require('./pipeline.cjs');
async function main(){
 const startedAt=new Date().toISOString(),app=await makeApp({id:spec.id,access:spec.access,auth:spec.auth});
 const traces=[],histories=new Map();
 try{
  for(let i=0;i<spec.turns.length;i++){
   const turn=spec.turns[i];
   const client=(turn.actor||'A')+':'+(turn.conversation||spec.id+'-conversation');
   const history=histories.get(client)||[];
   const trace=await app.chat(turn,history,i+1);traces.push(trace);
   const answer=trace.response?.reply||trace.response?.answer||'';
   if(turn.method==='DELETE'){
    for(const key of histories.keys())if(key.startsWith((turn.actor||'A')+':'))histories.delete(key);
   }else if(answer&&trace.statusCode===200){
    histories.set(client,[...history,{role:'user',content:turn.message},{role:'assistant',content:answer}]);
   }
   fs.mkdirSync(path.dirname(out),{recursive:true});
   fs.writeFileSync(out,JSON.stringify({id:spec.id,category:spec.category,startedAt,completedAt:null,complete:false,traces},null,2));
  }
 }finally{await app.close()}
 const result={id:spec.id,category:spec.category,startedAt,completedAt:new Date().toISOString(),complete:true,traces};
 fs.writeFileSync(out,JSON.stringify(result,null,2));
 const grading={id:spec.id,category:spec.category,complete:true,turns:traces.map(t=>({
  turn:t.turn,statusCode:t.statusCode,answer:t.response?.reply||t.response?.answer||'',response:t.response?Object.fromEntries(Object.entries(t.response).filter(([key])=>key!=='debug')):null,
  latencyMs:t.latencyMs,error:t.error,
  providerRequests:t.providerRequests.map(p=>({httpStatus:p.httpStatus,error:p.error,finishReason:p.finishReason,durationMs:p.durationMs,usage:p.usage})),
 }))};
 fs.writeFileSync(path.join(root,'isolated_grader',spec.id+'_response.json'),JSON.stringify(grading,null,2),{flag:'wx'});
 console.log(JSON.stringify({id:spec.id,turns:traces.length,providerRequests:traces.reduce((n,t)=>n+t.providerRequests.length,0),responses:traces.map(t=>({status:t.statusCode,answer:t.response?.reply||t.response?.answer||'',outcome:t.response?.outcome,route:t.response?.debug?.response_selection}))}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
