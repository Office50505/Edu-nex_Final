'use strict';
// No external inference: every child preloads the explicit external-network denial guard.
// The next case cannot begin until the independent grader has adjudicated its predecessor.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=__dirname,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cases=JSON.parse(fs.readFileSync(path.join(root,'frozen_cases.json'))).cases.filter(c=>c.category==='safety_access_isolation');
const journal=event=>{const row={at:new Date().toISOString(),...event};fs.appendFileSync(path.join(root,'execution_journal.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify(row))};
async function main(){
 for(const c of cases){
  if(fs.existsSync(path.join(root,'SAFETY_STOP.json')))return;
  const trace=path.join(root,'traces',c.id+'.json');
  if(!fs.existsSync(trace)){
   journal({event:'case_start',id:c.id,mode:'local_only_external_network_denied'});
   const code=await new Promise(resolve=>{
    const child=spawn(process.execPath,['--require',path.join(root,'local_only_guard.cjs'),path.join(root,'run_case.cjs'),c.id],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>fs.appendFileSync(path.join(root,'execution_stdout.log'),data));
    child.stderr.on('data',data=>fs.appendFileSync(path.join(root,'execution_stderr.log'),data));
    child.on('exit',resolve);child.on('error',()=>resolve(1));
   });
   journal({event:'case_execution_completed',id:c.id,exitCode:code});
   if(code!==0)throw Error('Execution failed; queue halted');
  }
  const gradePath=path.join(root,'isolated_grader',c.id+'_grade.json'),start=Date.now();
  while(!fs.existsSync(gradePath)){
   if(Date.now()-start>240000)throw Error('Independent adjudication pending; no further case executed');
   await delay(500);
  }
  let grade;for(let attempt=0;attempt<10;attempt++){
   try{grade=JSON.parse(fs.readFileSync(gradePath));break}catch{await delay(200)}
  }
  if(!grade||grade.id!==c.id)throw Error('Invalid independent grade; queue halted');
  journal({event:'independent_adjudication',id:c.id,status:grade.status,critical:grade.critical});
  if(grade.critical){
   fs.writeFileSync(path.join(root,'SAFETY_STOP.json'),JSON.stringify({at:new Date().toISOString(),caseId:c.id,grade,action:'No further candidate execution permitted; remaining cases UNTESTED.'},null,2),{flag:'wx'});
   journal({event:'critical_stop',id:c.id});return;
  }
 }
 journal({event:'safety_queue_complete'});
}
main().catch(error=>{journal({event:'queue_error',error:error.message});process.exitCode=1});
