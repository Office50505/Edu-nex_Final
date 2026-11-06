const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function client() {
  const core = fs.readFileSync(path.join(__dirname, '../services/aiConsent.js'),'utf8');
  const url = 'data:text/javascript;base64,'+Buffer.from(core).toString('base64');
  const source = fs.readFileSync(path.join(__dirname,'../services/aiClient.js'),'utf8')
    .replace("'./aiConsent'", JSON.stringify(url))
    .replace("import { askAiConsent } from './aiConsentPrompt';", "const askAiConsent = () => { throw new Error('Unexpected prompt'); };");
  return { ...await import(url), ...await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) };
}
const user={_id:'synthetic-a',sessionId:'session-a'};
const policy={consentRequired:true,granted:false,policyVersion:'current',providerVersion:'provider',providerNames:['Synthetic provider'],disclosure:'Synthetic disclosure',decidedAt:null};
function fixture(initial={}) {
  let state={...policy,...initial};let owner=user; const calls=[];
  const session={getUser:()=>owner,requestJson:async(url,options)=>{
    calls.push({url,options});
    if(url==='/api/ai/consent') {
      if(options.method==='PUT') state={...state,...JSON.parse(options.body),decidedAt:'server-date'};
      return {...state};
    }
    return {answer:'Answer',provider:'fal-openrouter',outcome:{type:'live_model'}};
  }};
  return {session,calls,switchUser(){owner={_id:'other',sessionId:'other-session'};},setState(next){state=next;}};
}
test('first send discloses before saving acceptance and only then sends chat',async()=>{
  const {requestTutor}=await client(); const f=fixture();
  await requestTutor({user,session:f.session,question:'Synthetic',messages:[],decideConsent:async state=>{
    assert.equal(state.disclosure,'Synthetic disclosure');assert.equal(f.calls.length,1);return true;
  }});
  assert.deepEqual(f.calls.map(x=>[x.url,x.options.method]),[['/api/ai/consent','GET'],['/api/ai/consent','PUT'],['/api/ai/chat','POST']]);
  assert.equal(JSON.parse(f.calls[1].options.body).policyVersion,'current');
});
test('decline records refusal with no prompt or history sent to chat',async()=>{
  const {requestTutor}=await client();const f=fixture();
  await assert.rejects(requestTutor({user,session:f.session,question:'Private synthetic prompt',messages:[],decideConsent:async()=>false}),e=>e.code==='AI_CONSENT_DECLINED');
  assert.equal(f.calls.some(x=>x.url==='/api/ai/chat'),false);
  assert.equal(JSON.parse(f.calls[1].options.body).granted,false);
  assert.equal(JSON.stringify(f.calls).includes('Private synthetic prompt'),false);
});
test('persisted grant is re-read; withdrawal blocks next send rather than trusting local cache',async()=>{
  const {requestTutor}=await client();const f=fixture({granted:true,decidedAt:'server-date'});
  await requestTutor({user,session:f.session,question:'One',messages:[]});
  f.setState({...policy,granted:false});
  await assert.rejects(requestTutor({user,session:f.session,question:'Two',messages:[],decideConsent:async()=>false}),e=>e.code==='AI_CONSENT_DECLINED');
  assert.equal(f.calls.filter(x=>x.url==='/api/ai/chat').length,1);
  assert.equal(f.calls.filter(x=>x.options.method==='GET').length,2);
});
test('an old always-granted backend, malformed records, and offline reads fail closed',async()=>{
  const {requestTutor}=await client();
  for(const state of [{granted:true,policyVersion:'2026-09-25',providerVersion:'consent-not-required'},null,{}]) {
    const f=fixture();f.setState(state);
    await assert.rejects(requestTutor({user,session:f.session,question:'No leak',messages:[]}),e=>e.code==='AI_CONSENT_UNAVAILABLE');
    assert.equal(f.calls.length,1);
  }
  let chatCalls=0;
  await assert.rejects(requestTutor({user,session:{getUser:()=>user,requestJson:async()=>{throw new Error('Offline');}},question:'No leak',messages:[]}),/Offline/);
  assert.equal(chatCalls,0);
});
test('account switching while permission screen is open cannot grant or send for either account',async()=>{
  const {requestTutor}=await client(); const f=fixture();
  await assert.rejects(requestTutor({user,session:f.session,question:'No leak',messages:[],decideConsent:async()=>{f.switchUser();return true;}}),e=>e.code==='SESSION_CHANGED');
  assert.equal(f.calls.length,1);
});
test('failed persistence and changed server disclosure cannot send a chat',async()=>{
  const {requestTutor}=await client();
  for(const outcome of ['fail','changed']) {
    let sends=0;
    const session={getUser:()=>user,requestJson:async(url,options)=>{
      if(url==='/api/ai/chat'){sends++;return {};}
      if(options.method==='PUT') {
        if(outcome==='fail')throw new Error('Could not save');
        throw Object.assign(new Error('Review changed disclosure'),{code:'AI_CONSENT_POLICY_CHANGED'});
      }
      return policy;
    }};
    await assert.rejects(requestTutor({user,session,question:'No leak',messages:[],decideConsent:async()=>true}));
    assert.equal(sends,0);
  }
});
test('native history excludes locally generated account answers while preserving user messages',async()=>{
  const {conversationHistory}=await client();
  const history=conversationHistory([
    {role:'assistant',content:'Account secret',privateAccount:true},
    {role:'assistant',content:'Older account secret',provider:'skillomate-learner-facts'},
    {role:'user',content:'My fictional shop is Copper Wheel'},
    {role:'assistant',content:'Use consistent framing.'},
  ]);
  assert.deepEqual(history,[{role:'user',content:'My fictional shop is Copper Wheel'},{role:'assistant',content:'Use consistent framing.'}]);
});
