#!/usr/bin/env python3
"""Fetch each pinned URL once per run, validate bytes, preserve verifier paths."""
import concurrent.futures
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://raw.githubusercontent.com/Leanny/splat3/'


def reference_plan(root=ROOT):
    read = lambda name: json.loads((root / 'patches/splatoon3/reference' / (name + '.json')).read_text())
    curated, fidelity = read('curated-numbers'), read('weapons-fidelity-reference')
    receipt = read('object-shredder-1130')['receipt']
    catalog = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {MAIN_WEAPON_CATALOG as c} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs'; console.log(JSON.stringify(c))"], cwd=root))
    commit = curated['sourceCommit']
    if not re.fullmatch('[0-9a-f]{40}', commit) or any(x != commit for x in [fidelity['sourceCommit'], receipt['commit'], catalog['sourceCommit']]):
        raise ValueError('reference sourceCommit mismatch')
    plan = {}
    destinations = {}

    def add(url, target, digest=None):
        if not url.startswith(BASE + commit + '/'):
            raise ValueError('reference URL does not match pinned commit: ' + url)
        relative = PurePosixPath(url[len(BASE + commit + '/'):])
        if relative.is_absolute() or '..' in relative.parts or '?' in url or '#' in url:
            raise ValueError('invalid pinned source path')
        target = PurePosixPath(target)
        if target.is_absolute() or '..' in target.parts:
            raise ValueError('invalid reference destination')
        if target in destinations and destinations[target] != url:
            raise ValueError('different URLs share a reference destination')
        destinations[target] = url
        entry = plan.setdefault(url, {'targets': set(), 'hashes': set()})
        entry['targets'].add(str(target))
        if digest:
            if not re.fullmatch('[0-9a-f]{64}', digest):
                raise ValueError('invalid source hash')
            entry['hashes'].add(digest)
            if len(entry['hashes']) != 1:
                raise ValueError('conflicting hashes for pinned URL: ' + url)

    for source in curated['sources']:
        add(source['url'], source['id'], source['sha256'])
    for source in fidelity['sources']:
        if source.get('expectedFileSha256'):
            if source.get('sourceCommit', commit) != commit:
                raise ValueError('fidelity sourceCommit mismatch')
            add(source['url'], 'weapons/' + source['url'].rsplit('/', 1)[-1], source['expectedFileSha256'])
    add(BASE + commit + '/' + receipt['path'], 'object-damage.json', receipt['sha256'])
    for record in catalog['records']:
        add(BASE + commit + '/' + record['sourcePath'], 'catalog/' + record['sourcePath'], record['sourceSha256'])
    for relative in ['data/mush/1130/WeaponInfoMain.json', 'data/language/USen.json', 'data/language/JPja.json']:
        add(BASE + commit + '/' + relative, 'catalog/' + relative)
    return plan


def fetch_references(plan, output, opener=urllib.request.urlopen):
    output = Path(output)

    def download(item):
        url, entry = item
        with opener(url, timeout=30) as response:
            data = response.read()
        digest = hashlib.sha256(data).hexdigest()
        if entry['hashes'] and digest not in entry['hashes']:
            raise ValueError('pinned reference hash mismatch: ' + url)
        return url, entry, data

    # Finish all downloads/validation before publishing any verifier input.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(download, sorted(plan.items())))
    for url, entry, data in results:
        for relative in sorted(entry['targets']):
            target = output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.partial')
            temporary.write_bytes(data)
            temporary.replace(target)
        print('verified', url, hashlib.sha256(data).hexdigest(), ','.join(sorted(entry['targets'])))
    return len(results)


if __name__ == '__main__':
    plan = reference_plan()
    print('Unique pinned source GETs:', fetch_references(plan, ROOT / '.reference-data'))
