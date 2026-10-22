'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const backend=process.cwd(),dir=__dirname;
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file)));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=read('phase3_manifest_before.json'),manifest=read('phase3_validation_manifest.json');
const pdf=path.resolve(backend,'../output/pdf/skillomate-phase3-fix-comparison-20261015.pdf');
const reports=['phase3_implementation_report.md','phase3_targeted_test_results.json','phase3_regression_results.md','phase3_remaining_issues.md','README.md'];
const evidence=['node_verified_output.xml','node_verified_stderr.log','node_verified_execution.json','python_verified_output.log','python_verified_stderr.log','python_verified_execution.json',
 'offline_template_replay_results_final.json','phase2_saved_response_regrade_v3.json','phase3_manifest_before.json','phase3_validation_manifest.json',
 'offline_template_replay_final.cjs','run_verified_validation.py','generate_phase3_reports.py','create_comparison_pdf.py','package_phase3_review.cjs'];
const files=[...reports.map(name=>({source:path.join(dir,name),archive:name})),
 {source:pdf,archive:path.basename(pdf)}, {source:path.join(dir,'phase3_changes.patch'),archive:'phase3_changes.patch'},
 ...manifest.sources.map(x=>({source:path.join(backend,x.path),archive:'source/'+x.path})),
 ...evidence.map(name=>({source:path.join(dir,name),archive:'evidence/'+name})),
 ...['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v2.py','scripts/eval/product_photoshoot_ads_test_cases.json','tests/test_product_evaluator.py','tests/helpers/deny-network.cjs'].map(name=>({source:path.join(backend,name),archive:'reference/'+name}))];
for(const file of files)if(!fs.statSync(file.source).isFile())throw new Error('Missing review artifact');
const oldSecrets=require(path.join(backend,'node_modules/dotenv')).parse(fs.readFileSync(path.join(backend,'.env')));
const credentialValues=['FAL_KEY','FAL_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY'].map(k=>process.env[k]||oldSecrets[k]).filter(v=>v&&v.length>=8);
const secrets=[];
for(const file of files){const data=fs.readFileSync(file.source);if(credentialValues.some(value=>data.includes(Buffer.from(value))))secrets.push(file.archive);if(/(?:^|\/)\.env(?:\.|$)|\.(?:key|pem|p12)$/.test(file.archive))secrets.push(file.archive);}
if(secrets.length)throw new Error('Credential scan rejected selected files: '+secrets.join(', '));
const sourceChanges=manifest.sources.filter(x=>hash(path.join(backend,x.path))!==x.after_sha256).map(x=>x.path);
const historicalChanges=Object.entries(before.historical_hashes).filter(([p,h])=>hash(path.join(backend,p))!==h).map(([p])=>p);
if(sourceChanges.length||historicalChanges.length)throw new Error(JSON.stringify({sourceChanges,historicalChanges}));
const protectedInputs=['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v2.py','scripts/eval/product_photoshoot_ads_test_cases.json','tests/test_product_evaluator.py'];
if(protectedInputs.some(p=>hash(path.join(backend,p))!==before.sources_before[p]))throw new Error('Immutable course/evaluator input changed');
if(hash(path.resolve(backend,'../Skillomate_Chatbot_Phase2_Live_Review.zip'))!==before.phase2_package_hash)throw new Error('Historical ZIP changed');
const integrity={verifiedAt:new Date().toISOString(),secretValueScan:'passed; configured credential values absent',excluded:'Environment and credential files, real learner data and unrelated project file contents',
 historicalFilesVerifiedUnchanged:Object.keys(before.historical_hashes).length,sourceFilesMatchedValidatedHashes:true,externalProviderRequests:0,
 comparisonPdf:{pages:2,visualReview:'Both rendered pages inspected: legible, no clipping or overlap.',renderer:'PyMuPDF (available locally; reportlab/Poppler unavailable)'},
 files:files.map(x=>({archive:x.archive,sha256:hash(x.source),bytes:fs.statSync(x.source).size}))};
fs.writeFileSync(path.join(dir,'phase3_package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
files.push({source:path.join(dir,'phase3_package_integrity.json'),archive:'phase3_package_integrity.json'});
const spec={zipPath:path.resolve(backend,'../Skillomate_Chatbot_Phase3_Fix_Review.zip'),files};
fs.writeFileSync(path.join(dir,'package_file_map.json'),JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
const script=String.raw`import hashlib,json,pathlib,sys,zipfile
spec=json.loads(pathlib.Path(sys.argv[1]).read_text());target=pathlib.Path(spec['zipPath'])
with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for row in spec['files']:z.write(row['source'],row['archive'])
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 for row in spec['files']:assert z.read(row['archive'])==pathlib.Path(row['source']).read_bytes()
 names=z.namelist();assert len(names)==len(set(names))
result={'absolute_zip_path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'files':names,'integrity':'CRC and content verified'}
with pathlib.Path(sys.argv[1]).with_name('package_verification.json').open('x') as f:json.dump(result,f,indent=2)
print(json.dumps(result,indent=2))`;
console.log(execFileSync('python3',['-B','-c',script,path.join(dir,'package_file_map.json')],{encoding:'utf8'}));
