'use strict';
// Local evidence packaging only. No tests, provider calls, or application writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const backend = process.cwd();
const run = __dirname;
const stage = path.join(run, 'review_package');
fs.mkdirSync(stage);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const entries = [];
function copy(source, member) {
  const data = fs.readFileSync(source);
  const destination = path.join(stage, member);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, data, {flag: 'wx'});
  entries.push({archive: member, bytes: data.length, sha256: sha(data)});
}
for (const name of ['phase4_live_results.json','phase4_live_summary.md','phase4_failure_analysis.md','phase4_regression_results.md','phase4_manual_review_samples.md','evaluation_configuration.json','README.md']) copy(path.join(run,name),name);
for (const name of ['application_raw_results.json','connectivity_probe.json','preflight_local.json','all_test_cases_frozen.json','original_test_cases.json','held_out_definitions_frozen.json','held_out_test_cases.json','unseen_definitions_frozen.json','course_asset_manifest.json','v3_integrated_grades.json','v3_model_only_grades.json','independent_template_audit_complete.json','independent_exact_instruction_audit.json','controlled_fallback_results.json','node_verified_output.xml','node_verified_stderr.log','node_verified_execution.json','python_verified_output.log','python_verified_stderr.log','python_verified_execution.json','historical_hashes_before.json','evaluation_runner.cjs','fallback_drill_runner.cjs','run_verified_validation.py','build_review_reports.py','package_review.cjs']) copy(path.join(run,name),'evidence/'+name);
for (const [source,member] of [
  ['scripts/eval/grade_product_photoshoot_ads_results_v3.py','reference/grade_product_photoshoot_ads_results_v3.py'],
  ['knowledge/ai-product-photoshoot-ads/training.txt','reference/training.txt'],
  ['reports/ai-product-photoshoot-ads-evaluation/phase2_live_review_20261015_120010/evaluation_policy_frozen.json','reference/phase2_critical_gate_policy.json'],
  ['reports/ai-product-photoshoot-ads-evaluation/phase2_live_review_20261015_120010/fresh_live_summary.md','reference/phase2_live_v2_summary.md'],
  ['reports/ai-product-photoshoot-ads-evaluation/phase3_fixes_20261015_121429/phase2_saved_response_regrade_v3.json','reference/phase2_saved_response_regrade_v3.json'],
  ['tests/helpers/deny-network.cjs','reference/deny-network.cjs'],
]) copy(path.join(backend,source),member);

// Privately compare configured secret values against every packaged byte. Never
// log values, copy environment files, or store authentication request headers.
const env = {...require('dotenv').parse(fs.readFileSync(path.join(backend,'.env'))),...process.env};
const secrets = [...new Set(Object.entries(env).filter(([name,value])=>/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(name)&&typeof value==='string'&&value.length>=12).map(([,value])=>value))];
const unsafe = [];
for (const entry of entries) {
  const data = fs.readFileSync(path.join(stage,entry.archive));
  if (secrets.some(value=>data.includes(Buffer.from(value)))) unsafe.push(entry.archive);
  if (/(?:^|\/)(?:\.env(?:\..*)?|credentials|\.aws)(?:\/|$)/i.test(entry.archive)) unsafe.push(entry.archive);
}
if (unsafe.length) throw new Error('Package secret scan rejected files: '+[...new Set(unsafe)].join(', '));
const config = JSON.parse(fs.readFileSync(path.join(run,'evaluation_configuration.json')));
const integrity = {createdAt:new Date().toISOString(),configuredSecretValueScan:'passed; no configured secret value found',credentialOrEnvironmentFilesIncluded:false,
  historicalFilesVerifiedUnchanged:config.historicalFilesVerifiedUnchanged,applicationSourceFilesUnchanged:true,
  applicationSourceHashes:config.sourceHashes,files:entries};
fs.writeFileSync(path.join(stage,'package_integrity.json'),JSON.stringify(integrity,null,2)+'\n',{flag:'wx'});
const preferred = path.resolve(backend,'../Skillomate_Chatbot_Phase4_Live_Review.zip');
const zip = fs.existsSync(preferred) ? path.join(run,'Skillomate_Chatbot_Phase4_Live_Review.zip') : preferred;
const python = `from pathlib import Path
import zipfile,hashlib,json,sys
stage=Path(sys.argv[1]); output=Path(sys.argv[2])
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file(): z.write(p,str(p.relative_to(stage)))
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 integrity=json.loads(z.read('package_integrity.json'))
 for f in integrity['files']:
  b=z.read(f['archive']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
 print(json.dumps({'absoluteZipPath':str(output.resolve()),'files':len(z.namelist()),'zipSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'zipBytes':output.stat().st_size,'crcAndMemberHashes':'passed'}))
`;
const result = execFileSync('python3',['-B','-c',python,stage,zip],{encoding:'utf8'});
fs.writeFileSync(path.join(run,'package_verification.json'),result,{flag:'wx'});
process.stdout.write(result);
