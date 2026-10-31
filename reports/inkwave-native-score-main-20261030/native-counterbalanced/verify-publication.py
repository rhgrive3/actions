#!/usr/bin/env python3
"""Verify published bytes and rerun saved analyzers without browser or live sites."""
import argparse
import datetime
import gzip
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--node-modules', type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent
manifest = json.loads((root / 'artifact-manifest.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for name, expected in manifest['files'].items():
    data = (root / name).read_bytes()
    assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], name
raw_receipts = {}
for name, expected in manifest['raw'].items():
    compressed = (root / expected['path']).read_bytes()
    raw = gzip.decompress(compressed)
    assert len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], name
    assert sha(compressed) == expected['compressedSha256'], name
    raw_receipts[name] = expected
freeze = json.loads((root / 'e/cbplan0/final-readback.json').read_text())
assert freeze['status'] == 'final-readback-passed-and-frozen'
for expected in freeze['files']:
    file = root / 'e' / expected['file']
    data = gzip.decompress(file.with_suffix('.json.gz').read_bytes()) if file.name == 'result.json' else file.read_bytes()
    assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], expected['file']
assert sha((root / 'e/cbplan0/plan.json').read_bytes()) == freeze['planSha256']

def timeless(value):
    if isinstance(value, dict):
        return {key: timeless(item) for key, item in value.items()
                if key not in ('analyzedAt', 'verifiedAt')}
    if isinstance(value, list):
        return list(map(timeless, value))
    return value

def replace_once(text, before, after):
    assert text.count(before) == 1, before
    return text.replace(before, after, 1)

# Preserve the original scripts in the publication. Only temporary copies get
# filesystem-location substitutions. The original plan bytes/hash stay intact.
adapters = {
    'verify.mjs': [
        ('const dir=run.evidence, raw=',
         "const dir=path.resolve(planDir,'..',path.basename(run.evidence)), raw="),
        ("path.join(plan.cwd,'scripts',file)", "path.resolve(planDir,'../../scripts',file)"),
        ("path.join(source.site,'inkwave-build.json')",
         "path.resolve(planDir,'../../builds',side,'inkwave-build.json')"),
        ('fs.statSync(path.join(source.site,file)).size',
         "JSON.parse(fs.readFileSync(path.resolve(planDir,'../../builds',side,'served-file-sizes.json')))[file]")],
    'analyze.py': [
        ("D=pathlib.Path(run['evidence']);", "D=P.parent/pathlib.Path(run['evidence']).name;")],
    'aggregate.py': [
        ("d=pathlib.Path(run['evidence'])", "d=P.parent/pathlib.Path(run['evidence']).name")]
}
checks = []
with tempfile.TemporaryDirectory(prefix='inkwave-counterbalanced-readback-') as location:
    temp = pathlib.Path(location)
    shutil.copytree(root / 'e', temp / 'e')
    shutil.copytree(root / 'scripts', temp / 'scripts')
    shutil.copytree(root / 'builds', temp / 'builds')
    (temp / 'node_modules').symlink_to(args.node_modules.resolve(), target_is_directory=True)
    for side in ('a', 'b'):
        build = temp / 'builds' / side
        (build / 'inkwave-build.json').write_bytes(gzip.decompress((build / 'inkwave-build.json.gz').read_bytes()))
    for name, expected in raw_receipts.items():
        (temp / expected['path']).with_suffix('').write_bytes(gzip.decompress((temp / expected['path']).read_bytes()))
    plan_dir = temp / 'e/cbplan0'
    plan = json.loads((plan_dir / 'plan.json').read_text())
    for name, replacements in adapters.items():
        script = plan_dir / name
        text = script.read_text()
        for before, after in replacements:
            text = replace_once(text, before, after)
        script.write_text(text)
    for run in plan['runs']:
        name = pathlib.Path(run['evidence']).name
        for command in (['node', str(plan_dir / 'verify.mjs'), run['name']],
                        ['python3', str(plan_dir / 'analyze.py'), run['name']]):
            completed = subprocess.run(command, capture_output=True, text=True)
            assert completed.returncode == 0, completed.stdout + completed.stderr
        original = root / 'e' / name
        copied = temp / 'e' / name
        assert timeless(json.loads((original / 'analysis.json').read_text())) == timeless(json.loads((copied / 'analysis.json').read_text())), name
        assert (original / 'report.md').read_bytes() == (copied / 'report.md').read_bytes(), name
        checks.append({'run': run['name'], 'directory': name,
                       'analysisEqualExceptTimestamps': True, 'reportBytesEqual': True})
    completed = subprocess.run(['python3', str(plan_dir / 'aggregate.py')], capture_output=True, text=True)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert timeless(json.loads((root / 'e/cbplan0/analysis.json').read_text())) == timeless(json.loads((plan_dir / 'analysis.json').read_text()))
    assert (root / 'e/cbplan0/report.md').read_bytes() == (plan_dir / 'report.md').read_bytes()
    checks.append({'run': 'aggregate', 'directory': 'cbplan0',
                   'analysisEqualExceptTimestamps': True, 'reportBytesEqual': True})

receipt = dict(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    status='passed-published-counterbalanced-readback', browserLaunched=False,
    liveSitesRead=False, manifestFilesVerified=len(manifest['files']),
    originalFrozenFilesVerified=len(freeze['files']), planSha256=freeze['planSha256'],
    raw=raw_receipts, checks=checks, temporaryPathAdapters=adapters,
    buildSizeInterpretation='Saved inventories snapshot served-file sizes from the admitted sites at publication. The adapter checks saved HTTP receipts against those sizes and saved build manifest hashes; private payloads are not bundled or rebuilt.')
(root / 'publication-readback.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ('status', 'browserLaunched',
      'liveSitesRead', 'manifestFilesVerified', 'checks')}, indent=2))
