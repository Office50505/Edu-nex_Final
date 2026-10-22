// Evaluation launcher only. Runs the existing server/routes/auth against a fresh local DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const root = path.resolve(__dirname, '../..');
const report = path.resolve(process.env.SKILLOMATE_EVAL_REPORT || path.join(root, 'reports/mvp_launch_20261017'));
fs.mkdirSync(report, { recursive: true });
const dotenv = require('dotenv');
const configured = Object.assign({}, ...['.env', '.env.local'].filter(p => fs.existsSync(path.join(root,p))).map(p => dotenv.parse(fs.readFileSync(path.join(root,p)))));
const providerUrl = configured.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions';
if (providerUrl !== 'https://fal.run/openrouter/router/openai/v1/chat/completions') throw Error('Unexpected configured provider endpoint');
const providerKey = configured.FAL_API_KEY || configured.FAL_KEY || '';
const model = configured.FAL_OPENROUTER_MODEL || configured.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash';
for (const key of Object.keys(process.env)) if (!['PATH','HOME','TMPDIR','LANG','TERM','TZ'].includes(key)) delete process.env[key];
const runtimeDir = fs.mkdtempSync('/private/tmp/skillomate-mvp-');
fs.chmodSync(runtimeDir, 0o700);
const runtimePath = path.join(runtimeDir, 'runtime.json');
const dbName = `skillomate_mvp_eval_20261017_${Date.now()}`;
const mongoUri = `mongodb://127.0.0.1:27017/${dbName}`;
Object.assign(process.env, { NODE_ENV:'development', HOST:'127.0.0.1', PORT:'3127', MONGODB_URI:mongoUri,
  JWT_SECRET:crypto.randomBytes(48).toString('hex'), DISABLE_BACKGROUND_JOBS:'true', SERVE_FRONTEND:'false',
  SKILLOMATE_CONFIG_SOURCE:'env', FAL_API_KEY:providerKey, FAL_OPENROUTER_MODEL:model, FAL_OPENROUTER_URL:providerUrl });
// Configuration is supplied above; production dotenv files must not override local isolation.
dotenv.config = () => ({ parsed:{} });
const als = new AsyncLocalStorage();
const tracePath = path.join(report, 'pipeline_traces.jsonl');
let providerCalls = fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.type === 'provider_invoked').length : 0;
function event(type,data={}) { fs.appendFileSync(path.join(report,'pipeline_traces.jsonl'),JSON.stringify({time:new Date().toISOString(),run:als.getStore()?.run||'',case:als.getStore()?.case||'',turn:als.getStore()?.turn||'',type,...data})+'\n'); }
function approval() { try {const p=JSON.parse(fs.readFileSync(path.join(report,'provider_approval.json'))); const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'test_cases.json'))).digest('hex'); return p.approved===true && p.model===model && p.cases_sha256===hash && Number.isInteger(p.max_calls) && p.max_calls>0 && p.max_calls<=60 && Date.parse(p.expires_at)>Date.now() ? p : null;} catch{return null;} }
function allowed(host) {return ['127.0.0.1','::1','localhost'].includes(String(host)) || host==='fal.run'&&Boolean(approval());}
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {const a=Array.isArray(args[0])?args[0]:args; const first=a[0]; const host=typeof first==='object'?first.host||first.hostname||'localhost':typeof a[1]==='string'?a[1]:'localhost'; if(!allowed(host)){event('network_blocked',{host:String(host)});throw Error('Evaluation network boundary');}return originalConnect.apply(this,args);};
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url, options={}) {
  const u=new URL(String(url));
  if (u.href===providerUrl) {
    const payload=JSON.parse(options.body||'{}');
    const state=als.getStore();
    const knowledge=state?.knowledge;
    const scope={activeCourse:knowledge?.activeCourse?{_id:knowledge.activeCourse.id,slug:knowledge.activeCourse.slug}:null,includeMaterials:Boolean(knowledge?.materialsAvailable)};
    let scopeError=null;
    try {for(const m of payload.messages||[]) require('../../services/tutorKnowledge').assertCourseTextScope(m.content,scope);} catch(e){scopeError=e.message;}
    event('provider_payload',{payload,scope,scope_error:scopeError,characters:JSON.stringify(payload).length});
    if(scopeError) {event('critical_security_failure',{reason:scopeError});throw Error('Scope inspection failed');}
    const p=approval();
    if(!p || providerCalls>=p.max_calls || payload.model!==model || payload.max_tokens>900 || JSON.stringify(payload).length>120000) {event('provider_blocked',{reason:!p?'awaiting_explicit_approval':'call_or_payload_budget'});throw Error('External inference not approved or budget exhausted');}
    providerCalls++;
    event('provider_invoked',{call:providerCalls,model});
    const started=Date.now();
    const response=await originalFetch(url,{...options,redirect:'error'});
    if(response.ok){try {const data=await response.clone().json();event('provider_response',{call:providerCalls,status:response.status,latency_ms:Date.now()-started,data});}catch{event('provider_response_unreadable',{call:providerCalls,status:response.status});}}
    else event('provider_http_error',{call:providerCalls,status:response.status,latency_ms:Date.now()-started});
    return response;
  }
  if(!allowed(u.hostname)||u.hostname==='fal.run') throw Error('Evaluation fetch boundary');
  return originalFetch(url,options);
};
const http=require('node:http');
const oldEmit=http.Server.prototype.emit;
http.Server.prototype.emit=function(name,...args){if(name==='request'){const req=args[0];return als.run({run:req.headers['x-eval-run']||'',case:req.headers['x-eval-case']||'',turn:req.headers['x-eval-turn']||''},()=>oldEmit.call(this,name,...args));}return oldEmit.call(this,name,...args);};
const knowledgeModule=require('../../services/tutorKnowledge');
const originalRetrieval=knowledgeModule.retrieveKnowledge;
knowledgeModule.retrieveKnowledge=function(input){const result=originalRetrieval(input);event('retrieval',{input,result});return result;};
const service=require('../../services/aiTutorService');
const originalContext=service.buildContext;
service.buildContext=async function(...args){const result=await originalContext(...args);const state=als.getStore();if(state)state.knowledge=result;event('context',{knowledge:result});return result;};
async function main(){
  const mongoose=require('mongoose');
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:5000});
  // Refuse to overwrite any prior database rather than resetting test or user data.
  if((await mongoose.connection.db.listCollections().toArray()).length) throw Error('Synthetic database already exists; choose a new task DB');
  const Category=require('../../models/Category'),Course=require('../../models/Course'),User=require('../../models/User');
  const category=await Category.create({name:'Local MVP evaluation',slug:'local-mvp-evaluation'});
  const {PRODUCT_RECORDS}=require('../../services/productTutorKnowledge');
  const course=await Course.create({title:'AI Product Photoshoot & Ads',slug:'ai-product-photoshoot-ads',description:'Synthetic local course record using approved on-disk course knowledge.',category:category._id,status:'published',videos:PRODUCT_RECORDS.filter(x=>x.contentType==='lesson-summary').map(x=>({title:x.heading,order:x.lessonNumber,description:`Public lesson overview: ${x.heading}`,provider:'youtube',youtubeId:'MVPTEST0001'}))});
  const other=await Course.create({title:'AI Influencer',slug:'ai-influencer',description:'Synthetic local course for authorization checks.',category:category._id,status:'published',videos:[]});
  const users={};
  // Separate users for each case avoid both state coupling and artificial rate-limit changes.
  const cases=JSON.parse(fs.readFileSync(path.join(root,'test_cases.json'))).cases;
  for(const c of cases){const sessionId=crypto.randomUUID();const entitled=c.identity!=='inactive'&&c.identity!=='other_only';const granted=c.identity==='other_only'?other._id:course._id;const user=await User.create({fullName:`Synthetic ${c.id}`,email:`${c.id.toLowerCase()}@mvp.invalid`,isOnTrial:false,subscriptionStatus:'none',activeSessionId:sessionId,purchasedCourses:c.identity==='inactive'?[course._id]:[],courseEntitlements:c.identity==='inactive'?[{course:course._id,accessType:'yearly',expiresAt:new Date(Date.now()-86400000)}]:entitled||c.identity==='other_only'?[{course:granted,accessType:'permanent'}]:[]});users[c.id]={id:String(user._id),token:require('jsonwebtoken').sign({userId:String(user._id),sessionId},process.env.JWT_SECRET,{expiresIn:'2h'}),authorized_course_ids:entitled?[String(course._id)]:c.identity==='other_only'?[String(other._id)]:[]};}
  const runtime={pid:process.pid,base_url:'http://127.0.0.1:3127',db_name:dbName,course_id:String(course._id),other_course_id:String(other._id),unknown_course_id:String(new mongoose.Types.ObjectId()),users,model,provider_url:providerUrl,provider_key_present:Boolean(providerKey)};
  fs.writeFileSync(runtimePath,JSON.stringify(runtime),{mode:0o600});
  fs.writeFileSync(path.join(report,'runtime_location.txt'),runtimePath+'\n');
  console.log('MVP isolation ready: loopback port 3127; synthetic local DB; external inference blocked until approval.');
  require('../../server');
}
main().catch(e=>{console.error('MVP launcher failed:',e.message);process.exit(1);});
