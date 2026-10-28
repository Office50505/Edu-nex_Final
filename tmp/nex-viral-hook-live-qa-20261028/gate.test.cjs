// Fully offline: fake key and mock transport; fixture approvals live only in OS temp.
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createGate,LOCAL}=require('./gate.cjs');
const {requestTutorProvider}=require('../../edunex-b/services/tutorProvider');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'viral-qa-offline-'));
 for(const f of ['session.json','session.sha256','source-revision.json','provider_attempts.jsonl'])fs.copyFileSync(path.join(__dirname,f),path.join(directory,f));
 fs.writeFileSync(path.join(directory,'pipeline_traces.jsonl'),'');
 const s=JSON.parse(fs.readFileSync(path.join(directory,'session.json')));let now=Date.now();
 const options={directory,configured:{key:'OFFLINE-ONLY',model:s.model,url:s.provider_url},now:()=>now};const gate=createGate(options);
 const req={method:'POST',headers:{host:'127.0.0.1:3129'},socket:{remoteAddress:'127.0.0.1',localAddress:'127.0.0.1'},compatAuth:{userId:s.user_id},body:{activeCourseId:s.course_id,conversationId:'qa-one',message:'Create three hooks for urban beekeeping.'}};
 const context={req,path:'/api/ai/chat',environment:LOCAL,requestId:'offline-request',knowledge:{activeCourse:{id:s.course_id},materialsAvailable:true}};
 const payload={model:s.model,max_tokens:900,messages:[{role:'system',content:'Authorized isolated course context'}]};
 return {directory,gate,options,req,context,payload,advance:ms=>{now+=ms},cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
function run(fn){const f=fixture();try{return fn(f)}finally{f.cleanup()}}
test('unapproved session has no timer, four attempts, and blocks client approval flags',()=>run(f=>{
 assert.equal(f.gate.status().remainingProviderAttempts,4);assert.equal(f.gate.status().expiresAt,null);
 Object.assign(f.req.body,{approved:true,max_calls:999});assert.throws(()=>f.gate.consume(f.payload,f.context),{code:'manual_qa_awaiting_approval'});assert.equal(f.gate.count(),0);
}));
test('four total attempts span questions, followups, new conversations and restarts; fifth blocked',()=>run(f=>{
 f.gate.authorize(f.gate.hash);
 for(let i=1;i<=4;i++){f.req.body.message='Different question '+i;f.req.body.conversationId='conversation-'+i;assert.equal(createGate(f.options).consume(f.payload,f.context),i)}
 assert.throws(()=>createGate(f.options).consume(f.payload,f.context),{code:'manual_qa_budget_exhausted'});assert.equal(f.gate.count(),4);
 assert.throws(()=>f.gate.authorize(f.gate.hash),{code:'manual_qa_invalid_approval'});
}));
test('expiry starts at approval, lasts exactly 30 minutes and survives restart',()=>run(f=>{
 f.advance(60*60000);assert.equal(f.gate.status().expiresAt,null);const a=f.gate.authorize(f.gate.hash);
 assert.equal(Date.parse(a.expires_at)-Date.parse(a.issued_at),30*60000);f.advance(30*60000);
 assert.throws(()=>createGate(f.options).consume(f.payload,f.context),{code:'manual_qa_expired'});assert.equal(f.gate.count(),0);
}));
for(const [name,mutate,code]of[
 ['wrong account',f=>f.req.compatAuth.userId='other','scope_denied'],
 ['wrong course',f=>f.req.body.activeCourseId='other','scope_denied'],
 ['conflicting course',f=>f.req.body.courseId='other','scope_denied'],
 ['no entitlement',f=>f.context.knowledge.materialsAvailable=false,'scope_denied'],
 ['production database',f=>f.context.environment={...LOCAL,database:'mongodb://production.invalid/db'},'environment_mismatch'],
 ['external host',f=>f.req.headers.host='api.skillomate.in','environment_mismatch'],
 ['different model',f=>f.payload.model='other','model_mismatch'],
])test('rejects '+name+' before accounting',()=>run(f=>{f.gate.authorize(f.gate.hash);mutate(f);assert.throws(()=>f.gate.consume(f.payload,f.context),{code:'manual_qa_'+code});assert.equal(f.gate.count(),0)}));
test('missing, empty, truncated and tampered ledgers fail closed',()=>{
 for(const alter of [p=>fs.unlinkSync(p),p=>fs.writeFileSync(p,''),p=>fs.appendFileSync(p,'{'),p=>fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('session_initialized','reset'))])run(f=>{alter(f.gate.ledgerPath);assert.throws(()=>createGate(f.options),{code:'manual_qa_ledger_invalid'})});
});
test('approval cannot enlarge budget or duration',()=>{
 for(const mutate of [a=>a.max_calls=5,a=>a.expires_at=new Date(Date.parse(a.issued_at)+31*60000).toISOString()])run(f=>{const a=f.gate.authorize(f.gate.hash);mutate(a);fs.writeFileSync(f.gate.approvalPath,JSON.stringify(a));assert.throws(()=>f.gate.consume(f.payload,f.context),{code:'manual_qa_invalid_approval'})});
});
test('retry and repair share the durable four-attempt counter',async()=>{
 const f=fixture();try{
 f.gate.authorize(f.gate.hash);let calls=0;const fetchImpl=async()=>{f.gate.consume(f.payload,f.context);calls++;return calls===1?{ok:false,status:503}:{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({text:'Mock response'})}};
 for(let i=0;i<3;i++)await requestTutorProvider({url:f.gate.frozen.provider_url,key:'OFFLINE-ONLY',payload:f.payload,fetchImpl,extractText:v=>v.text,sleep:async()=>{}});
 assert.equal(calls,4);assert.equal(createGate(f.options).count(),4);
 await assert.rejects(requestTutorProvider({url:f.gate.frozen.provider_url,key:'OFFLINE-ONLY',payload:f.payload,fetchImpl,extractText:v=>v.text,sleep:async()=>{}}),e=>e.code==='manual_qa_budget_exhausted'&&e.diagnostics.attempts.length===1);
 assert.equal(calls,4);
 }finally{f.cleanup()}
});
test('close keeps ledger and disallows reopening',()=>run(f=>{f.gate.authorize(f.gate.hash);f.gate.consume(f.payload,f.context);f.gate.close();assert.equal(f.gate.count(),1);assert.throws(()=>f.gate.authorize(f.gate.hash),{code:'manual_qa_invalid_approval'})}));
