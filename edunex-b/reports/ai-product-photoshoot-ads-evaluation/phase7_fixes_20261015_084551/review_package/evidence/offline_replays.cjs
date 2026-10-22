// Local handlers and recorded-provider fixtures only. Networking is denied.
require('../../../tests/helpers/deny-network.cjs');
const fs=require('node:fs'),path=require('node:path');
const {retrieveKnowledge}=require('../../../services/tutorKnowledge');
const {productFacts}=require('../../../services/productTutorKnowledge');
const {productTutorReply,validateProductReply}=require('../../../services/productTutorResponse');
const prior=path.resolve(__dirname,'../phase6_live_20261015_082922');
const raw=JSON.parse(fs.readFileSync(path.join(prior,'application_raw_results.json')));
const cases=JSON.parse(fs.readFileSync(path.join(prior,'all_test_cases_frozen.json')));
const audit=JSON.parse(fs.readFileSync(path.join(prior,'independent_template_audit.json')));
const course={_id:'6d0000000000000000000000',slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]};
const norm=t=>String(t).normalize('NFKC').replace(/[“”]/g,'"').replace(/’/g,"'").replace(/\s+/g,' ').replaceAll('"',"'").trim();
function response(message,history,saved,recorded){
 const facts=productFacts(message,history,saved);
 const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,conversationContext:facts,includeMaterials:true});
 knowledge.productContext=facts;
 const local=productTutorReply({message,history,knowledge});
 let reply=local?.reply,fixture=null,issue=null;
 if(!reply){
  fixture=recorded.providerRequests?.at(-1)?.rawModelResponse;
  if(!fixture)throw new Error('No local result or recorded provider fixture; refusing external requests');
  const checked=validateProductReply({message,history,knowledge,reply:fixture});reply=checked.reply;issue=checked.issue;
 }
 const productContext={...facts,lessonNumber:knowledge.requestContext.lessonNumber||facts.lessonNumber,topic:knowledge.requestContext.topic||facts.topic};
 return {answer:reply,provider:local?'course-knowledge-rule':issue?'course-response-policy':'fal-openrouter',
  outcome:{type:local?'local_rule':issue?'validated_local_replacement':'recorded_provider_fixture',liveModelAnswer:false,providerStatus:'not_requested',responseIssue:issue},
  replayOrigin:local?'local_knowledge_handler':'recorded_provider_fixture_validation',recordedProviderText:fixture,
  query:message,productContext,retrievedSources:knowledge.debugChunks,externalProviderRequests:0};
}
const outputDir=process.argv[2]||__dirname;
fs.mkdirSync(outputDir,{recursive:true});
const templateResults=[];
for(const check of audit.results){
 const old=raw.results.find(r=>r.id===check.id);const turns=old.turns||[old];const history=[];
 for(const t of turns.slice(0,check.turn-1))history.push({role:'user',content:t.query},{role:'assistant',content:t.answer});
 const current=turns[check.turn-1];const result=response(current.query,history,{},current);
 const block=result.answer.match(/```text\n([\s\S]*?)\n```/)?.[1]||'';
 templateResults.push({id:check.id,turn:check.turn,question:current.query,history,expectedCompleteBody:check.expectedCompleteBody,
  actualLocalResponse:result.answer,origin:result.replayOrigin,providerRequests:0,passed:norm(block)===norm(check.expectedCompleteBody)});
}
const templateOutput={mode:'LOCAL_TEMPLATE_REPLAY_NO_EXTERNAL_CALLS',total:templateResults.length,passed:templateResults.filter(x=>x.passed).length,
 failed:templateResults.filter(x=>!x.passed).length,externalProviderRequests:0,results:templateResults};
fs.writeFileSync(path.join(outputDir,'offline_template_replay_results.json'),JSON.stringify(templateOutput,null,2)+'\n',{flag:'wx'});
const ids=['ppads_001','phase6_new_004','phase6_new_008','phase6_new_012','phase6_new_018'];
const selected={...cases,suite:'Phase7_five_root_cause_local_replays',single_turn_tests:cases.single_turn_tests.filter(t=>ids.includes(t.id)),conversation_tests:cases.conversation_tests.filter(t=>ids.includes(t.id))};
const output={mode:'LOCAL_HANDLERS_AND_SAVED_PROVIDER_FIXTURES',externalProviderRequests:0,notNewLiveEvaluation:true,results:[]};
for(const test of selected.single_turn_tests.concat(selected.conversation_tests)){
 const old=raw.results.find(r=>r.id===test.id);const recorded=old.turns||[old];const history=[];let saved={};const turns=[];
 for(const [i,turn] of (test.turns||[test]).entries()){
  const message=turn.user||turn.query;const answer=response(message,history,saved,recorded[i]);saved=answer.productContext;turns.push(answer);
  history.push({role:'user',content:message},{role:'assistant',content:answer.answer});
 }
 output.results.push({id:test.id,...(test.turns?{turns}:turns[0])});
}
fs.writeFileSync(path.join(outputDir,'offline_root_cause_test_definitions.json'),JSON.stringify(selected,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(outputDir,'offline_root_cause_responses.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({templateReplay:{total:templateOutput.total,passed:templateOutput.passed,failed:templateOutput.failed},rootCauseCases:output.results.length,externalProviderRequests:0}));
if(templateOutput.failed)process.exitCode=1;
