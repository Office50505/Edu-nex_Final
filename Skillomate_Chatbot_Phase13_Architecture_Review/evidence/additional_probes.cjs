'use strict';
// Read-only probes; provider is the existing fixture's stub, never live inference.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const req=createRequire(path.join(process.cwd(),'package.json'));
const {backend}=req('./tests/ai-tutor-fixture.cjs');
const pk=req('./services/productTutorKnowledge');
const ps=req('./services/productTutorState');
const pi=req('./services/productTutorIntent');
const {retrieveKnowledge}=req('./services/tutorKnowledge');
const old=path.join(process.cwd(),'reports/ai-product-photoshoot-ads-evaluation/phase12_live_20261015_110001');
const course=JSON.parse(fs.readFileSync(path.join(old,'execution_manifest.json'))).fixture;
const cases=JSON.parse(fs.readFileSync(path.join(old,'unseen_definitions_frozen.json')));
const fresh=()=>backend({courses:[course],subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+86400000)},user:{_id:'learner'},sessions:new Map(),reply:'Fixture provider response. This is not a live evaluation.'});
async function main(){
 const critical=[];
 for(const test of [...cases.single_turn_tests,...cases.conversation_tests].filter(t=>['phase12_new_001','phase12_new_002','phase12_new_005','phase12_new_029'].includes(t.id))){
  let previous={};const history=[];
  for(const [i,t]of(test.turns||[test]).entries()){
   const message=t.query||t.user;
   const facts=pk.productFacts(message,history,previous,{courseId:course._id,conversationId:'probe'});
   const k=retrieveKnowledge({courses:[course],activeCourse:course,message,history,includeMaterials:true,conversationContext:facts});
   critical.push({id:test.id,turn:i+1,message,entity:ps.extractEntity(message),slots:pk.productSlots(message,history,previous),facts,requestContext:k.requestContext,wantsTemplate:pk.wantsProductPrompt(message),templateLookupRegardlessOfIntent:pk.findProductTemplate(message,history)?.heading||null,ranked:k.debugChunks});
   previous=facts;history.push({role:'user',content:message});
  }
 }
 const scenarios=[
  {id:'educational-heading',messages:['Explain why L02 White Studio is useful.']},
  {id:'open-generation',messages:['Create an original image prompt for my cork reading stand in a bright studio.']},
  {id:'negated-template-phase12',messages:[cases.single_turn_tests.find(t=>t.id==='phase12_new_010').query]},
  {id:'repeat-exact',messages:['My product is a cork reading stand. Give the exact L02 White Studio prompt.','Again.']},
  {id:'object-declaration-add-prompt',messages:[cases.single_turn_tests.find(t=>t.id==='phase12_new_001').query.replace('Product Sheet text','Product Sheet prompt text')]},
  {id:'object-declaration-explicit-control',messages:[cases.single_turn_tests.find(t=>t.id==='phase12_new_001').query.replace('The object I am photographing is','My product is').replace('Product Sheet text','Product Sheet prompt text')]},
  {id:'hindi-declaration-control',messages:[cases.single_turn_tests.find(t=>t.id==='phase12_new_002').query.replace('हमारी वस्तु का नाम','हमारे प्रोडक्ट का नाम')]},
  {id:'passive-recolour-active-control',messages:['In Lesson 04 change the two removable hinge pins to pale saffron. Return the entire approved L04 Colour Variant Sheet template with that exact part and colour.']},
  {id:'english-switch-control',messages:['Mera item woven willow bulb-measuring sleeve hai. L02 White Studio ka full exact prompt do.','Replace the product with polished alder dovetail spacer. Return the complete L02 Dark Premium approved prompt; do not keep the old name.']},
 ];
 const routeProbes=[];
 for(const s of scenarios){const app=fresh();const history=[];const turns=[];
  for(const [i,message]of s.messages.entries()){
   const callsBefore=app.calls.length;
   const response=await app.rawChat({message,history:i?[]:history,courseId:course._id,conversationId:'additional-'+s.id,debugAi:true});
   turns.push({message,response,stubProviderCalls:app.calls.length-callsBefore});
   history.push({role:'user',content:message},{role:'assistant',content:response.result?.answer||''});
  }routeProbes.push({id:s.id,turns});
 }
 const languageProbes=['Bolna English mein, naam मिट्टी का दीपक rehne do.','Please answer in Hindi, not English.','Ab isko phir se samjha do.','Again.'].map(message=>({message,result:pi.productResponseLanguage(message,[],{language:'hinglish'})}));
 fs.writeFileSync(path.join(__dirname,'additional_probes.json'),JSON.stringify({executedAt:new Date().toISOString(),critical,routeProbes,languageProbes,externalProviderRequests:0},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({criticalTraces:critical.length,routeScenarios:routeProbes.length,languageProbes,results:routeProbes.map(s=>({id:s.id,turns:s.turns.map(t=>({status:t.response.statusCode,selection:t.response.result?.debug?.response_selection,calls:t.stubProviderCalls,answer:t.response.result?.answer?.slice(0,170)}))}))},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
