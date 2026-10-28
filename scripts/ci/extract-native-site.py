#!/usr/bin/env python3
"""Validate a digest-bound same-run site tar before extracting regular files."""
import hashlib, os, pathlib, shutil, sys, tarfile
MAX_ENTRIES=10000
MAX_BYTES=1024*1024*1024

def extract(archive, destination, expected):
    if len(expected)!=64 or any(c not in '0123456789abcdef' for c in expected): raise ValueError('invalid expected digest')
    if os.path.getsize(archive)>MAX_BYTES: raise ValueError('archive size limit')
    digest=hashlib.sha256()
    with open(archive,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): digest.update(chunk)
    if digest.hexdigest()!=expected: raise ValueError('archive digest mismatch')
    root=pathlib.Path(destination)
    if root.exists(): raise ValueError('destination must not exist')
    with tarfile.open(archive,'r:') as tar:
        rows=[];seen=set();size=0;regular=set()
        for row in tar:
            rows.append(row)
            if len(rows)>MAX_ENTRIES: raise ValueError('entry limit')
            name=row.name.rstrip('/') if row.isdir() else row.name
            parts=name.split('/')
            if not name or '\\' in name or any(x in ('','.','..') for x in parts): raise ValueError('invalid path')
            if name!='_site-source-sha.txt' and parts[0]!='_site': raise ValueError('unexpected archive path')
            if name in seen: raise ValueError('duplicate entry')
            seen.add(name)
            if not (row.isdir() or row.isfile()): raise ValueError('links and special files forbidden')
            if row.isfile():
                regular.add(name)
                size+=row.size
                if size>MAX_BYTES: raise ValueError('expanded size limit')
        if not {'_site-source-sha.txt','_site/inkwave-build.json','_site/sw.js'}.issubset(regular): raise ValueError('required members missing')
        root.mkdir(parents=True)
        for row in rows:
            name=row.name.rstrip('/') if row.isdir() else row.name
            target=root.joinpath(*name.split('/'))
            if row.isdir(): target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with tar.extractfile(row) as src, open(target,'xb') as out: shutil.copyfileobj(src,out,1024*1024)
    return len(rows),size

if __name__=='__main__':
    if len(sys.argv)!=4: raise SystemExit('usage: archive destination sha256')
    try: print('verified entries=%d expanded_bytes=%d'%extract(*sys.argv[1:]))
    except Exception as e: raise SystemExit('archive verification failed: '+str(e))
