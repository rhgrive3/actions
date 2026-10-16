#!/usr/bin/env python3
"""Upgrade verified b1f571da Drive source parts to a pinned, editable main tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

def safe(root, name):
    if not name or name.startswith('/') or '\\' in name or any(x in ('','.','..') for x in name.split('/')):
        raise RuntimeError('Unsafe path: '+name)
    path=root.joinpath(*name.split('/'))
    if not path.resolve(strict=False).is_relative_to(root.resolve()):
        raise RuntimeError('Path escapes source root: '+name)
    return path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_obj(path, kind):
    if kind == 'symlink':
        if not path.is_symlink(): raise ValueError('Expected symbolic link')
        return os.readlink(path).encode('utf-8','surrogateescape')
    if path.is_symlink() or not path.is_file(): raise ValueError('Expected regular file')
    return path.read_bytes()

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source',type=Path,default=Path('inkwave-main'))
    ap.add_argument('--baseline-manifest',type=Path,default=Path('SOURCE_MANIFEST.json'))
    ap.add_argument('--package',type=Path,default=Path(__file__).resolve().parent)
    args=ap.parse_args()
    baseline=json.loads(args.baseline_manifest.read_text(encoding='utf-8'))
    delta=json.loads((args.package/'DELTA_MANIFEST.json').read_text(encoding='utf-8'))
    if baseline['main_commit']!=delta['base_commit']:
        raise SystemExit('Wrong base snapshot: expected '+delta['base_commit'])
    root=args.source.resolve()
    if not root.is_dir():
        raise SystemExit('Run old RESTORE.py using the previous 47 part ZIPs first')
    affected={c['path'] for c in delta['changes']}
    errors=[]
    # Verify *all* unchanged regular files against the previously pinned SHA256.
    for f in baseline['files']:
        if f['kind']!='file' or f['path'] in affected:continue
        p=safe(root,f['path'])
        if not p.is_file() or p.is_symlink() or p.stat().st_size!=f['bytes'] or sha(p.read_bytes())!=f['sha256']:
            errors.append('old unchanged file was modified: '+f['path'])
    # Preflight every modification before writing anything.
    for c in delta['changes']:
        p=safe(root,c['path'])
        old,new=c['old'],c['new']
        if old:
            try:
                data=read_obj(p,old['kind'])
                if len(data)!=old['bytes'] or sha(data)!=old['sha256']:
                    raise ValueError('old bytes differ')
            except Exception as e:
                errors.append(c['path']+': '+str(e))
        elif p.exists() or p.is_symlink():
            errors.append('new path unexpectedly exists: '+c['path'])
        if new:
            payload=safe((args.package/'files').resolve(),c['path'])
            try:
                data=payload.read_bytes()
                if len(data)!=new['bytes'] or sha(data)!=new['sha256']:
                    raise ValueError('payload SHA256 differs')
            except Exception as e:
                errors.append('update payload invalid for '+c['path']+': '+str(e))
    if errors:
        raise SystemExit('Refusing to overwrite edited or incomplete data:\n'+'\n'.join(errors[:30]))
    for c in delta['changes']:
        path=safe(root,c['path'])
        if path.is_symlink() or path.exists():path.unlink()
        new=c['new']
        if not new:continue
        path.parent.mkdir(parents=True,exist_ok=True)
        payload=safe((args.package/'files').resolve(),c['path'])
        if new['kind']=='symlink':
            path.symlink_to(payload.read_bytes().decode('utf-8','surrogateescape'))
        else:
            with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as output:
                with payload.open('rb') as src:shutil.copyfileobj(src,output)
                temp=output.name
            os.chmod(temp,int(new['mode'],8)&0o777)
            os.replace(temp,path)
    for c in delta['changes']:
        if not c['new']:continue
        data=read_obj(safe(root,c['path']),c['new']['kind'])
        if len(data)!=c['new']['bytes'] or sha(data)!=c['new']['sha256']:
            raise SystemExit('Post-update SHA256 failed: '+c['path'])
    print('VERIFIED',len(baseline['files']),'baseline paths; applied',len(delta['changes']),'Git changes')
    print('EXACT MAIN',delta['target_commit'])
    print('SOURCE',root)

if __name__=='__main__':
    main()
