'use strict';
// Known regression reproduction only; never reruns or rescores the stopped blind evaluation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {makeApp}=require('./local_pipeline.cjs');
const {PRODUCT_TEMPLATES}=require(path.join(process.cwd(),'services/productTutorKnowledge'));
const stage=process.env.ISOLATION_STAGE||'after';
const label=process.env.ISOLATION_EVIDENCE_LABEL||stage;
if(!/^[a-z0-9_]+$/i.test(label))throw Error('Invalid evidence label');
if(!['before','after'].includes(stage))throw Error('Unknown stage');
const compact=s=>String(s).replace(/\s+/gu,' ').trim();
async function main(){
 const cases=[];
 for(const suffix of['009','010']){
  const id='B14-SAFETY_ACCESS_ISOLATION-'+suffix;
  const original=JSON.parse(fs.readFileSync(path.join(__dirname,id+'_original_trace.json')));
  const app=await makeApp({id:'known-regression-'+id,access:'active'});
  let trace;try{trace=await app.chat({message:original.traces[0].request.message,course:'other'},[],1)}finally{await app.close()}
  const messages=trace.providerRequests.flatMap(p=>p.request.messages||[]);
  const matchedBodies=PRODUCT_TEMPLATES.filter(asset=>messages.some(m=>compact(m.content).includes(compact(asset.content)))).map(a=>a.heading);
  const sent=trace.providerRequests.filter(p=>p.httpStatus||p.error?.code!=='PROVIDER_PAYLOAD_NOT_APPROVED').length;
  if(sent)throw Error('Unexpected external transport; stop');
  cases.push({id,stage,trace,inspection:{productBodiesInProviderMessages:matchedBodies,externalRequestsSent:sent,retrievedCourseIds:trace.response?.debug?.retrieved_course_ids,
   expectedCurrentCourse:'6e0000000000000000000000',regressionPass:stage==='before'?matchedBodies.length>0:matchedBodies.length===0&&trace.response?.debug?.retrieved_course_ids.every(x=>x==='6e0000000000000000000000')}});
 }
 const out={stage,label,at:new Date().toISOString(),sourceHashes:Object.fromEntries(['services/aiTutorService.js','services/tutorKnowledge.js','routes/ai.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(stage==='before'?path.join(__dirname,'baseline_source'):process.cwd(),name))).digest('hex')])),method:'Actual unmodified route/auth/service loaded from saved Phase14A1 baseline or current corrected source; synthetic DB/models/users/JWT/provider credential; external fetch/socket denied. No model fixture responses.',cases};
 fs.writeFileSync(path.join(__dirname,label+'_known_pipeline_results.json'),JSON.stringify(out,null,2),{flag:'wx'});
 console.log(JSON.stringify(cases.map(c=>({id:c.id,...c.inspection})),null,2));
 if(cases.some(c=>!c.inspection.regressionPass))process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
