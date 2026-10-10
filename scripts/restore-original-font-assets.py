#!/usr/bin/env python3
"""Restore only the two unchanged assets from the user's original core ZIP.
No network access. Reject unexpected bytes, paths or overwriting different files.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core_zip', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / 'reports/weapon-audit-20261009/package-omissions.json').read_text())
    pending = []
    with zipfile.ZipFile(args.core_zip) as archive:
        for row in manifest['files']:
            name = row['path']
            target = root / name
            if not target.resolve().is_relative_to(root):
                raise ValueError(f'Unsafe target: {name}')
            data = archive.read(name)
            digest = hashlib.sha256(data).hexdigest()
            if digest != row['sha256']:
                raise ValueError(f'Original archive asset hash mismatch: {name}')
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError(f'Refusing to overwrite modified asset: {name}')
            pending.append((target, data))
    # Validate the entire request before writing either file.
    for target, data in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        print(f'Restored {target.relative_to(root)}')

if __name__ == '__main__':
    main()
