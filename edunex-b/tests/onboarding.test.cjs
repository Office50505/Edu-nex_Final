const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
function setup() {
 const routes = new Map(); let saved = null, active = false, existing = false;
 const hash = s => crypto.createHash('sha256').update(s).digest('hex');
 const router = { use() {}, get(p,...h){routes.set('GET '+p,h);}, post(p,...h){routes.set('POST '+p,h);} };
 const model = {
  async deleteMany(q) { if (saved?.mobileNumber === q.mobileNumber && saved.completedAt instanceof Date) saved = null; },
  async findOneAndUpdate(q,u) {
   if (q.handoffHash && (!saved || saved.handoffHash!==q.handoffHash || !saved.handoffExpiresAt || saved.handoffExpiresAt<=new Date())) return null;
   saved ||= {_id:crypto.randomBytes(12).toString('hex'),mobileNumber:q.mobileNumber};
   Object.assign(saved,u.$set||{}); for(const k of Object.keys(u.$unset||{}))delete saved[k]; return saved;
  },
  async findOne(q) {return saved && !saved.completedAt && saved.tokenHash===q.tokenHash && saved.expiresAt>new Date() ? saved : null;},
  async updateOne(q,u){Object.assign(saved,u.$set||{}); for(const k of Object.keys(u.$unset||{}))delete saved[k];},
 };
 const bill={ initiate:async(req,res)=>res.json({userId:req.user._id,verified:req.user.isMobileVerified}), verify:async()=>{},status:async()=>{},cancel:async()=>{},reconcileForUser:async()=>({status:active?'active':'pending'}) };
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../routes/onboarding'),'utf8'),{module,exports:module.exports,process:{env:{JWT_SIGNUP_SECRET:'test-signup',PAYMENT_GATEWAY_MODE:'razorpay'}},Date,require:n=>({express:{Router:()=>router},'node:crypto':crypto,jsonwebtoken:jwt,'../models/OnboardingSession':model,'../models/User':{exists:async()=>existing},'../controllers/razorpayController':bill,'../controllers/paymentController':{},'../services/paymentMode':{activeProvider:async()=>'razorpay'},'../services/razorpayService':{},'../services/subscriptionAccess':{resolveSubscriptionAccess:s=>({active:s?.status==='active'})}}[n])});
 return { setActive:v=>active=v,setExisting:v=>existing=v,get saved(){return saved;},hash,
  async call(method,path,body={},token='') {const req={body,headers:{authorization:'Bearer '+token}},res={code:200,status(c){this.code=c;return this;},json(d){this.data=d;return this;}};const h=routes.get(method+' '+path); let i=0; const next=()=>h[i++]?.(req,res,next); await next(); // Middleware next() is synchronous but handlers can await.
   await new Promise(r=>setImmediate(r)); return res;},
  proof:jwt.sign({mobileNumber:'919999999999'},'test-signup',{expiresIn:'10m'}) };
}
test('rejects forged and completion tokens as OTP proof',async()=>{const h=setup();assert.equal((await h.call('POST','/session',{signupToken:'fake'})).code,401);assert.equal((await h.call('POST','/session',{signupToken:jwt.sign({mobileNumber:'919999999999',purpose:'paid-onboarding'},'test-signup')})).code,401);});
test('refuses duplicate registered phone',async()=>{const h=setup();h.setExisting(true);assert.equal((await h.call('POST','/session',{signupToken:h.proof})).code,409);});
test('deleted account can restart onboarding with a new identity after fresh OTP',async()=>{
 const h=setup(); const first=await h.call('POST','/session',{signupToken:h.proof});
 const previousId=h.saved._id; h.saved.completedAt=new Date(); h.saved.handoffHash='old-handoff';
 const restarted=await h.call('POST','/session',{signupToken:h.proof});
 assert.equal(restarted.code,200); assert.notEqual(h.saved._id,previousId);
 assert.equal(h.saved.completedAt,undefined); assert.equal(h.saved.handoffHash,undefined);
 assert.equal((await h.call('POST','/checkout',{},first.data.token)).code,401);
});
test('unfinished onboarding retains its billing identity on renewed OTP',async()=>{
 const h=setup(); await h.call('POST','/session',{signupToken:h.proof}); const id=h.saved._id;
 await h.call('POST','/session',{signupToken:h.proof}); assert.equal(h.saved._id,id);
});
test('completed onboarding is retained when its account still exists',async()=>{
 const h=setup(); await h.call('POST','/session',{signupToken:h.proof});
 const id=h.saved._id; h.saved.completedAt=new Date(); h.setExisting(true);
 assert.equal((await h.call('POST','/session',{signupToken:h.proof})).code,409);
 assert.equal(h.saved._id,id); assert.ok(h.saved.completedAt);
});
test('stores only hashed session token and uses reserved identity for billing',async()=>{const h=setup();const r=await h.call('POST','/session',{signupToken:h.proof});assert.equal(h.saved.tokenHash,h.hash(r.data.token));const b=await h.call('POST','/checkout',{paymentType:'trial'},r.data.token);assert.equal(b.data.userId,h.saved._id);assert.equal(b.data.verified,true);});
test('expired or missing session cannot create checkout',async()=>{const h=setup();assert.equal((await h.call('POST','/checkout',{})).code,401);const r=await h.call('POST','/session',{signupToken:h.proof});h.saved.expiresAt=new Date(0);assert.equal((await h.call('POST','/checkout',{paymentType:'trial'},r.data.token)).code,401);});
test('unconfirmed payment cannot issue completion handoff',async()=>{const h=setup();const r=await h.call('POST','/session',{signupToken:h.proof});assert.equal((await h.call('POST','/handoff',{},r.data.token)).code,409);});
test('verified payment handoff is single-use and binds completion to reserved phone and id',async()=>{const h=setup();const r=await h.call('POST','/session',{signupToken:h.proof});h.setActive(true);const handoff=await h.call('POST','/handoff',{},r.data.token);const resumed=await h.call('POST','/resume',{code:handoff.data.code});const proof=jwt.verify(resumed.data.signupToken,'test-signup');assert.equal(proof.onboardingId,h.saved._id);assert.equal(proof.mobileNumber,h.saved.mobileNumber);assert.equal(proof.purpose,'paid-onboarding');assert.equal((await h.call('POST','/resume',{code:handoff.data.code})).code,401);});
test('expired handoff cannot resume',async()=>{const h=setup();const r=await h.call('POST','/session',{signupToken:h.proof});h.setActive(true);const handoff=await h.call('POST','/handoff',{},r.data.token);h.saved.handoffExpiresAt=new Date(0);assert.equal((await h.call('POST','/resume',{code:handoff.data.code})).code,401);});
test('paid signup creates the reserved user and reuses its verified subscription',async t=>{
 const User=require('../models/User'), Session=require('../models/Session'), Onboarding=require('../models/OnboardingSession'), billing=require('../controllers/razorpayController');
 const id='507f1f77bcf86cd799439011', phone='919999999999'; let created;
 t.mock.method(User,'findOne',async()=>null);
 t.mock.method(User,'create',async data=>{created=data;return {...data,_id:id};});
 t.mock.method(Session,'findOneAndUpdate',async()=>({}));
 t.mock.method(Onboarding,'findOne',async()=>({_id:id,mobileNumber:phone}));
 t.mock.method(Onboarding,'updateOne',async()=>({}));
 t.mock.method(billing,'reconcileForUser',async()=>({_id:'subdoc',status:'trial',trialExpiresAt:new Date(Date.now()+86400000)}));
 const route=require('../routes/auth').stack.find(x=>x.route?.path==='/signup').route.stack[0].handle;
 const proof=jwt.sign({mobileNumber:phone,purpose:'paid-onboarding',onboardingId:id},process.env.JWT_SIGNUP_SECRET||'edunex-development-signup-secret',{expiresIn:'10m'});
 const req={body:{fullName:'Test Learner',password:'not-a-real-password',mobileNumber:phone,age:24,signupToken:proof},headers:{},socket:{remoteAddress:'127.0.0.1'}};
 const res={code:200,status(c){this.code=c;return this;},json(d){this.data=d;return this;}};
 await route(req,res);assert.equal(res.code,201,JSON.stringify(res.data));assert.equal(created._id,id);assert.equal(created.subscriptionStatus,'trial');assert.equal(created.isMobileVerified,true);assert.ok(res.data.accessToken);
});
test('paid signup rejects unconfirmed entitlement before user creation',async t=>{
 const User=require('../models/User'),Onboarding=require('../models/OnboardingSession'), billing=require('../controllers/razorpayController');let created=false;
 t.mock.method(User,'create',async()=>{created=true;});
 t.mock.method(Onboarding,'findOne',async()=>({_id:'507f1f77bcf86cd799439011'}));
 t.mock.method(billing,'reconcileForUser',async()=>({status:'pending'}));
 const route=require('../routes/auth').stack.find(x=>x.route?.path==='/signup').route.stack[0].handle;
 const proof=jwt.sign({mobileNumber:'919999999999',purpose:'paid-onboarding',onboardingId:'507f1f77bcf86cd799439011'},process.env.JWT_SIGNUP_SECRET||'edunex-development-signup-secret',{expiresIn:'10m'});
 const req={body:{fullName:'Test',password:'not-a-real-password',mobileNumber:'919999999999',age:24,signupToken:proof},headers:{}};
 const res={code:200,status(c){this.code=c;return this;},json(d){this.data=d;return this;}};
 await route(req,res);assert.equal(res.code,409);assert.equal(created,false);
});
