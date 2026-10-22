"""Verify the read-only review and package it without editing the candidate."""
import collections, csv, hashlib, io, json, os, re, subprocess, zipfile
from datetime import datetime, timezone
from pathlib import Path

E = Path(__file__).resolve().parent
R = E.parent
B = R.parent
H = lambda data: hashlib.sha256(data).hexdigest()
load = lambda name: json.loads((E/name).read_text())
baseline = load('intake_and_baseline.json')
manifest = load('original_candidate_manifest.json')
checks = {}
changes = []
for group, paths in baseline['currentCandidateGroups'].items():
    for rel, expected in paths.items():
        f=B/rel
        if not f.is_file() or H(f.read_bytes()) != expected:
            changes.append({'group':group,'path':rel})
checks['candidateGroups'] = {group:len(paths) for group,paths in baseline['currentCandidateGroups'].items()}
checks['candidateChanges'] = changes
protected_changes=[]
for rel, expected in manifest['protectedHistoricalAndConfig'].items():
    f=B/rel
    if not f.is_file() or H(f.read_bytes()) != expected: protected_changes.append(rel)
checks['protectedHistoricalAndConfigCompared']=len(manifest['protectedHistoricalAndConfig'])
checks['protectedHistoricalAndConfigChanges']=protected_changes
index_path = B/'.git/index'
checks['gitIndexUnchanged'] = H(index_path.read_bytes()) == manifest['indexSha256']
original_zip=B/'Skillomate_Chatbot_Fresh_Blind_Evaluation.zip'
checks['originalZIPUnchanged']=H(original_zip.read_bytes()) == baseline['archiveSHA256']
checks['packagedOriginalZIPIdentical']=H((E/'input'/original_zip.name).read_bytes()) == baseline['archiveSHA256']
checks['snapshotCount']=len(load('source_snapshots.json'))
checks['snapshotsMatchSource']=all(H((B/x['path']).read_bytes())==x['sha256']==H((E/'source'/x['path']).read_bytes()) for x in load('source_snapshots.json'))
allcases=load('all_case_audit_inputs.json')
failed=load('failed_case_classifications.json')
original_failed={c['id'] for c in allcases if c['originalGrade']['status']=='FAIL'}
checks['all67FailedIDsCoveredExactly']=len(failed)==67 and len({c['id'] for c in failed})==67 and {c['id'] for c in failed}==original_failed
checks['originalCaseCounts']=dict(collections.Counter(c['originalGrade']['status'] for c in allcases))
checks['auditClassifications']=dict(collections.Counter(c['auditClassification'] for c in failed))
checks['all120CasesAnd153TurnsRetained']=len(allcases)==120 and sum(len(c['turns']) for c in allcases)==153
bad_refs=[]
for c in failed:
    for ref in c['sourceEvidence']:
        f=R/ref['snapshot']
        if not f.is_file() or not(1<=ref['startLine']<=ref['endLine']<=len(f.read_text().splitlines())):bad_refs.append({'id':c['id'],'ref':ref})
checks['invalidSourceReferences']=bad_refs
checks['allFailedEvidenceComplete']=all(c['supportingEvidence'] and all(t['userRequest'] and t['expected'] and t['actualAnswer'] and t['traceInOriginalArchive'] and t['gradeInOriginalArchive'] for t in c['supportingEvidence']) for c in failed)
checks['csvRows']=len(list(csv.DictReader(io.StringIO((E/'failed_case_classifications.csv').read_text()))))
diag=load('offline_diagnostics.json')
checks['pureHelperComparisons']=diag['pureProductReplyComparisons']
checks['pureHelperExactMatches']=diag['pureProductReplyMatches']
checks['failedTurns']=len(diag['rows'])
checks['failedTurnsWithProviderAttempts']=diag['failedTurnsWithProviderAttempts']
checks['diagnosticErrors']=[{'id':r['id'],'turn':r['turn'],'error':r['error']} for r in diag['rows'] if r['error']]
checks['all19FailedExactAssetsPresent']=sum(c['category']=='exact_template' and all(t['requestedAssetPresentInRetrievedRecords'] for t in c['supportingEvidence']) for c in failed)==19
checks['originalScoreAndCriteriaUnchanged']=not protected_changes and checks['originalZIPUnchanged']
checks['newExternalProviderRequests']=0
checks['newPricingNetworkRequests']=0
checks['fullBackendOrEvaluatorSuitesRerun']=False
checks['applicationSourceModified']=False
checks['deployed']=False
checks['verificationMethod']='File hashes; original trace/audit joins; native guarded pure helper replay; no live provider or server.'

# Compare configured secret values without writing their values or names to evidence.
secrets=set()
key_pattern=re.compile(r'(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)',re.I)
for envpath in [B/'edunex-b/.env',B/'edunex-b/.env.local',B/'.env',B/'.env.local']:
    if envpath.is_file():
        for line in envpath.read_text(errors='replace').splitlines():
            if '=' not in line or line.lstrip().startswith('#'):continue
            key,val=line.split('=',1);val=val.strip().strip('"\'')
            if key_pattern.search(key) and len(val)>=12 and not val.startswith('${'):secrets.add(val.encode())
for key,val in os.environ.items():
    if key_pattern.search(key) and len(val)>=12:secrets.add(val.encode())
leaks=[]
for f in R.rglob('*'):
    if not f.is_file() or '__pycache__' in f.parts:continue
    if f.suffix=='.zip':
        with zipfile.ZipFile(f) as z:
            for member in z.infolist():
                if member.is_dir():continue
                data=z.read(member)
                if any(secret in data for secret in secrets):leaks.append(str(f.relative_to(R))+'!'+member.filename)
    elif any(secret in f.read_bytes() for secret in secrets):leaks.append(str(f.relative_to(R)))
checks['configuredSecretValueScan']={'valuesCompared':len(secrets),'exposedValuesLogged':False,'matchingArtifactPaths':leaks}

assert not changes and not protected_changes
assert checks['gitIndexUnchanged'] and checks['originalZIPUnchanged'] and checks['packagedOriginalZIPIdentical']
assert checks['snapshotsMatchSource'] and checks['all67FailedIDsCoveredExactly'] and checks['all120CasesAnd153TurnsRetained']
assert checks['allFailedEvidenceComplete'] and not bad_refs and checks['csvRows']==67
assert checks['pureHelperComparisons']==checks['pureHelperExactMatches']==63
assert checks['failedTurns']==70 and checks['failedTurnsWithProviderAttempts']==0 and not checks['diagnosticErrors']
assert checks['all19FailedExactAssetsPresent'] and not leaks
assert checks['auditClassifications']=={'CONFIRMED_DETERMINISTIC_DEFECT':59,'GRADING_AMBIGUITY':7,'SECURITY_POLICY_EXPECTATION_CONFLICT':1}
checks['verifiedAt']=datetime.now(timezone.utc).isoformat()
(E/'final_preservation_verification.json').write_text(json.dumps(checks,indent=2)+'\n')
status=subprocess.run(['git','--no-optional-locks','status','--short'],cwd=B,text=True,capture_output=True,check=True)
(E/'git_status_after.txt').write_text(status.stdout)

files=sorted(f for f in R.rglob('*') if f.is_file() and '__pycache__' not in f.parts and f.name!='integrity_manifest.json')
integrity={'algorithm':'SHA-256','excluded':'This integrity_manifest.json; Python __pycache__ files','files':[{'path':str(f.relative_to(R)),'bytes':f.stat().st_size,'sha256':H(f.read_bytes())} for f in files]}
(R/'integrity_manifest.json').write_text(json.dumps(integrity,indent=2)+'\n')
files.append(R/'integrity_manifest.json')
out=B/(R.name+'.zip')
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in sorted(files):z.write(f, str(Path(R.name)/f.relative_to(R)))
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    assert len(z.infolist())==len(files)
    for row in integrity['files']:assert H(z.read(R.name+'/'+row['path']))==row['sha256']
verification={'zipPath':str(out),'sha256':H(out.read_bytes()),'bytes':out.stat().st_size,'fileEntries':len(files),'crcVerified':True,'allContentHashesVerified':True,'candidateUnchanged':True,'externalRequests':0,'generatedAt':datetime.now(timezone.utc).isoformat()}
out.with_suffix('.package_verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps(verification))
