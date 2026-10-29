#!/usr/bin/env python3
"""Restore exact evidence bytes under a chosen workspace, never overwrite changes."""
from pathlib import Path
import argparse,hashlib,json,os
from verify_packet import verified_objects,verify

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace-root',type=Path,required=True)
    args=parser.parse_args()
    packet=Path(__file__).resolve().parent
    result=verify(packet)
    manifest=json.loads((packet/'file-manifest.json').read_text())
    paths={}
    for row in manifest['files']:
        paths.setdefault(row['sha256'],[]).append(row)
    destination=args.workspace_root.resolve()
    restored=existing=0
    for digest,data,_ in verified_objects(packet):
        for row in paths[digest]:
            relative=Path(row['originalPath']).relative_to('/workspace')
            target=destination/relative
            # Symlinks must not redirect restoration outside the selected root.
            if not target.resolve().is_relative_to(destination):
                raise RuntimeError('Restoration escaped selected workspace: '+str(target))
            if target.exists():
                if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
                    raise RuntimeError('Refusing to overwrite different bytes: '+str(target))
                existing+=1
                continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open('xb') as stream:
                stream.write(data)
            os.chmod(target,row['mode'])
            restored+=1
    print(json.dumps({**result,'restoredPaths':restored,'existingExactPaths':existing,'workspaceRoot':str(destination)}))
