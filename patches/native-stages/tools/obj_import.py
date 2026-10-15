# Parser and BVH adapted from the user-supplied R6 handoff (2026-10-12).
# No source vertices or textures are embedded here.
from array import array
import hashlib, re
import numpy as np
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()

def parse_obj(file,semantics=None):
 # The source exporter has an independent aligned v/vt/vn stream per object.
 # Explicit assertions prevent the silent UV/index corruption of generic loaders.
 geo=array('f');ind=array('I');objects=[];verts=[];norms=[];uvs=[];faces=[];name=None;mat=None;offset=0;uvOffset=0;normalOffset=0
 def flush():
  nonlocal verts,norms,uvs,faces,offset,uvOffset,normalOffset
  if name is None:return
  if not verts:return
  if len(verts)!=len(norms) or (len(uvs) not in (0,len(verts))):raise ValueError(f'{name}: split attribute stream unsupported')
  v=np.array(verts,dtype='<f4');n=np.array(norms,dtype='<f4');u=np.array(uvs,dtype='<f4') if uvs else np.zeros((len(v),2),dtype='<f4')
  first=len(geo)//8;io=len(ind)
  geo.extend(np.concatenate([v,n,u],axis=1).ravel());ind.extend(faces)
  lo=v.min(axis=0);hi=v.max(axis=0)
  bg=name.startswith(('FldBG','Fld_BG'));s=(name+' '+str(mat)).lower()
  alpha=any(k in s for k in ['graffiti','warningtape','canola','leaf','grass','cloth','flag','stencil','notice','chainlink','net','grate','fence','vinyl','alpha','rope','fabric','dvpoolfloat','spotlight'])
  # This classifier does NOT assert original physics flags; all entries keep evidence.
  decor=any(k in s for k in ['graffiti','warningtape','canola','leaf','flag','cloth','stencil','light_cp','spotlight','lens','vinylseat','carshadow','__carsset','_car_','buss_shadow','treebush','groundgrass','watersurfice','__water_','__waterpuddle','watersurface','seawater','skyplane'])
  decor=decor or str(mat).lower().endswith('_water') or '_water_' in name.lower() or str(mat).lower().endswith(('_plant','_code00'))
  surface=str(mat).lower();grate=any(k in surface for k in ['grate','coppernet','chainlink','meshfloor','waffledplate'])
  glass=any(k in surface for k in ['glass','window'])
  layer=re.search(r'(?:Pack|_)(Pnt|Var|Vlf|Vgl|Vcl|Tcl)(?:Set)?(?:_|$)',name)
  matches=lambda key:any(re.search(pattern,name) for pattern in (semantics or {}).get(key,[]))
  active=(not layer or layer.group(1)=='Pnt') and 'TriColor' not in name and not matches('inactiveObjectPatterns')
  collider=active and not bg and (name.startswith('Fld_') or name.startswith('FldObj_')) and not decor and not matches('nonCollidableObjectPatterns')
  paint=collider and not (grate or glass or str(mat).lower().endswith(('_np','_cp','_op'))) and not matches('nonPaintableObjectPatterns')
  objects.append(dict(name=name,material=mat,vo=first,vc=len(v),io=io,ic=len(faces),bounds=[lo.tolist(),hi.tolist()],background=bg,collidable=collider,paintable=paint,grate=grate,glass=glass,alpha=alpha,sourceHasUV=bool(uvs),active=active,ruleLayer=layer.group(1) if layer else None))
  offset+=len(verts);uvOffset+=len(uvs);normalOffset+=len(norms);verts=[];norms=[];uvs=[];faces=[]
 with file.open() as f:
  for line in f:
   if line.startswith('o '):flush();name=line[2:].strip();mat=None
   elif line.startswith('v '):verts.append(tuple(map(float,line.split()[1:4])))
   elif line.startswith('vn '):norms.append(tuple(map(float,line.split()[1:4])))
   elif line.startswith('vt '):uvs.append(tuple(map(float,line.split()[1:3])))
   elif line.startswith('usemtl '):mat=line[7:].strip()
   elif line.startswith('f '):
    tokens=line.split()[1:];ii=[]
    for t in tokens:
     parts=t.split('/');vi=int(parts[0]);ui=int(parts[1]) if parts[1] else None;ni=int(parts[2])
     local=vi-1-offset
     if ni-1-normalOffset!=local or (ui is not None and ui-1-uvOffset!=local):raise ValueError(f'{name}: separate indices need remapping')
     if local<0 or local>=len(verts):raise ValueError('out-of-object index')
     ii.append(local)
    for j in range(1,len(ii)-1):faces.extend([ii[0],ii[j],ii[j+1]])
 flush()
 return np.asarray(geo,dtype='<f4').reshape(-1,8),np.asarray(ind,dtype='<u4'),objects

def bvh(tri):
 lo=tri.min(axis=1);hi=tri.max(axis=1);centers=(lo+hi)/2
 nodes=[];order=[]
 def rec(ids):
  idx=len(nodes);a=lo[ids].min(axis=0);b=hi[ids].max(axis=0);nodes.append([*a,*b,0,0])
  if len(ids)<=12:
   start=len(order);order.extend(ids.tolist());nodes[idx][6]=-start-1;nodes[idx][7]=len(ids)
  else:
   axis=np.argmax(np.ptp(centers[ids],axis=0));half=len(ids)//2
   sorter=np.argpartition(centers[ids,axis],half);L=rec(ids[sorter[:half]]);R=rec(ids[sorter[half:]])
   nodes[idx][6]=L;nodes[idx][7]=R
  return idx
 rec(np.arange(len(tri),dtype=np.int32))
 return np.asarray(nodes,dtype='<f4'),np.asarray(order,dtype='<u4')
