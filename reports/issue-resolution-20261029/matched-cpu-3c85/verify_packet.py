#!/usr/bin/env python3
"""Verify every content-addressed evidence member without extracting or running it."""
from pathlib import Path
import gzip,hashlib,json,tarfile

def verified_objects(packet):
    manifest=json.loads((packet/'file-manifest.json').read_text())
    expected={x['sha256']:x['bytes'] for x in manifest['files']}
    seen=set()
    with gzip.open(packet/'payload.tar.gz','rb') as stream,tarfile.open(fileobj=stream,mode='r|') as archive:
        for member in archive:
            if not member.isfile() or not member.name.startswith('objects/'):
                raise RuntimeError('Unexpected archive member: '+member.name)
            digest=member.name.removeprefix('objects/')
            if digest not in expected or digest in seen:
                raise RuntimeError('Unexpected or duplicate object: '+digest)
            data=archive.extractfile(member).read()
            if len(data)!=expected[digest] or hashlib.sha256(data).hexdigest()!=digest:
                raise RuntimeError('Evidence object failed: '+digest)
            seen.add(digest)
            yield digest,data,manifest
    if seen!=set(expected):
        raise RuntimeError('Archive is missing evidence objects')

def verify(packet):
    for line in (packet/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1)
        if Path(name).name!=name or name=='SHA256SUMS':
            raise RuntimeError('Invalid packet checksum filename')
        if hashlib.sha256((packet/name).read_bytes()).hexdigest()!=digest:
            raise RuntimeError('Packet checksum failed: '+name)
    manifest=json.loads((packet/'file-manifest.json').read_text())
    if len({x['originalPath'] for x in manifest['files']})!=len(manifest['files']):
        raise RuntimeError('Duplicate restoration path')
    for row in manifest['files']:
        p=Path(row['originalPath'])
        if not p.is_absolute() or not str(p).startswith('/workspace/') or '..' in p.parts:
            raise RuntimeError('Invalid evidence path')
    count=sum(1 for _ in verified_objects(packet))
    return {'status':'verified-exact-evidence-packet','paths':len(manifest['files']),'uniqueObjects':count,'sourceBytes':sum(x['bytes'] for x in manifest['files']),'uniqueBytes':manifest['uniqueBytes'],'noBrowserExecuted':True}

if __name__=='__main__':
    print(json.dumps(verify(Path(__file__).resolve().parent)))
