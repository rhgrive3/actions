#!/usr/bin/env python3
"""Prepare a private ENV-relocated copy; never execute tests or edit originals."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

BASE = Path(__file__).resolve().parent
ALLOWED = {
    'current-natural-strict-online.mjs',
    'bluefin-source-aim-natural-strict-online.mjs',
    'bluefin-source-aim-natural-diagnostic.mjs',
    'matched-catalogue-source-sweep.mjs',
    'candidate-catalogue-source-peer.mjs',
}

def required(name):
    value = os.environ.get(name)
    if not value:
        raise SystemExit('Required ENV selector: ' + name)
    return Path(value).resolve()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

if len(sys.argv) != 2 or sys.argv[1] not in ALLOWED:
    raise SystemExit('Usage: prepare-run.py <one allowed snapshot .mjs basename>')
name = sys.argv[1]
expected = {}
for line in (BASE / 'SHA256SUMS').read_text().splitlines():
    checksum, relative = line.split('  ', 1)
    expected[relative] = checksum
for relative, checksum in expected.items():
    if digest(BASE / relative) != checksum:
        raise SystemExit('Saved snapshot checksum mismatch: ' + relative)

source = required('PEER_SOURCE_ROOT')
run = required('PEER_RUN_DIR')
if not source.is_dir() or not any(part in ('.ci-scratch', '.browser-evidence') for part in run.parts):
    raise SystemExit('Use an existing source worktree and a fresh private .ci-scratch/.browser-evidence run directory')
run.mkdir(parents=True, exist_ok=False)
for snapshot in (BASE / 'snapshots').iterdir():
    shutil.copyfile(snapshot, run / snapshot.name)

raw = (BASE / 'snapshots' / name).read_text()
effective = raw
environment = {'NATIVE_ONLINE_SOURCE_ROOT': str(source)}
inputs = []
if name in ('matched-catalogue-source-sweep.mjs', 'candidate-catalogue-source-peer.mjs'):
    assets = required('PEER_ASSET_ROOT')
    private_inputs = required('PEER_INPUT_ROOT')
    environment['INKWAVE_NATIVE_STAGE_ASSETS'] = str(assets)
    effective = effective.replace('/workspace/stage-worktrees/bluefin/.codex-stage-sources/generated', str(assets))
    effective = effective.replace('/workspace/stage-worktrees/bluefin', str(source))
    effective = effective.replace('/workspace/stage-worktrees/humpback/.ci-scratch/bluefin-stage-peer', str(run))
    effective = effective.replace("sourceRoot+'/.codex-stage-sources/generated/bluefin/'+name+'.bin'", "process.env.INKWAVE_NATIVE_STAGE_ASSETS+'/bluefin/'+name+'.bin'")
    effective = effective.replace("sourceRoot+'/.codex-stage-sources/generated'", 'process.env.INKWAVE_NATIVE_STAGE_ASSETS')
    if name == 'matched-catalogue-source-sweep.mjs':
        relative = Path('final-source-aim-diagnostic-1ad/browser/online.json')
    else:
        candidate = required('PEER_CANDIDATE_ROOT')
        effective = effective.replace('/workspace/stage-combat-validation', str(candidate))
        relative = Path('matched-catalogue-source-sweep.json')
    destination = run / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(private_inputs / relative, destination)
    inputs.append({'path': str(private_inputs / relative), 'sha256': digest(destination)})
    command = ['node', '--experimental-vm-modules', str(run / ('effective-' + name))]
    required_lock = '/workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock'
else:
    site = required('PEER_SITE')
    environment.update(NATIVE_STAGE_IDS=os.environ.get('NATIVE_STAGE_IDS', 'bluefin'),
                       NATIVE_HOST_WEAPON='s3-blaster-short',
                       NATIVE_ONLINE_MODES=os.environ.get('NATIVE_ONLINE_MODES', 'turf,zones,tower,rainmaker,clams'))
    command = ['node', str(run / ('effective-' + name)), str(site), str(run / 'browser-output')]
    required_lock = '/workspace/actions/.ci-scratch/native-stage-browser.lock'

execution_copy = run / ('effective-' + name)
execution_copy.write_text(effective)
binding = {'status': 'prepared-only; no test executed; relocation launcher unqualified',
           'snapshot': name, 'originalSha256': digest(BASE / 'snapshots' / name),
           'effectiveSha256': digest(execution_copy), 'privateInputs': inputs,
           'environmentSelectors': environment, 'command': command, 'requiredExternalLock': required_lock,
           'limits': 'Original saved code unchanged. Bind current build/source/server and start/end hashes independently; existing historical binding runners are exact snapshots and retain fixed old paths.'}
(run / 'preparation-binding.json').write_text(json.dumps(binding, indent=2) + '\n')
print(json.dumps(binding, indent=2))
