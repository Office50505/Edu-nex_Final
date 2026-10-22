'use strict';
// Packaging only: no tests, application writes, provider calls or deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const backend=process.cwd(),run=__dirname,stage=path.join(run,'review_package');fs.mkdirSync(stage);
const entries=[],sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function copy(file,member){const data=fs.readFileSync(file),target=path.join(stage,member);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});entries.push({archive:member,bytes:data.length,sha256:sha(data)});}
for(const n of ['phase7_implementation_report.md','phase7_targeted_results.json','phase7_regression_results.md','phase7_remaining_issues.md','README.md','phase7_changes.patch'])copy(path.join(run,n),n);
copy(path.resolve(backend,'../output/pdf/skillomate-phase7-fix-comparison-20261015.pdf'),'skillomate-phase7-fix-comparison-20261015.pdf');
const manifest=JSON.parse(fs.readFileSync(path.join(run,'phase7_validation_manifest.json')));
for(const s of manifest.sourceChanges){const file=path.join(backend,s.path);if(sha(fs.readFileSync(file))!==s.afterSha256)throw new Error('Source changed after validation: '+s.path);copy(file,'source/'+s.path);if(s.changeType==='modified')copy(path.join(run,'before',s.path),'evidence/before/'+s.path);}
for(const n of ['before_manifest.json','phase7_validation_manifest.json','knowledge_inventory.json','phase6_evaluator_defect_review.json','phase6_saved_response_regrade_v5_attempt1.json','phase6_saved_response_regrade_v5_final.json','phase6_saved_response_regrade_v5_verified.json','offline_template_replay_results.json','offline_root_cause_test_definitions.json','offline_root_cause_responses.json','offline_root_cause_grades_attempt1.json','offline_replays.cjs','build_phase7_reports.py','create_comparison_pdf.py','package_phase7_review.cjs'])copy(path.join(run,n),'evidence/'+n);
for(const dir of ['validation_attempt1','validation_attempt2','validation_attempt3','final_validation','final_validation_v2','final_replays','final_replays_v2'])for(const n of fs.readdirSync(path.join(run,dir)))if(/\.(?:json|xml|log|py)$/.test(n))copy(path.join(run,dir,n),'evidence/'+dir+'/'+n);
const prior=path.join(backend,'reports/ai-product-photoshoot-ads-evaluation/phase6_live_20261015_082922');
for(const n of ['application_raw_results.json','all_test_cases_frozen.json','v4_integrated_grades.json','independent_template_audit.json','independent_critical_safety_review.json','phase6_failure_analysis.md'])copy(path.join(prior,n),'reference/phase6/'+n);
for(const n of ['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v4.py','tests/helpers/deny-network.cjs','tests/test_product_evaluator_v4.py','tests/test_product_evaluator_v3.py','tests/test_product_evaluator.py'])copy(path.join(backend,n),'reference/'+n);
// Privately compare configured secret values to bytes; never print them or include environment files.
const env={...require('dotenv').parse(fs.readFileSync(path.join(backend,'.env'))),...process.env};
const secrets=[...new Set(Object.entries(env).filter(([n,v])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(n)&&typeof v==='string'&&v.length>=12).map(([,v])=>v))];
const unsafe=[];
for(const e of entries){const data=fs.readFileSync(path.join(stage,e.archive));if(secrets.some(v=>data.includes(Buffer.from(v)))||/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws)(?:\/|$)/i.test(e.archive))unsafe.push(e.archive);}
if(unsafe.length)throw new Error('Private credential scan rejected members: '+unsafe.join(', '));
const before=JSON.parse(fs.readFileSync(path.join(run,'before_manifest.json')));
for(const [n,h]of Object.entries(before.historical))if(sha(fs.readFileSync(path.join(backend,n)))!==h)throw new Error('Historical evidence changed: '+n);
for(const [n,h]of Object.entries(before.historicalZipHashes))if(sha(fs.readFileSync(n))!==h)throw new Error('Historical ZIP changed: '+path.basename(n));
for(const n of ['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v4.py'])if(sha(fs.readFileSync(path.join(backend,n)))!==before.sources[n])throw new Error('Preserved reference changed: '+n);
const integrity={createdAt:new Date().toISOString(),configuredSecretValueScan:'passed; no configured secret value in any package member',environmentAndCredentialFilesIncluded:false,personalData:'Only synthetic course-evaluation and unit-test fixtures; no personal learner records.',historicalFilesVerifiedUnchanged:Object.keys(before.historical).length,historicalZipFilesVerifiedUnchanged:Object.keys(before.historicalZipHashes).length,sourceFilesMatchedValidatedHashes:true,externalProviderRequests:0,comparisonPdf:{pages:2,renderer:'Locally available PyMuPDF',visualReview:'Both PNG page renderings inspected; no overlap, clipping, missing glyphs or illegible content.'},files:entries};
fs.writeFileSync(path.join(stage,'phase7_package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred=path.resolve(backend,'../Skillomate_Chatbot_Phase7_Fix_Review.zip');const zip=fs.existsSync(preferred)?path.join(run,'Skillomate_Chatbot_Phase7_Fix_Review.zip'):preferred;
const script=`from pathlib import Path
import zipfile,json,hashlib,sys,xml.etree.ElementTree as ET,re
stage=Path(sys.argv[1]);out=Path(sys.argv[2])
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(out)as z:
 assert z.testzip() is None
 integrity=json.loads(z.read('phase7_package_integrity.json'))
 for e in integrity['files']:
  data=z.read(e['archive']);assert len(data)==e['bytes']and hashlib.sha256(data).hexdigest()==e['sha256']
 root=ET.fromstring(z.read('evidence/final_validation_v2/node_verified_output.xml'));cases=list(root.iter('testcase'));assert len(cases)==239 and not any(c.find('failure')is not None or c.find('error')is not None or c.find('skipped')is not None for c in cases)
 log=z.read('evidence/final_validation_v2/python_verified_output.log').decode();assert 'Ran 111 tests' in log and re.search(r'^OK$',log,re.M)
 targeted=json.loads(z.read('phase7_targeted_results.json'));assert targeted['summary']=={'total':66,'passed':66,'failed':0,'skipped':0,'inconclusive':0}
 t=json.loads(z.read('evidence/final_replays_v2/offline_template_replay_results.json'));assert t['passed']==t['total']==36 and t['failed']==0
 r=json.loads(z.read('evidence/final_replays_v2/offline_root_cause_grades.json'));assert r['summary']['passed']==5 and r['summary']['failed']==0
 hist=json.loads(z.read('reference/phase6/v4_integrated_grades.json'));v5=json.loads(z.read('evidence/phase6_saved_response_regrade_v5_verified.json'));assert hist['summary']['passed']==91 and v5['summary']['passed']==95
 m=json.loads(z.read('evidence/phase7_validation_manifest.json'))
 for s in m['sourceChanges']:assert hashlib.sha256(z.read('source/'+s['path'])).hexdigest()==s['afterSha256']
 print(json.dumps({'absoluteZipPath':str(out.resolve()),'files':len(z.namelist()),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'crcAndMemberHashVerification':'passed','nodeRawLogChecks':239,'pythonRawLogChecks':111,'targetedChecks':66,'templateReplays':36,'genuineFailureReplays':5,'externalProviderRequests':0,'members':z.namelist()},indent=2))
`;
const result=execFileSync('python3',['-B','-c',script,stage,zip],{encoding:'utf8'});fs.writeFileSync(path.join(run,'package_verification.json'),result,{flag:'wx'});const verified=JSON.parse(result);delete verified.members;process.stdout.write(JSON.stringify(verified,null,2)+'\n');
