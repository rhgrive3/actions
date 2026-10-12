#!/usr/bin/env python3
"""Local-only source conversion. Exact float32 render vertices, indexed BVH,
plane charts, polygon CPU masks. All gameplay semantics are inferred, not retail.
No input assets or generated derivatives may be added to the public repository.
"""
from pathlib import Path
import argparse, json, re, time, shutil
import numpy as np
from PIL import Image
from numba import njit
from obj_import import parse_obj, bvh, sha

REV = '0611f51b35c9736ee986fb2218461e2585b7875e'
# R6 safe-support estimates; NOT recovered Nintendo spawn/landing placements.
STAGES = [
 ('scorch','Vss_Yunohana','ユノハナ大渓谷','c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8',[-36,-82.5,36,82.5],[7.5,13.5904,-70.95]),
 ('hagglefish','Vss_Yagara','ヤガラ市場','1da0c775b47e42e9bc8657675034e935c672866ee109c13896283b3bbe7c77f4',[-52.9357,-78,52.9357,78],[0,13.58,-67.08]),
 ('inkblot','Vss_Upland03','海女美術大学','bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3',[-46,-68.1673,46,68.1673],[17.5,15.64415,-58.62388]),
 ('mako','Vss_Line03','ザトウマーケット','27f6ed7271c652d7a2f6306ed7ebd9ea46076affd9edecb30d5a607ba4a520ad',[-33.5,-67.5,33.5,67.5],[-7.5,14.08,-58.05]),
 ('brinewater','Vss_BigSlope00','クサヤ温泉','3b1d042105ca2918a3abe3efcf7d2eb8c0239bc542712b23f87ffaef8854612e',[-47.5,-69,47.5,69],[-12.5,18.08,-59.34]),
]

@njit(cache=True)
def raster_mask(xy, nu, nv, cu, cv):
 out=np.zeros(nu*nv,np.uint8)
 for t in xy:
  ax,ay=t[0];bx,by=t[1];cx,cy=t[2]
  den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
  if abs(den)<1e-12:continue
  for j in range(max(0,int(min(ay,by,cy)/cv)),min(nv,int(max(ay,by,cy)/cv)+1)):
   for i in range(max(0,int(min(ax,bx,cx)/cu)),min(nu,int(max(ax,bx,cx)/cu)+1)):
    x=(i+.5)*cu;y=(j+.5)*cv
    u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den;v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den
    if u>=-1e-6 and v>=-1e-6 and u+v<=1+1e-6:out[j*nu+i]=1
 return out


def materials(src,objects,dst):
 result={};key=None
 for l in (src/(src.name+'.mtl')).read_text().splitlines():
  if l.startswith('newmtl '):key=l[7:];result[key]={}
  elif key and l.startswith('map_Kd '):result[key]['albedo']=l[7:]
  elif key and l.startswith('Kd '):result[key]['diffuse']=list(map(float,l[3:].split()))
 active=set(o['material'] for o in objects if o['active']);result={k:v for k,v in result.items() if k in active}
 needed=set()
 for key,m in result.items():
  original=m.get('albedo');m['maps']={};m['channels']={}
  if not original:continue
  if not (src/original).is_file():raise ValueError('Missing texture '+original)
  stem=Path(original).name;base=re.sub(r'_(Alb|Nrm|Rgh|Mtl|Opa)\.png$','',stem)
  packed=re.search(r'_(Nrm|Rgh|Mtl|Opa)\.png$',stem)
  if packed or 'BakeDummy' in stem:
   m['albedo']=None;m['materialRepair']='inferred neutral tint for non-colour MTL map'
   if packed:m['maps'][{'Nrm':'normal','Rgh':'roughness','Opa':'opacity','Mtl':'metalness'}[packed.group(1)]]=original
  for suffix,role in [('_Nrm.png','normal'),('_Rgh.png','roughness'),('_Opa.png','opacity'),('_Emi.png','emissive'),('_Emm.png','emissive')]:
   p='textures/'+base+suffix
   if (src/p).is_file():m['maps'][role]=p
  if 'Canola' in key and (src/'textures/Canola_Opa.png').is_file():
   m['albedo']=None;m['maps']['opacity']='textures/Canola_Opa.png';m['tint']='#8a75cd' if 'CanolaB' in key else '#df934e'
  if m['albedo'] is None and not m.get('tint'):
   low=key.lower();m['tint']='#608e98' if ('water' in low or 'glass' in low) else '#698275' if 'vinyl' in low else '#c3c3b8'
  for role,p in m['maps'].items():
   with Image.open(src/p) as im:
    a=np.asarray(im.convert('RGB')).reshape(-1,3);mean=a.mean(axis=0);spread=np.ptp(a.astype('i2'),axis=0)
    if role in ['opacity','roughness']:m['channels'][role]='r' if mean[1]<1 and (mean[0]>2 or spread[0]>4) else 'g'
    if role=='normal':m['normalEncoding']='rg-reconstruct-z' if mean[2]<1 else 'rgb'
  with Image.open(src/original) as im:m['hasAlpha']=im.mode=='RGBA' and im.getchannel('A').getextrema()[0]<250
  if m.get('albedo'):needed.add(m['albedo'])
  needed.update(m['maps'].values())
 for p in needed:
  target=dst/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/p,target)
 return result,{p:dict(bytes=(dst/p).stat().st_size,sha256=sha(dst/p)) for p in sorted(needed)}


def build(source,out,spec):
 sid,internal,name,expected,bounds,pad=spec;start=time.time();src=source/internal;dst=out/sid;dst.mkdir(parents=True,exist_ok=True)
 obj=src/(internal+'.obj');digest=sha(obj)
 if digest!=expected:raise ValueError(f'{internal}: expected pinned OBJ sha256 {expected}, got {digest} (LFS pointer or changed input)')
 geo,idx,objects=parse_obj(obj)
 # Original vertices/normals/UV/index buffers are preserved, with no guessed scaling.
 geo.tofile(dst/'vertices.bin');idx.tofile(dst/'indices.bin')
 tri=[];norm=[];flags=[];oids=[]
 for oi,o in enumerate(objects):
  if not o['collidable']:continue
  face=idx[o['io']:o['io']+o['ic']].reshape(-1,3)+o['vo'];t=geo[face,:3];n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);length=np.linalg.norm(n,axis=1);good=length>1e-9
  t=t[good];face=face[good];n=n[good]/length[good,None];flip=np.einsum('ij,ij->i',n,geo[face,3:6].mean(axis=1))<0;n[flip]*=-1
  tri.append(t);norm.append(n);flags.extend([1|(2 if o['paintable'] else 0)|(4 if o['grate'] else 0)|(8 if o['glass'] else 0)]*len(t));oids.extend([oi]*len(t))
 tri=np.concatenate(tri).astype('<f4');norm=np.concatenate(norm).astype('<f4');flags=np.array(flags,dtype='<u4');oids=np.array(oids,dtype='<u4')
 nodes,order=bvh(tri)
 # Merge only paintable, nearly coplanar triangles within the same source object.
 # Charts change ink coordinates, never the render/collision triangles.
 area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)*.5
 active=np.flatnonzero(((flags&2)>0)&(norm[:,1]>-.5)&(area>.0004))
 distance=np.einsum('ij,ij->i',tri[active,0],norm[active])
 keys=np.column_stack([oids[active],np.rint(norm[active]*10000).astype('i4'),np.rint(distance*1000).astype('i4'),np.floor(tri[active].mean(axis=1)/8).astype('i4')])
 _,inv=np.unique(keys,axis=0,return_inverse=True);sort=np.argsort(inv,kind='stable');chunks=np.split(active[sort],np.flatnonzero(np.diff(inv[sort]))+1)
 faces=[];mask=[];triangle_face=np.full(len(tri),-1,dtype='<i4');maxerror=0.;grid_offset=0
 for ids in chunks:
  n=norm[ids[0]].astype('f8');u=np.cross([0,1,0],n) if abs(n[1])<.9 else np.array([1.,0.,0.])-n*n[0];u/=np.linalg.norm(u);v=np.cross(n,u)
  if abs(n[1])<.3 and v[1]<0:u=-u;v=-v
  p=tri[ids].astype('f8');origin=p[0,0];rel=p-origin;xy=np.stack([rel@u,rel@v],axis=2);mn=xy.min(axis=(0,1));mx=xy.max(axis=(0,1));xy-=mn;origin=origin+u*mn[0]+v*mn[1];ext=mx-mn
  residual=float(np.abs((p-origin)@n).max());maxerror=max(maxerror,residual)
  nu,nv=np.maximum(1,np.ceil(ext/.25)).astype('i4');cu,cv=ext/[nu,nv];valid=raster_mask(xy,int(nu),int(nv),float(cu),float(cv));fid=len(faces);triangle_face[ids]=fid
  faces.append(dict(origin=origin.tolist(),u=u.tolist(),v=v.tolist(),n=n.tolist(),su=float(ext[0]),sv=float(ext[1]),nu=int(nu),nv=int(nv),cu=float(cu),cv=float(cv),grid=grid_offset,object=int(oids[ids[0]]),triangles=ids.tolist(),bounds=[p.min(axis=(0,1)).tolist(),p.max(axis=(0,1)).tolist()],area=float(area[ids].sum())))
  mask.append(valid);grid_offset+=len(valid)
 masks=np.concatenate(mask);masks.tofile(dst/'mask.bin')
 for key,a in dict(collision=tri,normals=norm,flags=flags,objects=oids,bvh=nodes,order=order,triangleFace=triangle_face).items():a.tofile(dst/(key+'.bin'))
 mats,tex=materials(src,objects,dst)
 # Derive references solely from the pinned, local display export. No version claim.
 manifest=dict(schema=1,id=sid,internal=internal,name=name,sourceCommit=REV,sourceSha256=digest,version1130Verified=False,coordinates='OBJ Y-up float32, no scale/translation',bounds=dict(minX=bounds[0],minZ=bounds[1],maxX=bounds[2],maxZ=bounds[3]),spawnPads=[pad,[-pad[0],pad[1],-pad[2]]],spawnStatus='R6 inferred support estimates; not recovered retail placements',spawnBarrier=2.5,collisionStatus='inferred display triangles, not native collision',paintStatus='inferred name/material flags and planar polygon masks, not native paint masks',ruleStatus='Pnt display layer only; ranked objectives are local calibration',faces=faces,objects=objects,materials=mats,textureIntegrity=tex,gridCells=grid_offset,geometry=dict(vertices=len(geo),triangles=len(idx)//3,collisionTriangles=len(tri),bvhNodes=len(nodes),paintFaces=len(faces)),chartMaxPlaneError=maxerror,cell=.25)
 (dst/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
 files={p.relative_to(dst).as_posix():dict(bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(dst.rglob('*')) if p.is_file() and p.name!='integrity.json'}
 (dst/'integrity.json').write_text(json.dumps(files,separators=(',',':')))
 summary={k:v for k,v in manifest.items() if k not in ['faces','objects','materials','textureIntegrity']};summary.update(bytes=sum(v['bytes'] for v in files.values()),textureFiles=len(tex),validCells=int(masks.sum()),conversionSeconds=round(time.time()-start,2))
 print(json.dumps(summary,ensure_ascii=False),flush=True);return summary

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--stages',nargs='*');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 summaries=[build(a.source,a.out,s) for s in STAGES if not a.stages or s[0] in a.stages]
 (a.out/'catalog.json').write_text(json.dumps(dict(schema=1,sourceCommit=REV,stages=summaries),ensure_ascii=False,indent=2))
