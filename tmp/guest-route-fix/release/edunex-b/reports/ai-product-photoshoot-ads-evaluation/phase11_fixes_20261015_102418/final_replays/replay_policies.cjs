require(process.cwd()+'/tests/helpers/deny-network.cjs');
const fs=require('fs'),path=require('path');const B=process.cwd(),R=path.join(fs.readFileSync('/tmp/skillomate_phase11_path','utf8').trim(),'final_replays');const P=path.join(B,'reports/ai-product-photoshoot-ads-evaluation/phase10_live_20261015_101019');
const K=require(B+'/services/productTutorKnowledge'),{retrieveKnowledge}=require(B+'/services/tutorKnowledge'),RSP=require(B+'/services/productTutorResponse'),{captureProductOptions}=require(B+'/services/productTutorState');
const definitions=JSON.parse(fs.readFileSync(path.join(P,'all_test_cases_frozen.json'))),original=JSON.parse(fs.readFileSync(path.join(P,'application_raw_results.json')));const by=new Map(original.results.map(t=>[t.id,t]));const course={_id:'phase11-local',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};const results=[];const validation=[];
for(const t of [...definitions.single_turn_tests,...definitions.conversation_tests]){
 let state={};const history=[],turns=[];
 for(const [i,u]of (t.turns||[t]).entries()){
  const message=u.query||u.user;state=K.productFacts(message,history,state,{courseId:course._id,conversationId:t.id});const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:state,includeMaterials:true});knowledge.productContext=state;
  const local=RSP.productTutorReply({message,history,knowledge}),saved=(by.get(t.id).turns||[by.get(t.id)])[i];
  const value={query:message,answer:local?.reply||'',provider:local?'course-knowledge-rule':'not-executed',outcome:{type:local?'local_rule':'model_required_not_executed',liveModelAnswer:false,providerStatus:'not_requested'},policy:local?.policy||null,providerRequests:0,requestContext:knowledge.requestContext,structuredState:JSON.parse(JSON.stringify(state)),responseSelection:knowledge.responseSelection||null,executionType:'OFFLINE_LOCAL_POLICY_REPLAY_NOT_FRESH_LIVE'};
  turns.push(value);
  if(saved.providerRequests?.length){const fixed=RSP.validateProductReply({reply:saved.providerRequests.at(-1).rawModelResponse,message,history,knowledge});validation.push({id:t.id,turn:i+1,originalSavedUpstream:saved.providerRequests.at(-1).rawModelResponse,validatedReply:fixed.reply,issue:fixed.issue,repairRequiredButNotExecuted:Boolean(fixed.repairRequest),executionType:'SAVED_PROVIDER_TEXT_VALIDATION_ONLY_NO_GENERATION'});}
  const reply=local?.reply||saved.answer;const options=captureProductOptions(reply);if(options.length)state.adAngles=options;
  history.push({role:'user',content:message},{role:'assistant',content:reply});
 }
 results.push({id:t.id,...(t.turns?{turns}:turns[0])});
}
const save=(n,d)=>fs.writeFileSync(path.join(R,n),JSON.stringify(d,null,2)+'\n',{flag:'wx'});
save('phase10_local_policy_replay.json',{suite:definitions.suite,executionType:'OFFLINE_REPLAY_NOT_FRESH_LIVE',externalProviderRequests:0,results});save('saved_upstream_guard_replays.json',{externalProviderRequests:0,results:validation});
console.log(JSON.stringify({cases:results.length,localTurns:results.flatMap(t=>t.turns||[t]).filter(t=>t.answer).length,modelRequiredNotExecuted:results.flatMap(t=>t.turns||[t]).filter(t=>!t.answer).length,savedUpstreamValidationOnly:validation.length}));
