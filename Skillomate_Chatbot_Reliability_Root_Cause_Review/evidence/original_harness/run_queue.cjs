'use strict';
// Every child blocks external networking and every turn waits for independent adjudication.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const E=__dirname,freeze=JSON.parse(fs.readFileSync(path.join(E,'evaluation_freeze.json')));
async function main(){
 for(const id of freeze.executionOrder){
  if(fs.existsSync(path.join(E,'SAFETY_STOP.json'))||fs.existsSync(path.join(E,'SUSPECT_STOP.json')))break;
  const existing=path.join(E,'traces',id+'.json');
  if(fs.existsSync(existing)){if(!JSON.parse(fs.readFileSync(existing)).complete)throw Error('Incomplete existing case; no automatic rerun');continue}
  console.log(JSON.stringify({event:'case_start',id,at:new Date().toISOString()}));
  const code=await new Promise(resolve=>{
   const child=spawn(process.execPath,['--require',path.join(E,'local_only_guard.cjs'),path.join(E,'run_case.cjs'),id],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',data=>{fs.appendFileSync(path.join(E,'execution_stdout.log'),data);process.stdout.write(data)});
   child.stderr.on('data',data=>fs.appendFileSync(path.join(E,'execution_stderr.log'),data));
   child.on('exit',resolve);child.on('error',()=>resolve(1));
  });
  if(code!==0)throw Error('Execution stopped; see journal. No future case started.');
 }
 console.log(JSON.stringify({event:'queue_finished',safetyStop:fs.existsSync(path.join(E,'SAFETY_STOP.json')),at:new Date().toISOString()}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
