"""Package local evidence after evaluation and verify archive contents."""
import datetime
import hashlib
import json
import zipfile
from pathlib import Path

E = Path(__file__).resolve().parent
R = E.parent
destination = R.parent / 'Skillomate_Chatbot_Fresh_Blind_Evaluation.zip'
sha = lambda data: hashlib.sha256(data).hexdigest()
integrity = json.loads((E / 'final_integrity.json').read_text())
assert integrity['allFrozenFilesUnchanged'] and integrity['gitIndexUnchanged']
assert not integrity['credentialValueScan']['leakedFiles']
assert integrity['runtimeEvidenceConsistency']['allDeliveriesAndGradeIdentitiesMatch']
assert not integrity['runtimeEvidenceConsistency']['sequencingErrors']
assert integrity['freezeTimeline']['freezePrecedesExecution']
assert (E / 'isolated_grader/grades.json').exists()
results = json.loads((E / 'results_summary.json').read_text())
assert sha((E / 'isolated_grader/grades.json').read_bytes()) == results['independentGradesSHA256']
for name in ['execution_stdout.log', 'execution_stderr.log']:
    (E / name).touch(exist_ok=True)
paths = []
for path in sorted(R.rglob('*')):
    if path.is_symlink():
        raise RuntimeError(f'Unexpected symbolic link: {path.relative_to(R)}')
    if path.is_file() and '__pycache__' not in path.parts and path.name != 'integrity_manifest.json':
        paths.append(path)
manifest = {'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'selfExcluded': True,
            'files': {str(p.relative_to(R)): {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in paths}}
manifest_path = R / 'integrity_manifest.json'
manifest_path.write_text(json.dumps(manifest, indent=2))
paths.append(manifest_path)
with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in paths:
        archive.write(path, arcname=str(Path(R.name) / path.relative_to(R)))
with zipfile.ZipFile(destination) as archive:
    bad = archive.testzip()
    assert bad is None, bad
    expected = {str(Path(R.name) / p.relative_to(R)): sha(p.read_bytes()) for p in paths}
    assert set(archive.namelist()) == set(expected)
    assert all(sha(archive.read(name)) == h for name, h in expected.items())
verification = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'archive': str(destination), 'bytes': destination.stat().st_size,
                'sha256': sha(destination.read_bytes()), 'files': len(paths),
                'crcPassed': True, 'allEntryHashesMatch': True}
R.parent.joinpath('Skillomate_Chatbot_Fresh_Blind_Evaluation.package_verification.json').write_text(json.dumps(verification, indent=2))
print(json.dumps(verification, indent=2))
