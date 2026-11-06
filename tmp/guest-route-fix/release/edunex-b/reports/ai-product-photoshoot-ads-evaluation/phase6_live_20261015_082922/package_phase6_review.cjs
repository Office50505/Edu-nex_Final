'use strict';
// Evidence packaging only: no tests/provider calls/application writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const backend=process.cwd(),run=__dirname,stage=path.join(run,'review_package');
fs.mkdirSync(stage);
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const entries=[];
function copy(file,member){
 const data=fs.readFileSync(file),target=path.join(stage,member);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});
 entries.push({archive:member,bytes:data.length,sha256:sha(data)});
}
for(const name of ['phase6_live_results.json','phase6_live_summary.md','phase6_failure_analysis.md','phase6_regression_results.md','phase6_manual_review_samples.md','phase6_readiness_assessment.md','evaluation_configuration.json','README.md'])copy(path.join(run,name),name);
for(const name of ['application_raw_results.json','all_test_cases_frozen.json','baseline80_test_cases_frozen.json','new20_test_cases_frozen.json','new20_independent_template_expectations_frozen.json',
 'original_test_cases.json','held_out_test_cases.json','held_out_definitions_frozen.json','unseen_definitions_frozen.json','evaluation_policy_frozen.json','preflight_source_verification.json','connectivity_probe.json',
 'historical_hashes_before.json','course_asset_manifest.json','independent_template_audit.json','independent_exact_instruction_review.json','independent_critical_safety_review.json',
 'v4_integrated_grades.json','v4_model_only_grades.json','node_verified_output.xml','node_verified_stderr.log','node_verified_execution.json','python_verified_output.log','python_verified_stderr.log','python_verified_execution.json',
 'evaluation_runner.cjs','run_verified_validation.py','build_phase6_reports.py','package_phase6_review.cjs'])copy(path.join(run,name),'evidence/'+name);
for(const name of ['scripts/eval/grade_product_photoshoot_ads_results_v4.py','knowledge/ai-product-photoshoot-ads/training.txt','knowledge/ai-product-photoshoot-ads/guidance.json','tests/helpers/deny-network.cjs'])copy(path.join(backend,name),'reference/'+name);
for(const [name,member] of [
 ['phase4_live_20261015_071604/v3_integrated_grades.json','reference/historical_phase4_v3_grades.json'],
 ['phase4_live_20261015_071604/independent_template_audit_complete.json','reference/historical_phase4_independent_template_expectations.json'],
 ['phase5_fixes_20261015_075435/phase4_saved_response_regrade_v4_reviewed.json','reference/historical_phase4_saved_response_v4_grades.json'],
 ['phase5_fixes_20261015_075435/phase5_validation_manifest.json','reference/phase5_validated_implementation_manifest.json'],
 ])copy(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation',name),member);

// Credential values are loaded privately only to scan all packaged bytes. Never
// include environment files, request authentication headers or these values.
const env={...require('dotenv').parse(fs.readFileSync(path.join(backend,'.env'))),...process.env};
const secrets=[...new Set(Object.entries(env).filter(([name,value])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(name)&&typeof value==='string'&&value.length>=12).map(([,value])=>value))];
const unsafe=[];
for(const entry of entries){
 const bytes=fs.readFileSync(path.join(stage,entry.archive));
 if(secrets.some(value=>bytes.includes(Buffer.from(value)))||/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws)(?:\/|$)/i.test(entry.archive))unsafe.push(entry.archive);
}
if(unsafe.length)throw new Error('Configured secret scan rejected files: '+unsafe.join(', '));
const config=JSON.parse(fs.readFileSync(path.join(run,'evaluation_configuration.json')));
for(const [name,hash] of Object.entries(config.sourceHashes))if(sha(fs.readFileSync(path.join(backend,name)))!==hash)throw new Error('Application/evaluator source changed: '+name);
const phase5=JSON.parse(fs.readFileSync(path.join(backend,'reports/ai-product-photoshoot-ads-evaluation/phase5_fixes_20261015_075435/phase5_validation_manifest.json')));
for(const file of phase5.sourceChanges)if(sha(fs.readFileSync(path.join(backend,file.path)))!==file.afterSha256)throw new Error('Phase 5 source changed: '+file.path);
const history=JSON.parse(fs.readFileSync(path.join(run,'historical_hashes_before.json')));
for(const [name,hash] of Object.entries(history))if(sha(fs.readFileSync(path.join(backend,name)))!==hash)throw new Error('Historical evidence changed: '+name);
const integrity={createdAt:new Date().toISOString(),configuredSecretValueScan:'passed; configured secret values absent',environmentOrCredentialFilesIncluded:false,
 historicalFilesVerifiedUnchanged:Object.keys(history).length,phase5SourceFilesMatchedValidatedHashes:true,recordedApplicationAndEvaluatorHashesUnchanged:true,
 scoredExternalProviderRequests:5,preflightExternalProviderRequests:1,applicationCodeModified:false,evaluatorCriteriaChanged:false,files:entries};
fs.writeFileSync(path.join(stage,'package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred=path.resolve(backend,'../Skillomate_Chatbot_Phase6_Final_Review.zip');
const zip=fs.existsSync(preferred)?path.join(run,'Skillomate_Chatbot_Phase6_Final_Review.zip'):preferred;
const script=`from pathlib import Path
import zipfile,json,hashlib,sys,xml.etree.ElementTree as ET,re
stage=Path(sys.argv[1]);output=Path(sys.argv[2])
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 integrity=json.loads(z.read('package_integrity.json'))
 for f in integrity['files']:
  b=z.read(f['archive']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
 d=json.loads(z.read('phase6_live_results.json'));cases=d['results'];turns=[t for c in cases for t in c['turns']]
 assert len(cases)==len({c['id'] for c in cases})==100 and len(turns)==130 and all(t['actualResponse'] and t['httpStatus']==200 for t in turns)
 assert sum(c['status']=='PASS' for c in cases)==91 and sum(c['status']=='FAIL' for c in cases)==9
 root=ET.fromstring(z.read('evidence/node_verified_output.xml'));tests=list(root.iter('testcase'))
 assert len(tests)==191 and not any(t.find('failure') is not None or t.find('error') is not None or t.find('skipped') is not None for t in tests)
 log=z.read('evidence/python_verified_output.log').decode();assert 'Ran 77 tests' in log and re.search(r'^OK$',log,re.M)
 print(json.dumps({'absoluteZipPath':str(output.resolve()),'files':len(z.namelist()),'zipBytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'crcAndMemberHashes':'passed','all100CasesAccountedFor':True,'actualResponseTurns':len(turns),'backendRawLogVerified':191,'evaluatorRawLogVerified':77}))
`;
const result=execFileSync('python3',['-B','-c',script,stage,zip],{encoding:'utf8'});
fs.writeFileSync(path.join(run,'package_verification.json'),result,{flag:'wx'});process.stdout.write(result);
