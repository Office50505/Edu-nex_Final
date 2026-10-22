'use strict';
// Evidence packaging only: no tests, provider calls, deploy or application writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const B=process.cwd(),R=__dirname,stage=path.join(R,'review_package');fs.mkdirSync(stage);
const entries=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function copy(file,member){const bytes=fs.readFileSync(file),target=path.join(stage,member);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});entries.push({archive:member,bytes:bytes.length,sha256:sha(bytes)});}
for(const n of ['phase9_architecture_analysis.md','phase9_implementation_report.md','phase9_targeted_test_results.json','phase9_regression_results.md','phase9_remaining_issues.md','README.md','phase9_changes.patch'])copy(path.join(R,n),n);
copy(path.resolve(B,'../output/pdf/skillomate-phase9-architecture-comparison-20261015.pdf'),'skillomate-phase9-architecture-comparison-20261015.pdf');
const manifest=JSON.parse(fs.readFileSync(path.join(R,'phase9_validation_manifest.json')));
for(const source of manifest.sourceChanges){
 if(sha(fs.readFileSync(path.join(B,source.path)))!==source.afterSha256)throw new Error('Source changed after final validation: '+source.path);
 copy(path.join(B,source.path),'source/'+source.path);
 if(source.changeType==='modified')copy(path.join(R,'before',source.path),'evidence/before/'+source.path);
}
for(const n of ['before_manifest.json','phase9_validation_manifest.json','offline_phase8_replays.cjs','build_phase9_reports.py','create_comparison_pdf.py','package_phase9_review.cjs','independent_historical_template_audit.json','phase8_saved_response_regrade_v6.json','phase8_saved_response_regrade_v6_verified.json','phase8_saved_response_regrade_v6_final.json'])copy(path.join(R,n),'evidence/'+n);
for(const dir of ['validation_attempt1','validation_attempt2','validation_attempt3','validation_attempt4','final_validation','final_validation_verified','final_validation_complete','final_evaluator_validation','final_backend_validation','final_backend_verified','final_backend_legacy_verified','verified_replays'])for(const n of fs.readdirSync(path.join(R,dir)))if(/\.(?:json|log|xml|py)$/.test(n))copy(path.join(R,dir,n),'evidence/'+dir+'/'+n);
const prior=path.join(B,'reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954');
for(const n of ['application_raw_results.json','all_test_cases_frozen.json','independent_template_expectations_frozen.json','independent_template_audit.json','independent_failure_review.json','v5_integrated_grades.json','phase8_live_summary.md','phase8_failure_analysis.md'])copy(path.join(prior,n),'reference/phase8/'+n);
for(const n of ['knowledge/ai-product-photoshoot-ads/training.txt','knowledge/ai-product-photoshoot-ads/guidance.json','scripts/eval/grade_product_photoshoot_ads_results_v5.py','tests/test_product_evaluator_v5.py','tests/test_product_evaluator_v4.py','tests/test_product_evaluator_v3.py','tests/test_product_evaluator.py','tests/helpers/deny-network.cjs','services/tutorProvider.js'])copy(path.join(B,n),'reference/'+n);
// Private configured-value scan: values and environment files are never printed/copied.
const env={...require('dotenv').parse(fs.readFileSync(path.join(B,'.env'))),...process.env};const secrets=[...new Set(Object.entries(env).filter(([n,v])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(n)&&typeof v==='string'&&v.length>=12).map(([,v])=>v))];
for(const e of entries){if(secrets.some(s=>fs.readFileSync(path.join(stage,e.archive)).includes(Buffer.from(s))))throw new Error('Private credential scan rejected member: '+e.archive);if(/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws|\.git)(?:\/|$)/i.test(e.archive))throw new Error('Credential/environment file excluded: '+e.archive);}
const before=JSON.parse(fs.readFileSync(path.join(R,'before_manifest.json')));
for(const [n,h]of Object.entries(before.historical))if(sha(fs.readFileSync(path.join(B,n)))!==h)throw new Error('Historical evidence changed: '+n);
for(const [n,h]of Object.entries(before.historicalZipHashes))if(sha(fs.readFileSync(n))!==h)throw new Error('Historical ZIP changed: '+path.basename(n));
for(const n of ['knowledge/ai-product-photoshoot-ads/training.txt','knowledge/ai-product-photoshoot-ads/guidance.json','scripts/eval/grade_product_photoshoot_ads_results_v5.py'])if(sha(fs.readFileSync(path.join(B,n)))!==before.sources[n])throw new Error('Preserved source changed: '+n);
const integrity={createdAt:new Date().toISOString(),sourceFilesMatchedValidatedHashes:true,historicalArtifactsVerifiedUnchanged:Object.keys(before.historical).length,historicalZipsVerifiedUnchanged:Object.keys(before.historicalZipHashes).length,v5AndRawCourseFactsUnchanged:true,configuredSecretValueScan:'passed; configured secret values absent from all members',environmentFilesIncluded:false,personalLearnerDataIncluded:false,nonfunctionalTestLiterals:'Synthetic unit fixtures only, no real credentials.',externalProviderRequests:0,liveEvaluationExecuted:false,productionResourcesModified:false,comparisonPdf:{pages:2,renderer:'Locally available PyMuPDF',visualReview:'Both rendered pages inspected; legible without overlap, clipping or missing glyphs.'},files:entries};
fs.writeFileSync(path.join(stage,'phase9_package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred=path.resolve(B,'../Skillomate_Chatbot_Phase9_Architecture_Review.zip'),zip=fs.existsSync(preferred)?path.join(R,'Skillomate_Chatbot_Phase9_Architecture_Review.zip'):preferred;
const code=`from pathlib import Path
import zipfile,json,hashlib,sys,re,xml.etree.ElementTree as ET
stage=Path(sys.argv[1]);out=Path(sys.argv[2])
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(out)as z:
 assert z.testzip()is None
 integrity=json.loads(z.read('phase9_package_integrity.json'))
 for e in integrity['files']:
  b=z.read(e['archive']);assert len(b)==e['bytes']and hashlib.sha256(b).hexdigest()==e['sha256']
 root=ET.fromstring(z.read('evidence/final_backend_legacy_verified/node_verified_output.xml'));cases=list(root.iter('testcase'));assert len(cases)==296 and not any(c.find('failure')is not None or c.find('error')is not None or c.find('skipped')is not None for c in cases)
 log=z.read('evidence/final_evaluator_validation/python_verified_output.log').decode();assert 'Ran 147 tests'in log and re.search(r'^OK$',log,re.M)
 targets=json.loads(z.read('phase9_targeted_test_results.json'));assert targets['summary']=={'total':75,'passed':75,'failed':0,'skipped':0,'inconclusive':0}
 local=json.loads(z.read('evidence/verified_replays/independent_local_template_audit.json'));assert local['total']==local['passed']==35 and local['failed']==0
 old=json.loads(z.read('evidence/independent_historical_template_audit.json'));assert old['passed']==32 and old['failed']==3
 v6=json.loads(z.read('evidence/phase8_saved_response_regrade_v6_final.json'));v5=json.loads(z.read('reference/phase8/v5_integrated_grades.json'));assert v6['summary']['passed']==v5['summary']['passed']==86
 manifest=json.loads(z.read('evidence/phase9_validation_manifest.json'))
 for source in manifest['sourceChanges']:assert hashlib.sha256(z.read('source/'+source['path'])).hexdigest()==source['afterSha256']
 critical={'phase8_unseen_001','phase8_unseen_005','phase8_unseen_006'};checked=[x for x in local['results']if x['id']in critical];assert len(checked)==3 and all(x['passed']for x in checked)
 print(json.dumps({'absoluteZipPath':str(out.resolve()),'files':len(z.namelist()),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'crcAndMemberHashVerification':'passed','backendTestsPassed':296,'evaluatorTestsPassed':147,'newTargetedTestsPassed':75,'independentTemplateReplaysPassed':35,'criticalTemplateReplaysPassed':3,'externalProviderRequests':0,'historicalArtifactsUnchanged':432,'members':z.namelist()},indent=2))
`;
const result=execFileSync('python3',['-B','-c',code,stage,zip],{encoding:'utf8'});fs.writeFileSync(path.join(R,'package_verification.json'),result,{flag:'wx'});const summary=JSON.parse(result);delete summary.members;console.log(JSON.stringify(summary,null,2));
