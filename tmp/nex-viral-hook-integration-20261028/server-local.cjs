// Verification-only profile. Never loads production dotenv or provider keys,
// never authorizes inference, and never touches an approval/attempt ledger.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
if (process.env.NODE_ENV === 'production') throw Error('Local verification refuses production mode');
const root = path.resolve(__dirname, '../..');
const backendRoot = path.join(root, 'edunex-b');
const backendRequire = createRequire(path.join(backendRoot, 'server.js'));
const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, '../nex-cartoon-safety-live-20261028/.runtime/jwt-secrets.json')));
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_SIGNUP_SECRET']) if (typeof secrets[key] !== 'string' || secrets[key].length < 48) throw Error('Isolated session keys missing');
for (const key of Object.keys(process.env)) if (!['PATH','HOME','TMPDIR','LANG','TERM','TZ','USER','SHELL'].includes(key)) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3129',
  MONGODB_URI: 'mongodb://127.0.0.1:27028/skillomate_lba_final_qa_20261027',
  REDIS_URL: 'redis://127.0.0.1:6388/1', DISABLE_BACKGROUND_JOBS: 'true', SERVE_FRONTEND: 'false',
  SKILLOMATE_CONFIG_SOURCE: 'env', OTP_PROVIDER: 'demo', FAL_API_KEY: '', FAL_KEY: '',
  JWT_SECRET: secrets.JWT_SECRET, JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET, JWT_SIGNUP_SECRET: secrets.JWT_SIGNUP_SECRET });
backendRequire('dotenv').config = () => ({ parsed: {} });
const loopback = host => ['localhost','127.0.0.1','::1','[::1]'].includes(host);
const net = require('node:net'), connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args, first = values[0];
  const host = typeof first === 'object' ? first.host || first.hostname || 'localhost' : typeof values[1] === 'string' ? values[1] : 'localhost';
  if (!loopback(host)) throw Error('External network disabled during local knowledge verification');
  return connect.apply(this, args);
};
const fetchLocal = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  if (!loopback(new URL(String(url)).hostname)) throw Error('Paid inference and external HTTP disabled during local verification');
  return fetchLocal(url, { ...options, redirect: 'error' });
};
// Retain the previously verified isolated Cartoon binding alongside the new
// registry-backed Viral pack; existing approved knowledge is never rewritten.
require('../nex-cartoon-safety-live-20261028/binding.cjs').bindCartoon();
const K = backendRequire('./services/tutorKnowledge');
const pack = K.packFor({ _id: '6ae1b4694e1af14d4adc9e2b', slug: 'viral-hook-formula' });
if (!pack || pack.records.filter(r=>r.contentType==='lesson-summary').length !== 10 || pack.hookCategories.length !== 8 || pack.records.filter(r=>r.contentType==='exact-template').length !== 2) throw Error('Viral pack is incomplete');
const names = ['services/aiTutorService.js','routes/ai.js','services/aiCompliance.js','services/tutorProvider.js','models/AiTutorSession.js','services/courseKnowledgePacks.js','services/tutorKnowledge.js','services/viralHookTutor.js',
  'knowledge/course-packs.json','knowledge/viral-hook-formula/index.json','knowledge/viral-hook-formula/training.txt','knowledge/viral-hook-formula/course-notes.txt','knowledge/viral-hook-formula/course-binding.json'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sources = Object.fromEntries(names.map(name=>['edunex-b/'+name,sha(fs.readFileSync(path.join(backendRoot,name)))]));
const revision = sha(JSON.stringify(sources));
const emit = require('node:http').Server.prototype.emit;
require('node:http').Server.prototype.emit = function (event,...args) {
  if (event === 'request') {
    const [req,res] = args;
    if (req.method === 'GET' && req.url.split('?')[0] === '/__local_verification/status') {
      const unchanged = Object.entries(sources).every(([name,hash])=>sha(fs.readFileSync(path.join(root,name)))===hash);
      res.writeHead(unchanged ? 200 : 503, {'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ profile:'VIRAL-HOOK-LOCAL-VERIFICATION',backendUrl:'http://127.0.0.1:3129',sourceRevisionSHA256:revision,sources,
        sourceUnchanged:unchanged,courseId:pack.actualCourseId,slug:pack.slugs[0],lessons:10,hookCategories:8,exactTemplates:2,
        inferenceEnabled:false,providerCredentialsLoaded:false,approvalExecuted:false,paidProviderCalls:0,
        registeredLocalPacks:K.COURSE_PACKS.map(p=>({domain:p.domain,courseId:p.actualCourseId})),productionConfigLoaded:false }));
      return true;
    }
  }
  return emit.call(this,event,...args);
};
backendRequire('./server');
