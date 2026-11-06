// Local read-only replay of frozen course questions. No provider imports or calls.
require('../../../tests/helpers/deny-network.cjs');
const fs=require('node:fs'),path=require('node:path');
const {retrieveKnowledge}=require('../../../services/tutorKnowledge');
const {productFacts,PRODUCT_RECORDS,PRODUCT_TEMPLATES}=require('../../../services/productTutorKnowledge');
const {productTutorReply}=require('../../../services/productTutorResponse');
const prior=path.resolve(__dirname,'../phase8_live_20261015_090954');
const raw=JSON.parse(fs.readFileSync(path.join(prior,'application_raw_results.json')));
const definitions=JSON.parse(fs.readFileSync(path.join(prior,'all_test_cases_frozen.json')));
const expectations=JSON.parse(fs.readFileSync(path.join(prior,'independent_template_expectations_frozen.json')));
const reviewed=JSON.parse(fs.readFileSync(path.join(prior,'independent_failure_review.json')));
const course=JSON.parse(fs.readFileSync(path.join(prior,'execution_manifest.json'))).fixture;
function local(message,history=[],previous={}){
 const facts=productFacts(message,history,previous);const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message,history,includeMaterials:true,conversationContext:facts});knowledge.productContext=facts;
 const result=productTutorReply({message,history,knowledge});
 return {query:message,answer:result?.reply||null,policy:result?.policy||null,selection:knowledge.responseSelection||null,disposition:result?'deterministic_local_answer':'model_required_not_executed',providerRequests:0,productContext:facts,retrievedSources:knowledge.debugChunks,requestContext:knowledge.requestContext};
}
const outputDir=process.argv[2]||__dirname;fs.mkdirSync(outputDir,{recursive:true});
const outputs=[];
for(const check of expectations.checks){
 const old=raw.results.find(x=>x.id===check.id),turns=old.turns||[old],history=[];
 for(const t of turns.slice(0,check.turn-1))history.push({role:'user',content:t.query},{role:'assistant',content:t.answer});
 const current=turns[check.turn-1],result=local(current.query,history);
 if(!result.answer)throw new Error('Literal request unexpectedly requires model: '+check.id);
 outputs.push({id:check.id,auditedTurn:check.turn,...result,answer:result.answer});
}
// Preserve original IDs/turn numbers for the independent auditor.
const grouped=new Map();
for(const result of outputs){let row=grouped.get(result.id);if(!row){const original=raw.results.find(x=>x.id===result.id);row={id:result.id,turns:(original.turns||[original]).map(t=>({query:t.query,answer:t.answer,replayOrigin:'historical_context_only'}))};grouped.set(result.id,row)}row.turns[result.auditedTurn-1]={...result,replayOrigin:'phase9_local_handler'};}
fs.writeFileSync(path.join(outputDir,'offline_template_responses.json'),JSON.stringify({mode:'LOCAL_HANDLERS_NO_PROVIDER',externalProviderRequests:0,notNewLiveEvaluation:true,results:[...grouped.values()]},null,2)+'\n',{flag:'wx'});
const routes=[];
for(const review of reviewed.results){
 const definition=definitions.single_turn_tests.concat(definitions.conversation_tests).find(t=>t.id===review.id),old=raw.results.find(t=>t.id===review.id),oldTurns=old.turns||[old],history=[];let saved={};const turns=[];
 for(const [i,e]of(definition.turns||[definition]).entries()){
  const q=e.user||e.query,r=local(q,history,saved);saved=r.productContext;turns.push(r);
  history.push({role:'user',content:q},{role:'assistant',content:r.answer||oldTurns[i].answer});
 }
 routes.push({id:review.id,previousFinding:review.classification,turns});
}
fs.writeFileSync(path.join(outputDir,'offline_reviewed_case_routing.json'),JSON.stringify({mode:'LOCAL_ROUTING_DIAGNOSTICS_NOT_QUALITY_SCORE',externalProviderRequests:0,historyPolicy:'User turns and current local answers; a saved Phase8 answer is marked as historical context when model generation is not executed. No synthetic model answer is fabricated.',results:routes},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(outputDir,'knowledge_inventory.json'),JSON.stringify({lessons:PRODUCT_RECORDS.filter(r=>r.contentType==='lesson-summary').map(r=>({lessonNumber:r.lessonNumber,heading:r.heading})),templates:PRODUCT_TEMPLATES.map(r=>({heading:r.heading,chunkId:r.chunkId})),recordCount:PRODUCT_RECORDS.length,uniqueChunkIds:new Set(PRODUCT_RECORDS.map(r=>r.chunkId)).size},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({localTemplateTurns:outputs.length,reviewedRoutingCases:routes.length,modelGenerationExecuted:false,providerRequests:0}));
