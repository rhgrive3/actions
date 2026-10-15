#!/usr/bin/env python3
"""Independent text-stream check of preserved OBJ attributes and PNG bytes."""
import argparse,json,hashlib,subprocess
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--assets',required=True,type=Path);p.add_argument('--report',required=True,type=Path);a=p.parse_args();reports=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for dst in sorted(a.assets.iterdir()):
 if not dst.is_dir():continue
 m=json.loads((dst/'manifest.json').read_text());src=a.source/m['internal'];
 tree=subprocess.check_output(['git','-C',str(a.source.parent),'ls-tree','-rz',m['sourceCommit'],'stages/'+m['internal']]).split(b'\x00');pinned={}
 for row in tree:
  if not row:continue
  meta,name=row.split(b'\t',1);pinned[name.decode()]=meta.split()[2].decode()
 for name in [m['internal']+'.mtl',*m['textureIntegrity']]:
  raw=(src/name).read_bytes();oid=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\x00'+raw).hexdigest()
  assert oid==pinned['stages/'+m['internal']+'/'+name], 'Texture/MTL differs from pinned Git tree: '+name
 vertices=[];normals=[];uv=[];face_count=0
 for line in (src/(m['internal']+'.obj')).open():
  if line.startswith('v '):vertices.append(tuple(map(float,line.split()[1:4])))
  elif line.startswith('vn '):normals.append(tuple(map(float,line.split()[1:4])))
  elif line.startswith('vt '):uv.append(tuple(map(float,line.split()[1:3])))
  elif line.startswith('f '):face_count+=len(line.split())-3
 expected=np.asarray(vertices,dtype='<f4');buffer=np.fromfile(dst/'vertices.bin',dtype='<f4').reshape(-1,8)
 assert np.array_equal(buffer[:,:3],expected)
 assert np.array_equal(buffer[:,3:6],np.asarray(normals,dtype='<f4'))
 # Some objects have no UV stream; importer inserts zeros only there.
 source_uv=np.asarray(uv,dtype='<f4');mapped=np.concatenate([buffer[o['vo']:o['vo']+o['vc'],6:8] for o in m['objects'] if o['sourceHasUV']]);assert np.array_equal(mapped,source_uv)
 assert len(np.fromfile(dst/'indices.bin',dtype='<u4'))//3==face_count
 for name,info in m['textureIntegrity'].items():assert sha(src/name)==info['sha256']==sha(dst/name)
 r=dict(id=m['id'],sourceCommit=m['sourceCommit'],objSha256=sha(src/(m['internal']+'.obj')),mtlSha256=sha(src/(m['internal']+'.mtl')),vertices=len(vertices),triangles=face_count,positionsFloat32Identical=True,normalsFloat32Identical=True,uvFloat32Identical=True,sourceTexturesIdentical=len(m['textureIntegrity']),maxPositionDifference=0.0,version1130Verified=False,textureAndMtlGitTreeVerified=True)
 reports.append(r);print(json.dumps(r),flush=True)
 del vertices,normals,uv,expected,buffer,source_uv,mapped

a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(reports,indent=2))
