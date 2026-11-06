// Evaluation launcher only. Runs the existing server/routes/auth against a fresh local DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const root = path.resolve(__dirname, '../..');
const casesPath = path.resolve(process.env.SKILLOMATE_EVAL_CASES || path.join(root, 'test_cases.json'));
const packKey = process.env.SKILLOMATE_EVAL_COURSE_PACK || '';
const fixtureOnly = process.env.SKILLOMATE_EVAL_CARTOON_FIXTURE === 'true';
const report = path.resolve(process.env.SKILLOMATE_EVAL_REPORT || path.join(root, 'reports/mvp_launch_20261017'));
const registrationPath = process.env.SKILLOMATE_EVAL_REGISTRATION_PLAN;
const cartoonReports = ['cartoon-series-local-fixture', 'cartoon-series-cs11-v2', 'cartoon-series-cs11-final-retest'].map(dir => path.join(root, 'reports', dir));
if (fixtureOnly && !cartoonReports.includes(report)) throw Error('Cartoon fixtures require their separate report directory.');
const fixtureMode = fixtureOnly ? require('./cartoon-local-fixture.cjs').prepareCartoonFixture({packKey,registrationPath,report,casesPath}) : null;
const coursePack = fixtureMode?.pack || (packKey ? require('../../services/courseKnowledgePacks').COURSE_PACKS.find(pack => pack.dir === packKey) : null);
if (packKey && !coursePack) throw Error('Unknown evaluation course pack');
const registration = registrationPath ? JSON.parse(fs.readFileSync(path.resolve(registrationPath), 'utf8')) : null;
let verifiedMetadata = null;
if (coursePack?.actualCourseId && !registration && !fixtureMode) throw Error('This course requires its verified local registration plan; dummy video seeding is disabled.');
if (registration) {
  if (!coursePack || registration.actual_course_id !== coursePack.actualCourseId) throw Error('Registration plan does not match the course pack owner.');
  const bytes = fs.readFileSync(path.resolve(path.dirname(registrationPath), registration.metadata_file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== registration.metadata_sha256) throw Error('Real course metadata checksum changed.');
  verifiedMetadata = JSON.parse(bytes);
  const target = new URL(registration.isolated_target);
  if (target.protocol !== 'mongodb:' || target.hostname !== '127.0.0.1' || target.port !== '27017' || target.username || target.password || target.search || target.hash
    || !/^\/skillomate_mvp_eval_lba_real_[a-z0-9_]+$/.test(target.pathname)) throw Error('Registration target is not isolated localhost MongoDB.');
}

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
const dbName = fixtureMode ? `skillomate_mvp_eval_cartoon_fixture_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  : registration ? new URL(registration.isolated_target).pathname.slice(1) : `skillomate_mvp_eval_20261017_${Date.now()}`;
const mongoUri = registration ? registration.isolated_target : `mongodb://127.0.0.1:27017/${dbName}`;
const localPort = fixtureMode ? '3128' : '3127';
Object.assign(process.env, { NODE_ENV:'development', HOST:'127.0.0.1', PORT:localPort, MONGODB_URI:mongoUri,
  JWT_SECRET:crypto.randomBytes(48).toString('hex'), DISABLE_BACKGROUND_JOBS:'true', SERVE_FRONTEND:'false',
  SKILLOMATE_CONFIG_SOURCE:'env', FAL_API_KEY:providerKey, FAL_OPENROUTER_MODEL:model, FAL_OPENROUTER_URL:providerUrl });
// Configuration is supplied above; production dotenv files must not override local isolation.
dotenv.config = () => ({ parsed:{} });
const als = new AsyncLocalStorage();
const tracePath = path.join(report, 'pipeline_traces.jsonl');
let providerCalls = fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.type === 'provider_invoked').length : 0;
function event(type,data={}) { fs.appendFileSync(path.join(report,'pipeline_traces.jsonl'),JSON.stringify({time:new Date().toISOString(),run:als.getStore()?.run||'',case:als.getStore()?.case||'',turn:als.getStore()?.turn||'',type,...data})+'\n'); }
function approval() { try {const p=JSON.parse(fs.readFileSync(path.join(report,'provider_approval.json'))); const hash=crypto.createHash('sha256').update(fs.readFileSync(casesPath)).digest('hex'); return p.approved===true && p.model===model && p.cases_sha256===hash && Number.isInteger(p.max_calls) && p.max_calls>0 && p.max_calls<=60 && Date.parse(p.expires_at)>Date.now() ? p : null;} catch{return null;} }
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
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:5000,directConnection:true});
  const hello=await mongoose.connection.db.admin().command({hello:1});
  if (hello.msg==='isdbgrid'||hello.setName) throw Error('Expected standalone localhost MongoDB.');
  const Category=require('../../models/Category'),Course=require('../../models/Course'),User=require('../../models/User');
  let course,category,other;
  if (verifiedMetadata) {
    // This mode never creates or updates the copied real course/category.
    course=await Course.findById(registration.actual_course_id).lean();
    category=await Category.findById(verifiedMetadata.category._id).lean();
    if(!course||!category||String(course.category)!==String(category._id)||course.status!=='published'||course.slug!==verifiedMetadata.course.slug) throw Error('Verified local course/category is missing or changed.');
    if(course.videos.length!==10||verifiedMetadata.course.videos.length!==10)throw Error('Expected ten real lessons.');
    for(let i=0;i<10;i++) {
      const saved=course.videos[i],expected=verifiedMetadata.course.videos[i];
      for(const key of ['_id','title','provider','sourceType','videoUrl','youtubeId','bunnyVideoId','bunnyLibraryId','order','notes','examplePrompt']) {
        if(String(saved[key]??'')!==String(expected[key]??''))throw Error('Real lesson metadata differs: '+key);
      }
      require('../../services/videoSources').validateSource(saved);
    }
    const controlSlug='local-lba-isolation-control';
    if(await Course.countDocuments({_id:{$ne:course._id},slug:{$ne:controlSlug}}))throw Error('Unexpected course in isolated evaluation database.');
    other=await Course.findOne({slug:controlSlug}).lean();
    if(other&&(!other.description.startsWith('Synthetic local authorization control.')||other.videos.length))throw Error('Unexpected isolation-control metadata.');
    if(!other)other=await Course.create({title:'Local authorization control',slug:controlSlug,description:'Synthetic local authorization control. No lesson material or video placeholders.',category:category._id,status:'published',videos:[]});
  } else {
    // Retain the previous independent evaluation workflow for older course suites.
    if((await mongoose.connection.db.listCollections().toArray()).length) throw Error('Synthetic database already exists; choose a new task DB');
    category=await Category.create({name:'Local MVP evaluation',slug:'local-mvp-evaluation'});
    const {PRODUCT_RECORDS}=require('../../services/productTutorKnowledge');
    course=await Course.create(coursePack ? {...(fixtureMode?{_id:fixtureMode.fixture.course_id}:{}),title:coursePack.title,slug:coursePack.slugs[0],description:fixtureMode?'Synthetic local Cartoon evaluation fixture. Test video placeholders only; no uploaded videos or verified playback.':'Synthetic local course record.',category:category._id,status:'published',videos:fixtureMode?.videos || coursePack.records.filter(x=>x.contentType==='lesson-summary').map(x=>({title:x.heading,order:x.lessonNumber,provider:'youtube',youtubeId:'MVPTEST0001'}))} : {title:'AI Product Photoshoot & Ads',slug:'ai-product-photoshoot-ads',description:'Synthetic local course record using approved on-disk course knowledge.',category:category._id,status:'published',videos:PRODUCT_RECORDS.filter(x=>x.contentType==='lesson-summary').map(x=>({title:x.heading,order:x.lessonNumber,description:`Public lesson overview: ${x.heading}`,provider:'youtube',youtubeId:'MVPTEST0001'}))});
    other=await Course.create(fixtureMode?{title:'Local authorization control',slug:'local-cartoon-isolation-control',description:'Synthetic local authorization control. No Cartoon lesson access.',category:category._id,status:'published',videos:[]}:{title:'AI Influencer',slug:'ai-influencer',description:'Synthetic local course for authorization checks.',category:category._id,status:'published',videos:[]});
  }
  const users={};
  const cases=JSON.parse(fs.readFileSync(casesPath)).cases;
  for(const c of cases){
    const sessionId=crypto.randomUUID();const entitled=c.identity!=='inactive'&&c.identity!=='other_only';const granted=c.identity==='other_only'?other._id:course._id;
    const fields={fullName:`Synthetic ${c.id}`,email:`${c.id.toLowerCase()}@mvp.invalid`,isOnTrial:false,subscriptionStatus:'none',activeSessionId:sessionId,purchasedCourses:c.identity==='inactive'?[course._id]:[],courseEntitlements:c.identity==='inactive'?[{course:course._id,accessType:'yearly',expiresAt:new Date(Date.now()-86400000)}]:entitled||c.identity==='other_only'?[{course:granted,accessType:'permanent'}]:[]};
    let user;
    if(verifiedMetadata){
      const prior=await User.findOne({email:fields.email}).lean();
      if(prior&&prior.fullName!==fields.fullName)throw Error('Refusing to alter non-synthetic user.');
      user=await User.findOneAndUpdate({email:fields.email},{$set:fields},{upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});
    }else user=await User.create(fields);
    users[c.id]={id:String(user._id),token:require('jsonwebtoken').sign({userId:String(user._id),sessionId},process.env.JWT_SECRET,{expiresIn:'2h'}),authorized_course_ids:entitled?[String(course._id)]:c.identity==='other_only'?[String(other._id)]:[]};
  }
  if(coursePack)fs.writeFileSync(path.join(report,'approved_assets.json'),JSON.stringify({templates:coursePack.records.filter(x=>x.contentType==='exact-template')},null,2));
  const runtime={course_slug:course.slug,synthetic:true,real_course_metadata:Boolean(verifiedMetadata),metadata_sha256:registration?.metadata_sha256||null,pid:process.pid,base_url:`http://127.0.0.1:${localPort}`,db_name:dbName,course_id:String(course._id),other_course_id:String(other._id),unknown_course_id:String(new mongoose.Types.ObjectId()),users,model,provider_url:providerUrl,provider_key_present:Boolean(providerKey),...(fixtureMode?{fixture_only:true,fixture_pack:packKey,playback_verified:false,lesson_count:8}: {})};
  if(fixtureMode)fs.writeFileSync(path.join(report,'fixture.json'),JSON.stringify({...fixtureMode.fixture,database:dbName,mongo_host:'127.0.0.1:27017'},null,2)+'\n');
  fs.writeFileSync(runtimePath,JSON.stringify(runtime),{mode:0o600});
  fs.writeFileSync(path.join(report,'runtime_location.txt'),runtimePath+'\n');
  console.log(`Local evaluator ready: loopback port ${localPort}; `+(fixtureMode?'Cartoon fixture only; test video IDs, no playback validation':verifiedMetadata?'verified real course metadata':'synthetic metadata')+'; external inference blocked until approval.');
  require('../../server');
}
main().catch(e=>{console.error('MVP launcher failed:',e.message);process.exit(1);});
