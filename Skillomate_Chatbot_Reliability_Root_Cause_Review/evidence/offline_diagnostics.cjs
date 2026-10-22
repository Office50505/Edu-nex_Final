'use strict';
// Read-only diagnostic calls to current pure helpers. No app server/model invocation.
if(!globalThis[Symbol.for('skillomate.externalNetworkDenied')])throw Error('Preload network denial guard');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const E=__dirname,B=path.resolve(E,'../../edunex-b');
const knowledge=require(path.join(B,'services/productTutorKnowledge'));
const state=require(path.join(B,'services/productTutorState'));
const intent=require(path.join(B,'services/productTutorIntent'));
const response=require(path.join(B,'services/productTutorResponse'));
const tasks=require(path.join(B,'services/productTutorTasks'));
const src=fs.readFileSync(path.join(B,'services/aiTutorService.js'),'utf8');
const names=['latestMessageLanguage','explicitLanguagePreference','responseLanguage','localizedReply','isSkillomatePlanQuestion','isLearnerContextQuestion','cleanLearnerReply'];
const functions=names.map(name=>{
 const start=src.indexOf('function '+name+'('),end=src.indexOf('\n}',start)+2;
 if(start<0||end<start)throw Error('Function source unavailable: '+name);
 return src.slice(start,end);
}).join('\n');
const runtime={};vm.runInNewContext(functions,runtime);
const all=JSON.parse(fs.readFileSync(path.join(E,'all_case_audit_inputs.json'))),rows=[];
for(const spec of all.filter(c=>c.originalGrade.status==='FAIL'))for(const turn of spec.turns){
 if(turn.grade.status!=='FAIL')continue;
 const message=turn.request.message,history=turn.actualRequest.history||[];
 const context=structuredClone(turn.contexts[0]?.result||null);
 let result=null,error=null;
 try{if(context)result=response.productTutorReply({message,history:context.conversationHistory||history,knowledge:context})}catch(e){error={name:e.name,message:e.message}}
 const cleaned=result?.reply?runtime.cleanLearnerReply(result.reply):null;
 const allAsset=knowledge.findProductTemplate(message);
 rows.push({id:spec.id,turn:turn.index,originalTurnGrade:turn.grade.status,
  actualProvider:turn.response.provider,actualProviderAttempts:turn.providerRequests.length,
  copyIntent:intent.productCopyIntent(message),wantsProductPrompt:knowledge.wantsProductPrompt(message),
  matchingGlobalAsset:allAsset?.heading||null,
  matchingRetrievedAsset:context?knowledge.findProductTemplate(message,[],context.records.filter(r=>r.contentType==='exact-template'))?.heading||null:null,
  entity:state.extractEntity(message),operations:state.productOperations(message),slots:knowledge.productSlots(message),
  requestedOutputs:knowledge.requestedProductOutputs(message),requestedHookCount:tasks.requestedHookCount(message),
  productLanguage:intent.productResponseLanguage(message,history),genericLanguage:runtime.responseLanguage(message),
  globalLearnerMatcher:runtime.isLearnerContextQuestion(message),globalPlanMatcher:runtime.isSkillomatePlanQuestion(message),
  replayedProductPolicy:result?.policy||null,replayedProductReply:cleaned,
  replayMatchesRecordedReply:cleaned!==null?cleaned===turn.response.answer:null,error});
}
const summary={kind:'Post-evaluation diagnostic, not a new evaluation or improved-accuracy claim',
 generatedAt:new Date().toISOString(),sourceFunctionExtraction:'Exact function declarations from current aiTutorService.js; no edits',
 pureProductReplyComparisons:rows.filter(r=>r.replayedProductReply!==null).length,
 pureProductReplyMatches:rows.filter(r=>r.replayMatchesRecordedReply===true).length,
 failedTurnsWithProviderAttempts:rows.filter(r=>r.actualProviderAttempts).length,
 rows};
fs.writeFileSync(path.join(E,'offline_diagnostics.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({rows:rows.length,pureComparisons:summary.pureProductReplyComparisons,matches:summary.pureProductReplyMatches,failedTurnsWithProviderAttempts:summary.failedTurnsWithProviderAttempts}));
