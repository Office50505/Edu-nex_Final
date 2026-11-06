// Offline local-handler verification. No provider adapter or credentials loaded.
require('../../../tests/helpers/deny-network.cjs');
const fs=require('node:fs');const path=require('node:path');
const {retrieveKnowledge}=require('../../../services/tutorKnowledge');
const {productTutorReply}=require('../../../services/productTutorResponse');
const prior=path.resolve(__dirname,'../phase2_live_review_20261015_120010');
const raw=JSON.parse(fs.readFileSync(path.join(prior,'application_raw_results.json')));
const audit=JSON.parse(fs.readFileSync(path.join(prior,'independent_template_audit.json')));
const course=JSON.parse(fs.readFileSync(path.join(prior,'execution_manifest.json'))).fixture;
const norm=text=>String(text).normalize('NFKC').replace(/[“”]/g,'"').replace(/’/g,"'").replace(/\s+/g,' ').replaceAll('"',"'").trim();
const results=[];
for(const check of audit.results){
 const original=raw.results.find(r=>r.id===check.id);const turns=original.turns||[original];const current=turns[check.turn-1];const history=[];
 for(const turn of turns.slice(0,check.turn-1))history.push({role:'user',content:turn.query},{role:'assistant',content:turn.answer});
 const knowledge=retrieveKnowledge({courses:[course],activeCourse:course,message:current.query,history,includeMaterials:true});
 const reply=productTutorReply({message:current.query,history,knowledge});
 const block=reply?.reply.match(/```text\n([\s\S]*?)\n```/)?.[1]||'';
 results.push({id:check.id,turn:check.turn,question:current.query,history,expectedCompleteBody:check.expected_complete_body,
  actualLocalResponse:reply?.reply||null,origin:'local_knowledge_handler',providerRequests:0,templateId:reply?.templateId,
  passed:norm(block)===norm(check.expected_complete_body)});
}
const criticalIds=['new15_002','new15_conv_001','new15_conv_005'];
const output={mode:'LOCAL_HANDLER_REPLAY_NO_MODEL_CALLS',interpretation:'Validation of local fixes against saved test inputs and independent source-derived template expectations; not a new live evaluation or replacement of historical scores.',
 total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,providerRequests:0,
 criticalCases:results.filter(r=>criticalIds.includes(r.id)),results};
fs.writeFileSync(path.join(__dirname,'offline_template_replay_results.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({total:output.total,passed:output.passed,failed:output.failed,criticalCases:output.criticalCases.map(r=>({id:r.id,passed:r.passed})),providerRequests:0}));
if(output.failed)process.exitCode=1;
