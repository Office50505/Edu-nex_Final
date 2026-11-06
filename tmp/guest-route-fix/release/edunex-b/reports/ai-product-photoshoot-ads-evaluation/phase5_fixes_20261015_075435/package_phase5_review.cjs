'use strict';
// Review packaging only: no tests, provider calls, deployments or application edits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const backend=process.cwd(),run=__dirname,stage=path.join(run,'review_package');
fs.mkdirSync(stage);
const entries=[];const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function copy(file,member){
 const data=fs.readFileSync(file),target=path.join(stage,member);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});
 entries.push({archive:member,bytes:data.length,sha256:sha(data)});
}
for(const name of ['phase5_implementation_report.md','phase5_targeted_test_results.json','phase5_regression_results.md','phase5_remaining_issues.md','README.md','phase5_changes.patch'])copy(path.join(run,name),name);
const pdf=path.resolve(backend,'../output/pdf/skillomate-phase5-fix-comparison-20261015.pdf');
copy(pdf,'skillomate-phase5-fix-comparison-20261015.pdf');
const manifest=JSON.parse(fs.readFileSync(path.join(run,'phase5_validation_manifest.json')));
for(const source of manifest.sourceChanges){
 const file=path.join(backend,source.path);if(sha(fs.readFileSync(file))!==source.afterSha256)throw new Error('Source changed after validation: '+source.path);
 copy(file,'source/'+source.path);
}
for(const name of ['before_manifest.json','additional_before_manifest.json','phase5_validation_manifest.json','suspected_evaluator_failure_review.json','phase4_saved_response_regrade_v4_reviewed.json','offline_template_replay_results.json','offline_root_cause_test_definitions.json','offline_root_cause_responses.json','offline_root_cause_grades_verified.json','offline_replays.cjs','build_phase5_reports.py','create_comparison_pdf.py','package_phase5_review.cjs'])copy(path.join(run,name),'evidence/'+name);
for(const [directory,label] of [['','attempt1'],['final_validation','attempt2'],['verified_validation','verified_backend_and_initial_evaluator'],['evaluator_verified','final_evaluator']]){
 for(const name of fs.readdirSync(path.join(run,directory))){
  if(/^(?:node|python)_verified_(?:output\.(?:xml|log)|stderr\.log|execution\.json)$/.test(name)||name==='run_verified_validation.py')copy(path.join(run,directory,name),'evidence/'+label+'/'+name);
 }
}
const reference=path.join(backend,'reports/ai-product-photoshoot-ads-evaluation/phase4_live_20261015_071604');
for(const name of ['application_raw_results.json','all_test_cases_frozen.json','v3_integrated_grades.json','independent_template_audit_complete.json','phase4_failure_analysis.md'])copy(path.join(reference,name),'reference/phase4/'+name);
for(const name of ['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v3.py','tests/test_product_evaluator_v3.py','tests/helpers/deny-network.cjs'])copy(path.join(backend,name),'reference/'+name);

// Secret values are used only for a private byte scan, never printed or copied.
const env={...require('dotenv').parse(fs.readFileSync(path.join(backend,'.env'))),...process.env};
const secrets=[...new Set(Object.entries(env).filter(([name,value])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(name)&&typeof value==='string'&&value.length>=12).map(([,value])=>value))];
const unsafe=[];
for(const item of entries){
 const data=fs.readFileSync(path.join(stage,item.archive));
 if(secrets.some(value=>data.includes(Buffer.from(value)))||/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws)(?:\/|$)/i.test(item.archive))unsafe.push(item.archive);
}
if(unsafe.length)throw new Error('Secret scan rejected package files: '+unsafe.join(', '));
const before=JSON.parse(fs.readFileSync(path.join(run,'before_manifest.json')));
for(const [name,hash]of Object.entries(before.historical))if(sha(fs.readFileSync(path.join(backend,name)))!==hash)throw new Error('Historical artifact changed: '+name);
if(sha(fs.readFileSync(path.resolve(backend,'../Skillomate_Chatbot_Phase4_Live_Review.zip')))!==before.phase4ZipSha256)throw new Error('Historical ZIP changed');
const integrity={createdAt:new Date().toISOString(),configuredSecretValueScan:'passed; configured credential values absent',environmentOrCredentialFilesIncluded:false,
 historicalFilesVerifiedUnchanged:Object.keys(before.historical).length,phase4ZipUnchanged:true,sourceFilesMatchedValidatedHashes:true,externalProviderRequests:0,
 comparisonPdf:{pages:2,renderer:'PyMuPDF available locally',visualReview:'Both rendered pages inspected: legible with no clipping or overlap.'},files:entries};
fs.writeFileSync(path.join(stage,'phase5_package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred=path.resolve(backend,'../Skillomate_Chatbot_Phase5_Fix_Review.zip');
const zip=fs.existsSync(preferred)?path.join(run,'Skillomate_Chatbot_Phase5_Fix_Review.zip'):preferred;
const script=`from pathlib import Path
import zipfile,json,hashlib,sys,xml.etree.ElementTree as ET,re
stage=Path(sys.argv[1]);out=Path(sys.argv[2])
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 integrity=json.loads(z.read('phase5_package_integrity.json'))
 for item in integrity['files']:
  b=z.read(item['archive']);assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256']
 root=ET.fromstring(z.read('evidence/verified_backend_and_initial_evaluator/node_verified_output.xml'));cases=list(root.iter('testcase'))
 assert len(cases)==191 and not any(c.find('failure') is not None or c.find('error') is not None or c.find('skipped') is not None for c in cases)
 log=z.read('evidence/final_evaluator/python_verified_output.log').decode();assert 'Ran 77 tests' in log and re.search(r'^OK$',log,re.M)
 results=json.loads(z.read('phase5_targeted_test_results.json'));assert results['summary']['passed']==54 and results['summary']['failed']==0
 print(json.dumps({'absoluteZipPath':str(out.resolve()),'files':len(z.namelist()),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'crcAndMemberHashVerification':'passed','nodeRawLogChecks':191,'pythonRawLogChecks':77}))
`;
const result=execFileSync('python3',['-B','-c',script,stage,zip],{encoding:'utf8'});
fs.writeFileSync(path.join(run,'package_verification.json'),result,{flag:'wx'});process.stdout.write(result);
