const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const { providerHistory } = require('../services/aiProviderPrivacy');
const user = { _id:'synthetic', fullName:'PROFILE_NAME_PRIVATE_314159', email:'private-contact-314159@example.invalid',
  mobileNumber:'9988776655',age:79,gender:'PRIVATE_GENDER_314159',avatar:'https://synthetic.invalid/PRIVATE_AVATAR_314159',
  createdAt:new Date('2089-05-17'),lastLoginAt:new Date('2089-05-18'),subscriptionStatus:'active',subscriptionExpiry:new Date('2089-05-19'),
};
function assertPrivate(payload) {
  assert.deepEqual(Object.keys(payload).sort(),['max_tokens','messages','model','temperature']);
  const text=JSON.stringify(payload);
  for(const value of ['PROFILE_NAME_PRIVATE_314159','private-contact-314159','9988776655','6655','PRIVATE_GENDER_314159','PRIVATE_AVATAR_314159','2089-05-17','2089-05-18','2089-05-19','₹9876543.21','Learner profile:','Learner access:','Last successful payment:','Course ownership:','Safe logged-in learner context:']) assert.equal(text.includes(value),false,value);
  for(const message of payload.messages) assert.deepEqual(Object.keys(message).sort(),['content','role']);
}
function fixture(options={}) {
  return backend({ user,order:{gateway:'PRIVATE_GATEWAY_314159',totalAmount:987654321,paidAt:new Date('2089-05-17')},...options });
}
test('actual external payload contains learning context without automatic account or billing facts',async()=>{
  const api=fixture();
  const response=await api.rawChat({message:'Explain prompting in English.', pagePath:'/profile/PRIVATE_PATH_314159'});
  assert.equal(response.statusCode,200);assert.equal(api.calls.length,1);
  assertPrivate(api.calls[0]);
  assert.equal(JSON.stringify(api.calls[0]).includes('PRIVATE_PATH_314159'),false);
  assert.match(api.calls[0].messages.at(-1).content,/Explain prompting/);
});
test('local account reply is available without a provider call and is not saved as model history',async()=>{
  const sessions=new Map();const api=fixture({sessions});
  const response=await api.chat({message:'Show my profile details in English.',conversationId:'private-account'});
  assert.equal(response.privateAccount,true);assert.equal(response.provider,'skillomate-learner-facts');
  assert.match(response.reply,/PROFILE_NAME_PRIVATE_314159/);assert.equal(api.calls.length,0);
  assert.equal(JSON.stringify([...sessions.values()]).includes('PROFILE_NAME_PRIVATE_314159'),false);
  const saved=[...sessions.values()][0].messages.at(-1);assert.equal(saved.privateAccount,true);
});
test('legacy local account replies are excluded from client-supplied and restored saved history',async()=>{
  const localReply='Your Skillomate profile: name PROFILE_NAME_PRIVATE_314159; mobile ******6655; age 79; gender PRIVATE_GENDER_314159.';
  for(const restored of [false,true]) {
    const sessions=new Map();
    if(restored)sessions.set('learner:null',{conversationId:'same',messages:[{role:'user',content:'Show my profile'},{role:'assistant',content:localReply}]});
    const api=fixture({sessions});
    await api.chat({message:'Explain prompting in English.',conversationId:'same',history:restored?[]:[{role:'assistant',content:localReply},{role:'assistant',content:'Safe teaching example.'}]});
    assert.equal(api.calls.length,1);assertPrivate(api.calls[0]);
    if(!restored)assert.ok(api.calls[0].messages.some(x=>x.content==='Safe teaching example.'));
  }
});
test('private-account markers and old multilingual account templates are excluded at the boundary',()=>{
  const history=[
    {role:'assistant',content:'Private arbitrary response',privateAccount:true},
    {role:'assistant',content:'Private arbitrary response',provider:'skillomate-learner-facts'},
    {role:'assistant',content:'Aapka Skillomate profile: PRIVATE'},
    {role:'assistant',content:'आपका Skillomate प्रोफाइल: PRIVATE'},
    {role:'assistant',content:'Your plan/access is active via PRIVATE'},
    {role:'assistant',content:'अंतिम सफल भुगतान: PRIVATE'},
    {role:'assistant',content:'Privacy ke liye main masked account/payment summary hi dikha sakta hoon: PRIVATE'},
    {role:'user',content:'Voluntarily supplied business name: Copper Wheel'},
    {role:'assistant',content:'Use consistent framing.'},
  ];
  assert.deepEqual(providerHistory(history),history.slice(-2));
});
test('explicit user message content is retained and consent explains this limitation',async()=>{
  const api=fixture();await api.chat({message:'Explain prompting for my fictional shop Copper Wheel in English.'});
  assert.equal(api.calls.length,1);assertPrivate(api.calls[0]);
  assert.match(api.calls[0].messages.at(-1).content,/Copper Wheel/);
  const state=(await api.request('GET','/consent')).result;
  assert.equal(state.policyVersion,'2026-11-06.2');
  assert.match(state.disclosure,/Personal information you type.*shared/);
  assert.doesNotMatch(state.disclosure,/Some requests also include your profile/);
});
test('provider retries use the same minimal payload',async()=>{
  const api=fixture({failAt:[1]});await api.chat({message:'Explain prompting in English.'});
  assert.equal(api.calls.length,2);api.calls.forEach(assertPrivate);
});
test('language repair requests keep the same private-data boundary',async()=>{
  const course={_id:'6d0000000000000000000000',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
  const api=fixture({courses:[course],subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+86400000)},
    replies:['Yeh reason hai. Reference mein product poora dikhao.','Use a reference that shows the entire product, so its appearance stays clear.']});
  const result=await api.chat({courseId:course._id,message:'Explain why a clear reference matters for learners in English.'});
  assert.equal(api.calls.length,2);api.calls.forEach(assertPrivate);
  assert.equal(result.outcome.responseIssue,'response_language_repaired');
});
test('the previous consent policy no longer authorizes the changed data practice',async()=>{
  const api=fixture();const state=(await api.request('GET','/consent')).result;
  assert.equal(api.consent.service.consentState({...state,granted:true,decidedAt:new Date(),policyVersion:'2026-11-06.1'}).granted,false);
});
