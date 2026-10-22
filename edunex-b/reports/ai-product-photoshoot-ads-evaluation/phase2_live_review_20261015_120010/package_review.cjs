'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const backend=process.cwd();
const dir=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'execution_manifest.json')));
const result=JSON.parse(fs.readFileSync(path.join(dir,'fresh_live_results.json')));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const required=['fresh_live_results.json','fresh_live_summary.md','fresh_failure_analysis.md','fresh_regression_results.md','held_out_test_results.json','evaluation_readiness.md','README.md'];
const evidence=['original_test_cases.json','held_out_test_cases.json','held_out_definitions_frozen.json','application_raw_results.json',
 'original_end_to_end_grades.json','held_out_end_to_end_grades.json','original_live_model_grades.json','held_out_live_model_grades.json',
 'corrected_historical_baseline.json','execution_manifest.json','preflight_assets.json','evaluation_policy_frozen.json',
 'connectivity_probe.json','controlled_fallback_results_authorized.json','controlled_fallback_results.json','sandbox_http_diagnostic.json',
 'node_test_output.log','evaluator_test_output.log','node_execution.json','evaluator_execution.json','preservation_verification.json',
 'independent_template_audit.json','independent_template_audit.py','v2_evaluator_snapshot.py','evaluation_runner.cjs','fallback_drill_runner.cjs',
 'grade_and_run_regressions.py','report_generation_and_review.py','package_review.cjs'];
for(const file of [...required,...evidence])if(!fs.statSync(path.join(dir,file)).isFile())throw new Error('Missing review evidence: '+file);
const secrets=require(path.join(backend,'node_modules/dotenv')).parse(fs.readFileSync(path.join(backend,'.env')));
const values=['FAL_KEY','FAL_API_KEY'].map(k=>process.env[k]||secrets[k]).filter(x=>x&&x.length>=8);
const findings=[];
for(const file of [...required,...evidence]){
 const bytes=fs.readFileSync(path.join(dir,file));
 if(values.some(secret=>bytes.includes(Buffer.from(secret))))findings.push({file,reason:'configured credential value found'});
 if(/(?:^|\/)\.env(?:\.|$)|\.(?:pem|p12|key)$/.test(file))findings.push({file,reason:'prohibited credential/environment file type'});
}
const turns=result.results.flatMap(r=>r.turns||[r]);
let requestCount=0;
for(const turn of turns)for(const p of turn.providerRequests){
 requestCount++;
 if(p.request.headers||p.request.Authorization)findings.push({reason:'Stored authorization header'});
 for(const message of p.request.messages)if(message.role==='system'&&/Safe logged-in learner context:|Skillomate platform reference material:|Current Skillomate web payment plan:/.test(message.content))findings.push({reason:'Unrelated context entered provider request'});
}
const sourceChanges=Object.entries(manifest.sourceHashes).filter(([p,h])=>hash(fs.readFileSync(path.join(backend,p)))!==h).map(([p])=>p);
const historicalChanges=Object.entries(manifest.historicalHashes).filter(([p,h])=>hash(fs.readFileSync(path.join(backend,p)))!==h).map(([p])=>p);
if(findings.length||sourceChanges.length||historicalChanges.length)throw new Error(JSON.stringify({findings,sourceChanges,historicalChanges}));
if(result.results.length!==70||turns.length!==83||requestCount!==22||result.acceptance_metrics.critical_failure_count!==3)throw new Error('Evidence counts differ from reports');
for(const group of ['original','held_out']){
 const cases=result.results.filter(r=>r.set===group);const graded=result.summaries[group].end_to_end;
 if(cases.length!==graded.total||cases.filter(r=>r.status==='PASSED').length!==graded.passed)throw new Error('Case grade counts differ');
}
const files=[...required.map(name=>({source:name,archive:name})),...evidence.map(name=>({source:name,archive:'evidence/'+name}))];
const integrity={verifiedAt:new Date().toISOString(),credentialValueScan:'passed; configured fal credential values absent from selected files',outboundAuthorizationScopeScan:'passed',environmentAndCredentialFilesExcluded:true,
 applicationSourceChanges:sourceChanges,historicalChanges,score:{originalPassed:36,heldOutPassed:9,totalPassed:45,totalCases:70,accuracyPct:64.3,criticalFailures:3},
 files:files.map(f=>({...f,sha256:hash(fs.readFileSync(path.join(dir,f.source))),bytes:fs.statSync(path.join(dir,f.source)).size}))};
fs.writeFileSync(path.join(dir,'artifact_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
files.push({source:'artifact_integrity.json',archive:'artifact_integrity.json'});
const zipPath=path.resolve(backend,'../Skillomate_Chatbot_Phase2_Live_Review.zip');
const packageInput={dir,zipPath,files};
fs.writeFileSync(path.join(dir,'package_file_map.json'),JSON.stringify(packageInput,null,2)+'\n',{flag:'wx'});
const python=String.raw`import hashlib,json,pathlib,sys,zipfile
spec=json.loads(pathlib.Path(sys.argv[1]).read_text()); root=pathlib.Path(spec['dir']); target=pathlib.Path(spec['zipPath'])
with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for row in spec['files']:z.write(root/row['source'],row['archive'])
with zipfile.ZipFile(target,'r') as z:
 assert z.testzip() is None
 names=z.namelist();assert len(names)==len(set(names))
 for row in spec['files']:assert z.read(row['archive'])==(root/row['source']).read_bytes()
summary={'absolute_zip_path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'included_files':names,'crc_and_content_verification':'passed'}
with (root/'package_verification.json').open('x') as f:json.dump(summary,f,indent=2)
print(json.dumps(summary,indent=2))`;
const output=execFileSync('python3',['-B','-c',python,path.join(dir,'package_file_map.json')],{cwd:backend,encoding:'utf8'});
console.log(output);
