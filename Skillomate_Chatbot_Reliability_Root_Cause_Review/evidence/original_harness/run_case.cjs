'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=__dirname,sha=v=>crypto.createHash('sha256').update(v).digest('hex'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const freeze=JSON.parse(fs.readFileSync(path.join(E,'evaluation_freeze.json')));
for(const [name,h]of Object.entries(freeze.files))if(sha(fs.readFileSync(path.join(E,name)))!==h)throw Error('Frozen evaluation changed: '+name);
const manifest=JSON.parse(fs.readFileSync(path.join(E,'candidate_manifest.json')));
for(const files of Object.values(manifest.groups))for(const [name,h]of Object.entries(files))if(sha(fs.readFileSync(path.resolve(process.cwd(),'..',name)))!==h)throw Error('Frozen candidate changed: '+name);
if(fs.existsSync(path.join(E,'SAFETY_STOP.json')))throw Error('Safety stop active');
const spec=JSON.parse(fs.readFileSync(path.join(E,'frozen_cases.json'))).cases.find(c=>c.id===process.argv[2]);
if(!spec||!/^[a-z0-9_-]+$/i.test(spec.id))throw Error('Invalid frozen case');
const output=path.join(E,'traces',spec.id+'.json');
if(fs.existsSync(output))throw Error('Existing case evidence may not be overwritten');
const {makeApp}=require('./pipeline.cjs'),{inspect}=require('./inspect_scope.cjs');
const journal=row=>fs.appendFileSync(path.join(E,'execution_journal.jsonl'),JSON.stringify({at:new Date().toISOString(),...row})+'\n');
async function main(){
 const app=await makeApp({id:spec.id,access:spec.access,auth:spec.auth}),traces=[],histories=new Map(),startedAt=new Date().toISOString();
 let completed=false;
 try{
  for(let i=0;i<spec.turns.length;i++){
   if(fs.existsSync(path.join(E,'SAFETY_STOP.json')))break;
   const turn=spec.turns[i],index=i+1,client=(turn.actor||'A')+':'+(turn.conversation||spec.id+'-conversation');
   const history=histories.get(client)||[];journal({event:'turn_start',id:spec.id,turn:index});
   const trace=await app.chat(turn,history,index);trace.scopeInspection=inspect(trace,spec,turn);traces.push(trace);
   const result={id:spec.id,category:spec.category,startedAt,completedAt:null,complete:false,traces};
   fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));
   const responsePath=path.join(E,'isolated_grader',spec.id+'_turn_'+index+'_response.json');
   fs.writeFileSync(responsePath,JSON.stringify({id:spec.id,category:spec.category,turnIndex:index,trace},null,2),{flag:'wx'});
   journal({event:'turn_observed',id:spec.id,turn:index,statusCode:trace.statusCode,providerAttempts:trace.providerRequests.length,potentialCriticalFindings:trace.scopeInspection.potentialCriticalFindings.length});
   if(trace.scopeInspection.potentialCriticalFindings.length)fs.writeFileSync(path.join(E,'SUSPECT_STOP.json'),JSON.stringify({id:spec.id,turn:index,at:new Date().toISOString(),inspection:trace.scopeInspection,action:'Pause for independent adjudication; no next turn.'},null,2));
   const gradePath=path.join(E,'isolated_grader',spec.id+'_turn_'+index+'_grade.json');
   const waiting=Date.now();let grade;
   while(!grade){
    if(Date.now()-waiting>360000)throw Error('Independent turn adjudication pending; execution halted');
    if(fs.existsSync(gradePath))try{grade=JSON.parse(fs.readFileSync(gradePath))}catch{}
    if(!grade)await delay(500);
   }
   if(grade.id!==spec.id||grade.turnIndex!==index)throw Error('Invalid independent grade');
   journal({event:'turn_adjudicated',id:spec.id,turn:index,status:grade.status,critical:Boolean(grade.critical),suspectedCritical:Boolean(grade.suspectedCritical)});
   if(grade.critical||grade.suspectedCritical){
    fs.writeFileSync(path.join(E,'SAFETY_STOP.json'),JSON.stringify({at:new Date().toISOString(),id:spec.id,turn:index,status:grade.critical?'CONFIRMED_CRITICAL':'SUSPECTED_CRITICAL',grade,action:'No further candidate execution. Preserve all remaining cases as UNTESTED.'},null,2),{flag:'wx'});break;
   }
   if(trace.scopeInspection.potentialCriticalFindings.length)throw Error('Scope inspection alert requires explicit coordinator adjudication; no continuation');
   const answer=trace.response?.reply||trace.response?.answer||'';
   if(turn.method==='DELETE')for(const key of histories.keys()){if(key.startsWith((turn.actor||'A')+':'))histories.delete(key)}
   else if(answer&&trace.statusCode===200)histories.set(client,[...history,{role:'user',content:turn.message},{role:'assistant',content:answer}]);
   if(i===spec.turns.length-1)completed=true;
  }
 }finally{
  await app.close();fs.writeFileSync(output,JSON.stringify({id:spec.id,category:spec.category,startedAt,completedAt:new Date().toISOString(),complete:completed,traces},null,2));
 }
 console.log(JSON.stringify({id:spec.id,complete:completed,turns:traces.length,stopped:fs.existsSync(path.join(E,'SAFETY_STOP.json'))}));
}
main().catch(error=>{journal({event:'execution_error',id:spec.id,error:error.message});console.error(error.stack);process.exitCode=1});
