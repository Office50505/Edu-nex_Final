const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createRequire}=require('module');
const workspaceRoot=path.resolve(__dirname,'../../..'),backendRoot=path.join(workspaceRoot,'edunex-b');
const R=createRequire(path.join(backendRoot,'server.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const LOCAL={nodeEnv:'development',backendUrl:'http://127.0.0.1:3129',host:'127.0.0.1',port:3129,
  clientApiBase:'http://10.0.2.2:3129',androidPackage:'com.skillomate.app.debug',emulatorSerial:'emulator-5554',
  database:'mongodb://127.0.0.1:27017/skillomate_nex_final_qa_20261114',
  transcriptDatabase:'mongodb://127.0.0.1:27017/edunex',redis:'redis://127.0.0.1:6379/13',
  productionConfigLoaded:false,backgroundJobsEnabled:false};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const loopback=host=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(host);
function providerConfig(){return require(path.join(workspaceRoot,'tmp/chai-junction-live-retest/gate.cjs')).providerConfig();}
function createGate({directory,configured=providerConfig(),now=Date.now}={}){
  if(!directory)fail('manual_qa_explicit_directory_required');
  const bytes=fs.readFileSync(path.join(directory,'session.json')),hash=sha(bytes),frozen=JSON.parse(bytes);
  if(fs.readFileSync(path.join(directory,'session.sha256'),'utf8').trim()!==hash
    ||frozen.schemaVersion!==2||frozen.maxProviderAttempts!==30||frozen.approvalDurationMinutes!==60
    ||frozen.maxOutputTokens!==4096||frozen.maxPayloadBytes!==262144||!same(frozen.environment,LOCAL)||!Array.isArray(frozen.excludedLessonKeys)
    ||frozen.cases.length!==21||frozen.courseIds.length!==9||new Set(frozen.courseIds).size!==9
    ||frozen.cases.filter(c=>c.kind==='course').length!==18||frozen.cases.filter(c=>c.kind==='cross_course').length!==3
    ||frozen.model!==configured.model||frozen.providerUrl!==configured.url
    ||configured.url!=='https://fal.run/openrouter/router/openai/v1/chat/completions')fail('manual_qa_invalid_session');
  const ledgerPath=path.join(directory,'provider_attempts.jsonl'),approvalPath=path.join(directory,'provider_approval.json');
  const responsesPath=path.join(directory,'responses.jsonl'),lockPath=path.join(directory,'provider_accounting.lock');
  function unchanged(){
    if(sha(fs.readFileSync(path.join(directory,'session.json')))!==hash)fail('manual_qa_invalid_session');
    for(const [name,expected]of Object.entries(frozen.bindings))if(sha(fs.readFileSync(path.join(directory,name)))!==expected)fail('manual_qa_invalid_session');
    const revision=JSON.parse(fs.readFileSync(path.join(directory,'source-revision.json')));
    if(frozen.bindings['source-revision.json']!==sha(fs.readFileSync(path.join(directory,'source-revision.json')))
      ||frozen.bindings['transcript-evidence.json']!==sha(fs.readFileSync(path.join(directory,'transcript-evidence.json')))
      ||revision.sources[path.relative(workspaceRoot,__filename)]!==sha(fs.readFileSync(__filename)))fail('manual_qa_invalid_session');
    for(const [name,expected]of Object.entries(revision.sources))if(sha(fs.readFileSync(path.join(workspaceRoot,name)))!==expected)fail('manual_qa_invalid_session');
  }
  function readJournal(file,sessionId,sessionHash,legacy=false){
    let rows;try{const text=fs.readFileSync(file,'utf8');if(!text.endsWith('\n'))throw Error();rows=text.trim().split('\n').map(JSON.parse);}catch{fail('manual_qa_ledger_invalid');}
    let previous='';for(let i=0;i<rows.length;i++){const {digest,...row}=rows[i];
      if(row.sessionId!==sessionId||row.sessionSHA256!==sessionHash||row.sequence!==i||row.previousHash!==previous
        ||(i===0?row.type!=='session_initialized':!['provider_invoked',...(!legacy?['request_completed']:[])].includes(row.type))
        ||sha(JSON.stringify(row))!==digest)fail('manual_qa_ledger_invalid');previous=digest;}
    if(!rows.length||rows.filter(r=>r.type==='provider_invoked').length>30)fail('manual_qa_ledger_invalid');return rows;
  }
  function priorRun(){
    if(!frozen.priorRun)return {attempts:0,outcomes:[]};
    const p=frozen.priorRun;
    for(const name of ['session','ledger','responses','nativeDeliveries','approval']){
      if(!p[name]?.path||sha(fs.readFileSync(p[name].path))!==p[name].sha256)fail('manual_qa_prior_run_changed');
    }
    const old=JSON.parse(fs.readFileSync(p.session.path)),approval=JSON.parse(fs.readFileSync(p.approval.path));
    if(old.schemaVersion!==1||old.maxProviderAttempts!==30||old.userId!==frozen.userId
      ||!same(old.cases,frozen.cases)||!same(old.initialHistory,frozen.initialHistory)
      ||old.model!==frozen.model||old.providerUrl!==frozen.providerUrl||approval.sessionSHA256!==p.session.sha256
      ||approval.sessionId!==old.sessionId||approval.maxProviderAttempts!==30)fail('manual_qa_invalid_prior_run');
    const entries=readJournal(p.ledger.path,old.sessionId,p.session.sha256,true),attempts=entries.length-1;
    if(p.providerAttempts!==attempts)fail('manual_qa_invalid_prior_run');
    const successes=fs.readFileSync(p.responses.path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const native=fs.readFileSync(p.nativeDeliveries.path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const outcomes=native.map((n,i)=>{
      const c=frozen.cases[i],r=successes.find(r=>r.caseId===n.caseId);
      if(!c||n.caseId!==c.id||n.question!==c.question||n.courseId!==c.courseId||n.lessonId!==c.lessonId
        ||!n.renderedInNativePlayer||!n.conversationId||typeof n.answer!=='string'
        ||(!n.failed&&(!r||r.answer!==n.answer||r.question!==c.question||r.conversationId!==n.conversationId))
        ||(n.failed&&(r||!['unavailable','provider_fallback'].includes(n.outcome?.type))))fail('manual_qa_invalid_prior_run');
      return {caseId:c.id,conversationGroup:c.conversationGroup,conversationId:n.conversationId,question:c.question,
        answer:n.answer,delivered:!n.failed,source:'frozen_native_delivery',outcome:n.outcome};
    });
    if(successes.length!==outcomes.filter(r=>r.delivered).length)fail('manual_qa_invalid_prior_run');
    return {attempts,outcomes};
  }
  function ledger(){return readJournal(ledgerPath,frozen.sessionId,hash);}
  const count=()=>{const n=priorRun().attempts+ledger().filter(r=>r.type==='provider_invoked').length;if(n>30)fail('manual_qa_ledger_invalid');return n;};
  function outcomes(){return [...priorRun().outcomes,...ledger().filter(r=>r.type==='request_completed')];}
  function append(row){const entries=ledger();row={...row,sequence:entries.length,sessionId:frozen.sessionId,sessionSHA256:hash,previousHash:entries.at(-1).digest};
    const fd=fs.openSync(ledgerPath,'a',0o600);try{fs.writeFileSync(fd,JSON.stringify({...row,digest:sha(JSON.stringify(row))})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return row;}
  function locked(fn){let lock;try{lock=fs.openSync(lockPath,'wx',0o600);}catch{fail('manual_qa_accounting_busy');}
    try{return fn();}finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}}
  function approvalState(){
    unchanged();if(!fs.existsSync(approvalPath))return {active:false,reason:'manual_qa_awaiting_approval'};
    let a;try{a=JSON.parse(fs.readFileSync(approvalPath));}catch{fail('manual_qa_invalid_approval');}
    if(a.sessionSHA256!==hash||a.sessionId!==frozen.sessionId||a.maxProviderAttempts!==30||a.model!==frozen.model
      ||a.userId!==frozen.userId||Date.parse(a.expiresAt)-Date.parse(a.issuedAt)!==3600000
      ||Date.parse(a.issuedAt)>now())fail('manual_qa_invalid_approval');
    if(a.approved!==true)return {active:false,reason:'manual_qa_closed'};
    if(!(Date.parse(a.expiresAt)>now()))return {active:false,reason:'manual_qa_expired'};
    return {active:true,approval:a};
  }
  function matchedCase(req){
    const done=outcomes(),seen=new Set(done.map(r=>r.caseId)),next=frozen.cases.find(c=>!seen.has(c.id)),last=done.at(-1);
    const candidates=[next,last&&!last.delivered?frozen.cases.find(c=>c.id===last.caseId):null].filter(Boolean);
    return candidates.find(c=>req.body?.message===c.question&&req.body?.courseId===c.courseId&&req.body?.lessonId===c.lessonId)||null;
  }
  function assertRequest(req,environment,requestPath){
    unchanged();if(!same(environment,LOCAL)||!['/api/ai/chat','/api/course-ai/chat'].includes(requestPath)
      ||req.method!=='POST'||!loopback(req.socket?.remoteAddress)||!loopback(req.socket?.localAddress)
      ||!['127.0.0.1:3129','localhost:3129','10.0.2.2:3129'].includes(req.headers?.host))fail('manual_qa_environment_mismatch');
    const c=matchedCase(req),body=req.body;
    if(!c||String(req.compatAuth?.userId)!==frozen.userId||body.assistantName!=='Course AI'
      ||!/^lesson-[\w-]+$/.test(body.conversationId||'')||body.activeCourseId&&body.activeCourseId!==c.courseId)fail('manual_qa_scope_denied');
    const prior=outcomes().filter(r=>r.conversationGroup===c.conversationGroup);
    if(prior.some(r=>r.conversationId!==body.conversationId))fail('manual_qa_scope_denied');
    if(!prior.length&&outcomes().some(r=>r.conversationGroup!==c.conversationGroup&&r.conversationId===body.conversationId))fail('manual_qa_scope_denied');
    const history=[...(frozen.initialHistory||[]),...prior.flatMap(r=>[{role:'user',content:r.question.trim()},...(r.delivered?[{role:'assistant',content:r.answer.trim()}]:[])])];
    if(!same(body.history,history))fail('manual_qa_scope_denied');
    return c;
  }
  function consume(payload,context){
    const c=assertRequest(context?.req||{},context?.environment,context?.path);
    const k=context.knowledge;
    if((k?.records||[]).some(r=>[...frozen.excludedLessonKeys,...(k.excludedLessonKeys||[])].includes(r.courseId+':'+r.lessonId)))fail('manual_qa_scope_denied');
    const transcripts=(k?.records||[]).filter(r=>r.sourceType==='transcript');
    if(k?.viewingCourse?.id!==c.courseId||k?.viewingLesson?.id!==c.lessonId
      ||k?.unifiedAccess?.policy!=='nex-ai-all-integrated-v1')fail('manual_qa_scope_denied');
    const evidence=JSON.parse(fs.readFileSync(path.join(directory,'transcript-evidence.json')));
    for(const row of transcripts){const expected=evidence.chunks.find(r=>r.id===row.chunkId);
      if(!expected||row.documentId==='AI-Influencer:Lesson-01'||expected.contentHash!==row.contentHash
        ||expected.courseId!==row.courseId||expected.lessonId!==row.lessonId
        ||expected.startSeconds!==row.startSeconds||expected.endSeconds!==row.endSeconds)fail('manual_qa_scope_denied');}
    for(const id of c.sourceExpectations.requiredTranscriptDocuments||[])if(!transcripts.some(r=>r.documentId===id))fail('manual_qa_scope_denied');
    if(c.sourceExpectations.missingTranscriptExpected&&transcripts.some(r=>r.courseId===c.courseId))fail('manual_qa_scope_denied');
    if(payload.model!==frozen.model)fail('manual_qa_model_mismatch');
    if(!Number.isInteger(payload.max_tokens)||payload.max_tokens<=0||payload.max_tokens>4096
      ||Buffer.byteLength(JSON.stringify(payload))>262144||payload.messages?.[0]?.role!=='system'
      ||!payload.messages.some(m=>m.role==='user'&&m.content.includes(c.question)))fail('manual_qa_invalid_payload');
    return locked(()=>{assertRequest(context.req,context.environment,context.path);const state=approvalState();if(!state.active)fail(state.reason);
      if(typeof context.requestId!=='string'||!context.requestId)fail('manual_qa_invalid_request');
      const entries=ledger(),used=count();if(used>=30)fail('manual_qa_budget_exhausted');
      const pending=entries.at(-1);if(pending.type==='provider_invoked'&&pending.requestId!==context.requestId)fail('manual_qa_request_pending');
      const text=JSON.stringify(payload.messages),kind=text.includes('Continue only its missing suffix')?'continuation':text.includes('Revise the failed assistant draft')?'repair':entries.some(r=>r.requestId===context.requestId)?'retry':'generation';
      return append({type:'provider_invoked',time:new Date(now()).toISOString(),approvalId:state.approval.approvalId,
        requestId:context.requestId,caseId:c.id,attemptKind:kind,model:payload.model,payloadBytes:Buffer.byteLength(JSON.stringify(payload))});
    });
  }
  function complete(req,response,status,{requestId}={}){
    return locked(()=>{
      const c=assertRequest(req,LOCAL,'/api/ai/chat'),entries=ledger();
      if(!requestId||entries.some(r=>r.type==='request_completed'&&r.requestId===requestId))fail('manual_qa_invalid_completion');
      if(entries.at(-1).type==='provider_invoked'&&entries.at(-1).requestId!==requestId)fail('manual_qa_request_pending');
      const state=approvalState(),accounted=entries.some(r=>r.type==='provider_invoked'&&r.requestId===requestId&&r.caseId===c.id);
      if(!state.active&&!accounted)fail(state.reason);
      if(!Number.isInteger(status)||status<200||status>599)fail('manual_qa_invalid_completion');
      const delivered=status===200&&typeof response?.answer==='string'&&Boolean(response.answer.trim())
        &&!['provider_fallback','unavailable'].includes(response.outcome?.type)
        &&!(response.provider==='built-in-course-guide'&&response.outcome?.type!=='local_rule');
      const row=append({type:'request_completed',caseId:c.id,conversationGroup:c.conversationGroup,
        conversationId:req.body.conversationId,question:c.question,answer:response?.answer||response?.error||'',
        delivered,status,requestId,provider:response?.provider||null,outcome:response?.outcome||null,
        sources:response?.sources||[],time:new Date(now()).toISOString()});
      // Compatibility evidence is derived from the journal. It never drives
      // scope, progress, retry history or the shared provider attempt count.
      if(delivered)fs.appendFileSync(responsesPath,JSON.stringify(row)+'\n',{mode:0o600});
      return row;
    });
  }
  function authorize(expectedHash){
    unchanged();if(expectedHash!==hash||fs.existsSync(approvalPath)||ledger().length!==1)fail('manual_qa_invalid_approval');
    const a={approved:true,approvalId:crypto.randomUUID(),sessionId:frozen.sessionId,sessionSHA256:hash,
      model:frozen.model,userId:frozen.userId,maxProviderAttempts:30,issuedAt:new Date(now()).toISOString(),expiresAt:new Date(now()+3600000).toISOString()};
    const fd=fs.openSync(approvalPath,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(a,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return a;
  }
  function status(){const a=approvalState(),used=count();return {sessionSHA256:hash,approvalStatus:used>=30?'manual_qa_budget_exhausted':a.reason||'active',approved:a.active&&used<30,providerAttempts:used,maximumProviderAttempts:30,remainingProviderAttempts:30-used,expiresAt:a.approval?.expiresAt||null,completedQuestions:new Set(outcomes().filter(r=>r.delivered).map(r=>r.caseId)).size,recordedQuestions:new Set(outcomes().map(r=>r.caseId)).size,nextCaseId:frozen.cases.find(c=>!outcomes().some(r=>r.caseId===c.id))?.id||null};}
  unchanged();priorRun();ledger();return {frozen,hash,configured,ledgerPath,approvalPath,approvalState,count,status,consume,complete,matchedCase,authorize,assertRequest,outcomes};
}
module.exports={createGate,LOCAL,backendRoot,backendRequire:R,providerConfig,sha};
