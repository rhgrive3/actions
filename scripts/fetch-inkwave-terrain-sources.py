#!/usr/bin/env python3
"""Fetch authenticated, pinned geometry into private ignored scratch, never Git.

No PNGs, model payloads or derivatives may be uploaded as CI artifacts.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.codex-stage-sources/terrain-ci')
catalog = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {nativeStageCatalog} from './scripts/lib/inkwave-native-stages.mjs';console.log(JSON.stringify(nativeStageCatalog()));",
], text=True))
revision = '0611f51b35c9736ee986fb2218461e2585b7875e'


def fetch(url, target, algorithm, expected, git_blob=False):
    def digest(p):
        h = hashlib.new(algorithm)
        if git_blob:
            h.update(f'blob {p.stat().st_size}\0'.encode())
        with p.open('rb') as stream:
            while block := stream.read(1 << 20):
                h.update(block)
        return h.hexdigest()
    if target.exists() and digest(target) == expected:
        return
    temporary = target.with_suffix(target.suffix + '.download')
    try:
        with urllib.request.urlopen(url, timeout=180) as response, temporary.open('wb') as output:
            while block := response.read(1 << 20):
                output.write(block)
        if digest(temporary) != expected:
            raise ValueError(f'Source integrity mismatch: {target.name}')
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def stage(s):
    directory = root / s['id']
    directory.mkdir(parents=True, exist_ok=True)
    tree_file = directory / 'tree.json'
    if tree_file.exists():
        tree = json.loads(tree_file.read_text())
    else:
        tree = json.loads(subprocess.check_output([
            'gh', 'api', f'repos/kirakira-dev/KiTrix/git/trees/{s["tree"]}?recursive=1',
        ], text=True))
    if tree.get('sha') != s['tree'] or tree.get('truncated') is not False:
        raise ValueError(f'Unpinned source tree: {s["id"]}')
    tree_file.write_text(json.dumps(tree))
    obj = s['internal'] + '.obj'
    mtl = s['internal'] + '.mtl'
    fetch(f'https://media.githubusercontent.com/media/kirakira-dev/KiTrix/{revision}/stages/{s["internal"]}/{obj}',
          directory / obj, 'sha256', s['sourceSha256'])
    pin = next(f for f in tree['tree'] if f['type'] == 'blob' and f['path'] == mtl)
    fetch(f'https://raw.githubusercontent.com/kirakira-dev/KiTrix/{revision}/stages/{s["internal"]}/{mtl}',
          directory / mtl, 'sha1', pin['sha'], git_blob=True)
    print(s['id'] + ' OBJ / MTL / tree verified', flush=True)


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
    list(workers.map(stage, catalog['stages']))
