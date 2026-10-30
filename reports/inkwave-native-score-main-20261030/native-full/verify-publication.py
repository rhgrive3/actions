#!/usr/bin/env python3
"""Read saved evidence and recompute its analyses without launching a browser."""
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
parser.add_argument('--node-modules', type=pathlib.Path, required=True,
                    help='Existing node_modules with the recorded Playwright dependency')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent
evidence = root / 'e/cf0'
manifest = json.loads((root / 'artifact-manifest.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for name, expected in manifest['files'].items():
    data = (root / name).read_bytes()
    assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], name
compressed = (root / manifest['raw']['path']).read_bytes()
raw = gzip.decompress(compressed)
assert len(raw) == manifest['raw']['bytes'] and sha(raw) == manifest['raw']['sha256']
assert sha(compressed) == manifest['raw']['compressedSha256']
result = json.loads(raw)
analysis = json.loads((evidence / 'analysis.json').read_text())
plan = json.loads((evidence / 'full-plan.json').read_text())
assert json.loads((root / 'environment.json').read_text()) == result['environment']
for name, expected in result['harness'].items():
    assert sha((evidence / 'harness' / name).read_bytes()) == expected
    assert sha((root / 'scripts' / name).read_bytes()) == expected
prior_smoke = gzip.decompress((root.parent / 'native-smoke/e/csm0/result.json.gz').read_bytes())
assert sha(prior_smoke) == plan['priorSmoke']['resultSha256']

# The original Node analyzer verifies all matched pairs, every observed thread,
# source/LFS/served receipts, quartet summaries, and the prior smoke binding.
# It imports the saved harness, whose main() guard prevents browser startup.
with tempfile.TemporaryDirectory(prefix='inkwave-cf0-readback-') as location:
    temp = pathlib.Path(location)
    copied = temp / 'e/cf0'
    shutil.copytree(evidence, copied)
    shutil.copytree(root / 'scripts', temp / 'scripts')
    (temp / 'node_modules').symlink_to(args.node_modules.resolve(), target_is_directory=True)
    (copied / 'result.json').write_bytes(raw)
    (temp / 'e/csm0').mkdir()
    (temp / 'e/csm0/result.json').write_bytes(prior_smoke)
    node = subprocess.run(['node', str(copied / 'analyze.mjs')],
                          capture_output=True, text=True, check=True)
    independent = subprocess.run(['python3', str(copied / 'analyze-statistics.py')],
                                 capture_output=True, text=True, check=True)
    readback = json.loads((copied / 'analysis.json').read_text())
    def timeless(value):
        if isinstance(value, dict):
            return {key: timeless(item) for key, item in value.items() if key != 'analyzedAt'}
        if isinstance(value, list):
            return list(map(timeless, value))
        return value
    assert timeless(readback) == timeless(analysis), 'analysis differs beyond analyzedAt'
    assert (copied / 'report.md').read_bytes() == (evidence / 'report.md').read_bytes()

receipt = dict(
    checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    status='passed-saved-publication-readback',
    browserLaunched=False,
    manifestFilesVerified=len(manifest['files']),
    rawSha256=sha(raw), rawBytes=len(raw), compressedSha256=sha(compressed),
    harnessFilesVerified=len(result['harness']), priorSmokeSha256=sha(prior_smoke),
    counts=analysis['counts'],
    analysisEqualExceptAnalyzedAt=True, reportBytesEqual=True,
    environmentEqual=True,
    validation=analysis['independentStatistics']['validation'],
    timing=analysis['independentStatistics']['phases']['measurements']['ratioStatistics'],
    nodeAnalyzerExitCode=node.returncode, independentAnalyzerExitCode=independent.returncode)
(root / 'publication-readback.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ('status', 'rawSha256', 'counts',
      'analysisEqualExceptAnalyzedAt', 'reportBytesEqual', 'browserLaunched')}, indent=2))
