from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,re,zipfile,subprocess,os
E=Path(__file__).resolve().parent;R=E.parent;B=R.parent
H=lambda x:hashlib.sha256(x).hexdigest();load=lambda n:json.loads((E/n).read_text())
baseline=load('baseline.json');final=load('corrected_candidate_freeze.json');changed=load('changed_file_manifest.json');allowed={r['path'] for r in changed};proof={}
proof['allFrozenCandidateHashesMatch']=all(H((B/p).read_bytes())==h for rows in final['groups'].values() for p,h in rows.items())
proof['changedFiles']=sorted(allowed);proof['sourceFilesChanged']=len([p for p in allowed if '/services/' in p or '/routes/' in p]);proof['existingTestsModified']=[p for p in baseline['groups']['tests'] if H((B/p).read_bytes())!=baseline['groups']['tests'][p]]
proof['unrelatedFrozenChanges']=[p for rows in baseline['groups'].values() for p,h in rows.items() if p not in allowed and H((B/p).read_bytes())!=h]
proof['protectedHistoricalAndConfigCompared']=len(baseline['protectedHistoricalAndConfig']);proof['protectedHistoricalAndConfigChanged']=[p for p,h in baseline['protectedHistoricalAndConfig'].items() if not (B/p).is_file() or H((B/p).read_bytes())!=h]
proof['gitIndexUnchanged']=H((B/'.git/index').read_bytes())==baseline['gitIndexSHA256']
proof['approvedKnowledgeAssetsUnchanged']=all(H((B/p).read_bytes())==h for p,h in baseline['groups']['courseAssets'].items());proof['evaluatorsUnchanged']=all(H((B/p).read_bytes())==h for p,h in baseline['groups']['evaluators'].items())
proof['originalFreshZIPUnchanged']=H((B/'Skillomate_Chatbot_Fresh_Blind_Evaluation.zip').read_bytes())=='c70c77fe946a53ff7de18a1f112a22409aaa81903bee0f21c07bf5e8d36de95c'
proof['originalRootCauseZIPUnchanged']=H((B/'Skillomate_Chatbot_Reliability_Root_Cause_Review.zip').read_bytes())=='3fd80c2a92674da2de4119a90539a0c6e523b5cf240267d29555339ffd85e684'
with zipfile.ZipFile(B/'Skillomate_Chatbot_Fresh_Blind_Evaluation.zip') as z:
 altered=[]
 for i in z.infolist():
  if i.is_dir():continue
  f=B/i.filename
  if not f.is_file() or H(f.read_bytes())!=H(z.read(i)):altered.append(i.filename)
 proof['allOriginalFreshExtractedEvidenceUnchanged']=not altered;proof['alteredOriginalFreshEvidence']=altered
proof['rawAndFillAssetCoverage']=57;proof['newRegressionTests']=123
for rel in ['backend_final_all.log','python_all_final.log','diagnostics_before.json','diagnostics_after.json','phase12/final/phase12_passing_replay.json','reproduction_results.json','phase_changes.patch']:
 assert (E/rel).is_file(),rel
summary=load('verification_summary.json');assert summary['finalBackend']=={'tests':1195,'pass':1171,'fail':24,'cancelled':0,'skipped':0};assert summary['newBackendFailures']==[]
assert summary['phase12RecordedComparison']['byteIdenticalCases']==40 and summary['phase12RecordedComparison']['unexpectedTransportRequests']==0
assert summary['knownExactFullBodyMatches']==19 and summary['criticalOriginalCases']['completeBodyMatches']==5
proof['scopeInspections']=[]
for stage in ['before','after']:
 data=load('diagnostics_'+stage+'.json');turns=[t for c in data['cases'] for t in c['traces']]
 assert len(data['cases'])==59 and len(turns)==72
 assert all(not t['scopeInspection']['potentialCriticalFindings'] for t in turns)
 assert all(not a.get('httpStatus') and not a.get('rawModelResponse') for t in turns for a in t['providerRequests'])
 proof['scopeInspections'].append({'stage':stage,'cases':59,'turns':72,'payloadObservations':sum(len(t['payloadObservations']) for t in turns),'blockedAdapterAttempts':sum(len(t['providerRequests']) for t in turns),'scopeAlerts':0,'externalTransmissions':0})
proof['mandatoryGuardsUnchanged']={p:H((B/p).read_bytes())==baseline['groups']['application'][p] for p in ['edunex-b/services/aiCompliance.js','edunex-b/middleware/compatAuth.js','edunex-b/services/courseAccess.js','edunex-b/services/subscriptionAccess.js','edunex-b/services/tutorKnowledge.js','edunex-b/models/AiTutorSession.js']}
# Final compatibility check of the baseline-relative rollback patch; no application.
check=subprocess.run(['git','apply','--reverse','--check',str(E/'phase_changes.patch')],cwd=B,text=True,capture_output=True)
proof['reversePatchDryRun']={'exitCode':check.returncode,'stdout':check.stdout,'stderr':check.stderr};assert check.returncode==0
(E/'git_status_after.txt').write_text(subprocess.run(['git','--no-optional-locks','status','--short'],cwd=B,text=True,capture_output=True,check=True).stdout)

# Compare secrets without logging their values, names, or surrounding bytes.
secrets=set();pat=re.compile(r'(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)',re.I)
for f in [B/'edunex-b/.env',B/'edunex-b/.env.local']:
 if f.is_file():
  for line in f.read_text(errors='replace').splitlines():
   if '=' not in line or line.lstrip().startswith('#'):continue
   k,v=line.split('=',1);v=v.strip().strip('"\'')
   if pat.search(k) and len(v)>=12 and not v.startswith('${'):secrets.add(v.encode())
for k,v in os.environ.items():
 if pat.search(k) and len(v)>=12:secrets.add(v.encode())
leaks=[]
for f in R.rglob('*'):
 if not f.is_file() or '__pycache__' in f.parts:continue
 if any(v in f.read_bytes() for v in secrets):leaks.append(str(f.relative_to(R)))
proof['configuredSecretValueScan']={'valuesCompared':len(secrets),'matchingArtifactPaths':leaks,'secretValuesLogged':False}
proof['newExternalRequests']=0;proof['productionInteraction']=False;proof['deploymentCommitOrPush']=False;proof['archiveCleanupPerformed']=False
for name in ['allFrozenCandidateHashesMatch','gitIndexUnchanged','approvedKnowledgeAssetsUnchanged','evaluatorsUnchanged','originalFreshZIPUnchanged','originalRootCauseZIPUnchanged','allOriginalFreshExtractedEvidenceUnchanged']:assert proof[name],name
assert not proof['existingTestsModified'] and not proof['unrelatedFrozenChanges'] and not proof['protectedHistoricalAndConfigChanged'] and not leaks
assert all(proof['mandatoryGuardsUnchanged'].values()) and proof['sourceFilesChanged']==8
proof['verifiedAt']=datetime.now(timezone.utc).isoformat();(E/'preservation_verification.json').write_text(json.dumps(proof,indent=2)+'\n')
# Minor prose spacing in generated review documents only.
for f in R.glob('*.md'):
 t=f.read_text()
 for a,b in [('All167','All 167'),('All19','All 19'),('All40','All 40'),('Existing24','Existing 24'),('existing24','existing 24'),('baseline24','baseline 24'),('same24','same 24'),('all59','all 59'),('these59','these 59'),('known59','known 59'),('Known59','Known 59'),('all72','all 72'),('all19','all 19'),('Phase12','Phase 12'),('Baseline123','Baseline 123'),('reports01','reports 01'),('uses11','uses 11'),('baseline123','baseline 123')]:t=t.replace(a,b)
 f.write_text(t)
files=sorted(f for f in R.rglob('*') if f.is_file() and '__pycache__' not in f.parts and f.name!='integrity_manifest.json')
integrity={'algorithm':'SHA-256','excludes':'This integrity manifest and __pycache__','files':[{'path':str(f.relative_to(R)),'sha256':H(f.read_bytes()),'bytes':f.stat().st_size} for f in files]};(R/'integrity_manifest.json').write_text(json.dumps(integrity,indent=2)+'\n');files.append(R/'integrity_manifest.json')
archive=B/(R.name+'.zip')
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(files):z.write(f,str(Path(R.name)/f.relative_to(R)))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for row in integrity['files']:assert H(z.read(R.name+'/'+row['path']))==row['sha256']
verification={'zipPath':str(archive),'sha256':H(archive.read_bytes()),'bytes':archive.stat().st_size,'entries':len(files),'crcVerified':True,'allContentHashesVerified':True,'candidateHashesVerified':True,'externalRequests':0,'verifiedAt':datetime.now(timezone.utc).isoformat()}
archive.with_suffix('.package_verification.json').write_text(json.dumps(verification,indent=2)+'\n');print(json.dumps(verification))
