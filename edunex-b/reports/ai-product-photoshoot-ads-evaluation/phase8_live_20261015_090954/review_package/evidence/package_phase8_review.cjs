'use strict';
// Packaging saved evidence only. No tests, model calls or application edits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const B=process.cwd(),R=__dirname,stage=path.join(R,'review_package');fs.mkdirSync(stage);
const entries=[],sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function copy(file,member){const bytes=fs.readFileSync(file),dest=path.join(stage,member);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});entries.push({archive:member,bytes:bytes.length,sha256:sha(bytes)});}
const reports=['phase8_live_results.json','phase8_live_summary.md','phase8_failure_analysis.md','phase8_regression_results.md','phase8_manual_review_samples.md','phase8_readiness_assessment.md'];
for(const n of [...reports,'README.md'])copy(path.join(R,n),n);
for(const n of ['application_raw_results.json','acceptance_criteria_frozen.json','existing_definitions_frozen.json','unseen_definitions_frozen.json','all_test_cases_frozen.json','independent_template_expectations_frozen.json','test_set_freeze_manifest.json','preflight_source_verification.json','knowledge_preflight.json','course_asset_manifest.json','execution_manifest.json','evaluation_runner.cjs','execution_command_ledger.json','connectivity_probe.json','evaluation_configuration.json','v5_integrated_grades.json','v5_model_only_grades.json','independent_template_audit.json','independent_template_audit.py','template_audit_reproducibility_check.json','independent_exact_instruction_review.json','independent_critical_safety_review.json','independent_failure_review.json','node_verified_execution.json','node_verified_output.xml','node_verified_stderr.log','python_verified_execution.json','python_verified_output.log','python_verified_stderr.log','run_verified_validation.py','generate_frozen_cases.py','build_phase8_reports.py','package_phase8_review.cjs','report_aggregation_correction.md'])copy(path.join(R,n),'evidence/'+n);
const freeze=JSON.parse(fs.readFileSync(path.join(R,'preflight_source_verification.json'))),caseFreeze=JSON.parse(fs.readFileSync(path.join(R,'test_set_freeze_manifest.json')));
for(const [n,h]of Object.entries(freeze.sourceHashes)){
 if(sha(fs.readFileSync(path.join(B,n)))!==h||sha(fs.readFileSync(path.join(R,'frozen_sources',n)))!==h)throw new Error('Frozen source changed: '+n);
 copy(path.join(R,'frozen_sources',n),'frozen_sources/'+n);
}
for(const [n,h]of Object.entries(caseFreeze.frozenFiles))if(sha(fs.readFileSync(path.join(R,n)))!==h)throw new Error('Test/criteria freeze violated: '+n);
const manifest=JSON.parse(fs.readFileSync(path.join(R,'execution_manifest.json')));if(sha(fs.readFileSync(path.join(R,'evaluation_runner.cjs')))!==manifest.runnerSha256)throw new Error('Runner changed after initialization');
for(const [n,h]of Object.entries(freeze.historicalHashes))if(sha(fs.readFileSync(path.join(B,n)))!==h)throw new Error('Historical artifact changed: '+n);
for(const [n,h]of Object.entries(freeze.historicalZipHashes))if(sha(fs.readFileSync(n))!==h)throw new Error('Historical ZIP changed: '+path.basename(n));
const base=path.join(B,'reports/ai-product-photoshoot-ads-evaluation');
for(const n of ['phase6_live_20261015_082922/v4_integrated_grades.json','phase6_live_20261015_082922/phase6_live_summary.md','phase7_fixes_20261015_084551/phase6_saved_response_regrade_v5_verified.json','phase7_fixes_20261015_084551/phase7_validation_manifest.json'])copy(path.join(base,n),'reference/'+n);
// Never print configured secret values, authorization headers or environment files.
const env={...require('dotenv').parse(fs.readFileSync(path.join(B,'.env'))),...process.env};const secrets=[...new Set(Object.entries(env).filter(([n,v])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(n)&&typeof v==='string'&&v.length>=12).map(([,v])=>v))];
for(const e of entries){
 const bytes=fs.readFileSync(path.join(stage,e.archive));
 if(secrets.some(value=>bytes.includes(Buffer.from(value))))throw new Error('Private configured-secret scan rejected member: '+e.archive);
 if(/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws|\.git)(?:\/|$)/i.test(e.archive))throw new Error('Excluded credential/environment path: '+e.archive);
}
const integrity={createdAt:new Date().toISOString(),sourceFilesVerifiedUnchanged:Object.keys(freeze.sourceHashes).length,frozenCasesAndCriteriaVerifiedUnchanged:true,runnerVerifiedUnchanged:true,historicalArtifactsVerifiedUnchanged:Object.keys(freeze.historicalHashes).length,historicalZipsVerifiedUnchanged:Object.keys(freeze.historicalZipHashes).length,configuredSecretValueScan:'passed; configured secret values absent from all members',environmentFilesIncluded:false,authenticationHeadersIncluded:false,personalLearnerRecordsIncluded:false,syntheticDataBoundary:true,applicationCodeModified:false,evaluatorModified:false,acceptanceCriteriaModified:false,productionResourcesModified:false,providerRequests:{scored:13,preflight:1,regression:0},files:entries};
fs.writeFileSync(path.join(stage,'phase8_package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred=path.resolve(B,'../Skillomate_Chatbot_Phase8_Final_Live_Review.zip'),zip=fs.existsSync(preferred)?path.join(R,'Skillomate_Chatbot_Phase8_Final_Live_Review.zip'):preferred;
const script=`from pathlib import Path
import zipfile,json,hashlib,sys,re,xml.etree.ElementTree as ET
stage=Path(sys.argv[1]);out=Path(sys.argv[2])
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(out)as z:
 assert z.testzip()is None
 integrity=json.loads(z.read('phase8_package_integrity.json'))
 for m in integrity['files']:
  b=z.read(m['archive']);assert len(b)==m['bytes']and hashlib.sha256(b).hexdigest()==m['sha256']
 result=json.loads(z.read('phase8_live_results.json'));s=result['summary'];assert s['totalCases']==100 and s['totalTurns']==119 and s['passed']==86 and s['failed']==14 and s['skipped']==s['inconclusive']==0
 assert s['bySet']['existing']['passed']==49 and s['bySet']['unseen']['passed']==37
 raw=json.loads(z.read('evidence/application_raw_results.json'));defs=json.loads(z.read('evidence/all_test_cases_frozen.json'));grade=json.loads(z.read('evidence/v5_integrated_grades.json'));assert len(raw['results'])==len(grade['results'])==len(defs['single_turn_tests'])+len(defs['conversation_tests'])==100
 assert sum(len(r.get('turns',[r]))for r in raw['results'])==119
 assert {r['id']for r in raw['results']}=={r['id']for r in result['results']}=={r['id']for r in grade['results']}
 check=json.loads(z.read('evidence/independent_template_audit.json'));assert check['total']==35 and check['passed']==32 and check['failed']==3
 safety=json.loads(z.read('evidence/independent_critical_safety_review.json'));assert safety['caseCount']==26 and safety['turnCount']==31 and safety['confirmedCriticalAdvertisingSafetyFailures']==0
 faq=json.loads(z.read('evidence/independent_exact_instruction_review.json'));assert faq['total']==6 and faq['passed']==4
 node=ET.fromstring(z.read('evidence/node_verified_output.xml'));cases=list(node.iter('testcase'));assert len(cases)==239 and not any(c.find('failure')is not None or c.find('error')is not None or c.find('skipped')is not None for c in cases)
 python=z.read('evidence/python_verified_output.log').decode();assert 'Ran 111 tests' in python and re.search(r'^OK$',python,re.M)
 freeze=json.loads(z.read('evidence/preflight_source_verification.json'));cf=json.loads(z.read('evidence/test_set_freeze_manifest.json'))
 for n,h in freeze['sourceHashes'].items():assert hashlib.sha256(z.read('frozen_sources/'+n)).hexdigest()==h
 for n,h in cf['frozenFiles'].items():assert hashlib.sha256(z.read('evidence/'+n)).hexdigest()==h
 print(json.dumps({'absoluteZipPath':str(out.resolve()),'files':len(z.namelist()),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'crcAndMemberHashVerification':'passed','all100CasesAccountedFor':True,'passed':86,'failed':14,'skipped':0,'inconclusive':0,'existingPassed':49,'unseenPassed':37,'criticalTemplateFailures':3,'criticalAdvertisingSafetyFailures':0,'backendTestsPassed':239,'evaluatorTestsPassed':111,'members':z.namelist()},indent=2))
`;
const output=execFileSync('python3',['-B','-c',script,stage,zip],{encoding:'utf8'});fs.writeFileSync(path.join(R,'package_verification.json'),output,{flag:'wx'});const summary=JSON.parse(output);delete summary.members;console.log(JSON.stringify(summary,null,2));
