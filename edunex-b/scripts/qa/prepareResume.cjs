// Offline-only source freeze. This creates an unapproved successor, never
// mutates the old run and never refreshes an existing approval or attempt log.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('./sourceBoundGate.cjs'),workspace=path.resolve(__dirname,'../../..');
function prepareResume({previousDirectory,directory,configured=G.providerConfig()}){
 const old=path.resolve(previousDirectory),dir=path.resolve(directory);
 if(fs.existsSync(dir))throw Error('Resume destination must be new; never reset a session');
 const read=name=>JSON.parse(fs.readFileSync(path.join(old,name))),previous=read('session.json');
 const priorRun={providerAttempts:read('live-preservation.json').gate.providerAttempts};
 for(const [name,file]of Object.entries({session:'session.json',ledger:'provider_attempts.jsonl',responses:'responses.jsonl',nativeDeliveries:'native-delivered.jsonl',approval:'provider_approval.json'})){
   const p=path.join(old,file);priorRun[name]={path:p,sha256:G.sha(fs.readFileSync(p))};
 }
 if(fs.readFileSync(path.join(old,'session.sha256'),'utf8').trim()!==priorRun.session.sha256)throw Error('Prior session hash mismatch');
 const sources=Object.fromEntries(Object.keys(read('source-revision.json').sources).map(file=>[file,G.sha(fs.readFileSync(path.join(workspace,file)))]));
 // New runtime modules and additive source packs must also be bound. Reusing
 // only the original file list would leave a newly added loader unapproved.
 const bindTree=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);if(entry.isDirectory())bindTree(file);
   else if(entry.isFile())sources[path.relative(workspace,file)]=G.sha(fs.readFileSync(file));
 }};
 for(const dir of ['services','knowledge','course-knowledge','transcripts','scripts/qa'])bindTree(path.join(workspace,'edunex-b',dir));
 for(const file of [__filename,path.join(__dirname,'sourceBoundGate.cjs')])sources[path.relative(workspace,file)]=G.sha(fs.readFileSync(file));
 // Bind the quarantine to the session rather than trusting a future request
 // to carry the correct exclusion metadata.
 const index=G.backendRequire('./services/transcriptDataset').loadIndex();
 const excludedLessonKeys=(index.mappings||[]).filter(m=>m.status==='quarantined'&&m.candidate?.courseId&&m.candidate?.videoId).map(m=>m.candidate.courseId+':'+m.candidate.videoId);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 for(const name of Object.keys(previous.bindings).filter(n=>n!=='source-revision.json'))fs.copyFileSync(path.join(old,name),path.join(dir,name),fs.constants.COPYFILE_EXCL);
 const gateWrapper=`const G=require(${JSON.stringify(path.join(__dirname,'sourceBoundGate.cjs'))});module.exports={...G,createGate:(options={})=>G.createGate({directory:__dirname,...options})};\n`;
 fs.writeFileSync(path.join(dir,'gate.cjs'),gateWrapper,{flag:'wx'});
 const server=fs.readFileSync(path.join(old,'server.cjs'),'utf8').replace('gate.complete(req,response,res.statusCode);','gate.complete(req,response,res.statusCode,{requestId:state.requestId});');
 if(server===fs.readFileSync(path.join(old,'server.cjs'),'utf8'))throw Error('Completion adapter identity changed');
 fs.writeFileSync(path.join(dir,'server.cjs'),server,{flag:'wx'});
 for(const file of ['gate.cjs','server.cjs'])sources[path.relative(workspace,path.join(dir,file))]=G.sha(fs.readFileSync(path.join(dir,file)));
 fs.mkdirSync(path.join(dir,'.runtime'),{mode:0o700});
 fs.copyFileSync(path.join(old,'.runtime/credentials.json'),path.join(dir,'.runtime/credentials.json'),fs.constants.COPYFILE_EXCL);fs.chmodSync(path.join(dir,'.runtime/credentials.json'),0o600);
 save('source-revision.json',{sources});
 const bindings=Object.fromEntries(Object.keys(previous.bindings).map(name=>[name,G.sha(fs.readFileSync(path.join(dir,name)))]));
 const session={...previous,schemaVersion:2,sessionId:crypto.randomUUID(),priorRun,excludedLessonKeys,bindings};save('session.json',session);
 const hash=G.sha(fs.readFileSync(path.join(dir,'session.json')));fs.writeFileSync(path.join(dir,'session.sha256'),hash+'\n',{flag:'wx'});
 const initial={type:'session_initialized',sequence:0,sessionId:session.sessionId,sessionSHA256:hash,previousHash:''};
 fs.writeFileSync(path.join(dir,'provider_attempts.jsonl'),JSON.stringify({...initial,digest:G.sha(JSON.stringify(initial))})+'\n',{flag:'wx',mode:0o600});
 // createGate verifies historical ledger chain, native outcomes and all frozen
 // files. No approval is copied or activated for the changed code.
 const status=G.createGate({directory:dir,configured}).status();save('prepared-resume.json',{...status,offlineOnly:true,liveReadiness:'NOT_CHECKED',paidCallsThisPreparation:0});
 return status;
}
if(require.main===module){const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--from'||args[2]!=='--to')throw Error('Use --from ORIGINAL_RUN --to NEW_DIRECTORY');console.log(JSON.stringify(prepareResume({previousDirectory:args[1],directory:args[3]}),null,2));}
module.exports={prepareResume};
