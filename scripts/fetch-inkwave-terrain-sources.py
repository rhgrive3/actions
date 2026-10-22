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
import time
import urllib.request

revision = '0611f51b35c9736ee986fb2218461e2585b7875e'


def fetch(url, target, algorithm, expected, git_blob=False, receipt=None):
    receipt = receipt if receipt is not None else {}
    # Retry only a demonstrably incomplete successful HTTP transfer. Keep the
    # same URL and digest; complete wrong bodies and access errors remain fatal.
    for attempt in range(1, 4):
        receipt['attemptCount'] = attempt
        try:
            return _fetch_once(url, target, algorithm, expected, git_blob, receipt)
        except ValueError:
            if not (attempt < 3 and receipt.get('status') == 2
                    and receipt.get('httpStatus') == 200
                    and 0 <= receipt.get('bytes', -1) < receipt.get('contentLength', -1)):
                raise
            time.sleep(attempt)


def _fetch_once(url, target, algorithm, expected, git_blob=False, receipt=None):
    # Numeric diagnostics only: never copy response bodies, headers or URLs.
    # status: 0 pending, 1 verified, 2 digest mismatch, 3 transfer/file error.
    receipt = receipt if receipt is not None else {}
    receipt.update(status=0, cacheHit=0, bytes=0, httpStatus=0,
                   contentLength=-1, expectedDigest=list(bytes.fromhex(expected)),
                   actualDigest=[], gitBlob=int(git_blob))
    def digest(p):
        h = hashlib.new(algorithm)
        if git_blob:
            h.update(f'blob {p.stat().st_size}\0'.encode())
        with p.open('rb') as stream:
            while block := stream.read(1 << 20):
                h.update(block)
        return h.hexdigest()
    if target.exists() and digest(target) == expected:
        receipt.update(status=1, cacheHit=1, bytes=target.stat().st_size,
                       actualDigest=list(bytes.fromhex(expected)))
        return
    temporary = target.with_suffix(target.suffix + '.download')
    try:
        with urllib.request.urlopen(url, timeout=180) as response, temporary.open('wb') as output:
            receipt['httpStatus'] = response.getcode() or 0
            length = response.headers.get('Content-Length', '')
            if length.isascii() and length.isdigit():
                receipt['contentLength'] = int(length)
            while block := response.read(1 << 20):
                output.write(block)
                receipt['bytes'] += len(block)
        actual = digest(temporary)
        receipt['actualDigest'] = list(bytes.fromhex(actual))
        if actual != expected:
            receipt['status'] = 2
            raise ValueError(f'Source integrity mismatch: {target.name}')
        temporary.replace(target)
        receipt['status'] = 1
    except Exception as error:
        if receipt['status'] == 0:
            receipt['status'] = 3
        if isinstance(getattr(error, 'code', None), int):
            receipt['httpStatus'] = error.code
        raise
    finally:
        temporary.unlink(missing_ok=True)


def stage(s, root, receipt):
    # phase: 1 pinned tree, 2 OBJ, 3 MTL. Stage status: 0 pending, 1 pass, 2 fail.
    receipt.update(status=0, phase=1, files=[])
    try:
        _stage(s, root, receipt)
        receipt['status'] = 1
    except Exception:
        receipt['status'] = 2
        raise


def _stage(s, root, receipt):
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
    receipt['phase'] = 2
    receipt['files'].append({})
    fetch(f'https://media.githubusercontent.com/media/kirakira-dev/KiTrix/{revision}/stages/{s["internal"]}/{obj}',
          directory / obj, 'sha256', s['sourceSha256'], receipt=receipt['files'][-1])
    receipt['phase'] = 3
    pin = next(f for f in tree['tree'] if f['type'] == 'blob' and f['path'] == mtl)
    receipt['files'].append({})
    fetch(f'https://raw.githubusercontent.com/kirakira-dev/KiTrix/{revision}/stages/{s["internal"]}/{mtl}',
          directory / mtl, 'sha1', pin['sha'], git_blob=True, receipt=receipt['files'][-1])
    print(s['id'] + ' OBJ / MTL / tree verified', flush=True)


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    root = pathlib.Path(args[0] if args else '.codex-stage-sources/terrain-ci')
    report = pathlib.Path(args[1] if len(args) > 1 else 'work/terrain-source-evidence/fetch.json')
    receipt = {'schema': 1, 'exitCode': 1, 'stageCount': 0, 'verifiedStages': 0, 'stages': []}
    try:
        catalog = json.loads(subprocess.check_output([
            'node', '--input-type=module', '-e',
            "import {nativeStageCatalog} from './scripts/lib/inkwave-native-stages.mjs';console.log(JSON.stringify(nativeStageCatalog()));",
        ], text=True))
        receipt['stageCount'] = len(catalog['stages'])
        receipt['stages'] = [{'index': i, 'status': 0} for i in range(receipt['stageCount'])]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
            list(workers.map(lambda pair: stage(pair[0], root, pair[1]),
                             zip(catalog['stages'], receipt['stages'])))
        receipt['exitCode'] = 0
    finally:
        # Executor shutdown joins all writers before this payload-free snapshot.
        receipt['verifiedStages'] = sum(s['status'] == 1 for s in receipt['stages'])
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    main()
