#!/usr/bin/env python3
"""Read-only stage baseline: common WU geometry metrics plus each runtime's turf grid.

Run from repository root (numpy required, Node required):
 python docs/stage-redesign/map3/measure_baseline.py --native-root /path/to/native-prebuilt --out docs/stage-redesign/map3/baseline-metrics.json
Native bytes are SHA256-checked against this checkout's HEAD Git LFS pointers.
No asset downloads, game edits, browser, or hardware measurements are performed.
"""
import argparse, hashlib, json, math, os, pathlib, statistics, subprocess
import numpy as np

EXPORT_JS = r'''
import fs from 'node:fs'; import path from 'node:path'; import {pathToFileURL} from 'node:url';
const root=process.argv[1], three=process.argv[2];
const THREE=await import(pathToFileURL(three));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^import .*;\n/gm,'').replace(/^export \{[^\n]*\};?\n/gm,'').replace(/export /g,'');
const PATTERN=new Function(strip(read('inkwave-public/src/world/mapkit.js'))+';return PATTERN;')();
const src=read('inkwave-public/src/world/maps.js');
const end=src.indexOf('// Halyard Marina');
const layouts=new Function('PATTERN',strip(src.slice(0,end))+';return [TIDEWATER,KELPLINE];')(PATTERN);
const Level=new Function('THREE','PATTERN',strip(read('inkwave-public/src/world/level.js'))+';return Level;')(THREE,PATTERN);
const PaintSystem=new Function('THREE','G',strip(read('inkwave-public/src/world/paint.js'))+';return PaintSystem;')(THREE,{});
const stages=layouts.map(layout=>{
 const level=new Level(layout), paint=Object.create(PaintSystem.prototype);
 Object.assign(paint,{level,cell:.25,paintFaces:level.faces.filter(f=>f.paintable)});paint._initGrid();
 const triangles=[],normals=[];
 for(const b of level.blocks){if(!b.solid)continue;
  for(let k=0;k<3;k++)for(const sign of [1,-1]){
   const n=b.axes[k].clone().multiplyScalar(sign);
   const ij=[0,1,2].filter(j=>j!==k), h=[b.half.x,b.half.y,b.half.z];
   const center=b.center.clone().addScaledVector(n,h[k]);
   const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>center.clone().addScaledVector(b.axes[ij[0]],a*h[ij[0]]).addScaledVector(b.axes[ij[1]],c*h[ij[1]]).toArray());
   for(const ids of [[0,1,2],[0,2,3]]){triangles.push(ids.map(i=>points[i]));normals.push(n.toArray());}
  }
 }
 let clippedTurfArea=0,clippedTurfCells=0; const b=layout.bounds;
 for(const f of paint.paintFaces){if(!f.turf)continue;for(let j=0;j<f.nv;j++)for(let i=0;i<f.nu;i++){
  if(paint.dead[f.grid+j*f.nu+i])continue;
  const p=f.origin.clone().addScaledVector(f.u,(i+.5)*f.cu).addScaledVector(f.v,(j+.5)*f.cv);
  if(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ){clippedTurfArea+=f.cu*f.cv;clippedTurfCells++;}
 }}
 return {id:layout.id,bounds:layout.bounds,spawnPads:layout.spawnPads,blockCount:level.blocks.length,triangles,normals,
  runtimeTurfArea:paint.turfArea,runtimeTurfCells:paint.turfTotal,
  clippedRuntimeTurfAreaWU2:clippedTurfArea,clippedRuntimeTurfCells:clippedTurfCells,
  turfAreaScope:'Level(layout) only, no set-dressing extra colliders; production PaintSystem._initGrid algorithm; no GPU'};
});
const catalog=new Function('nativeStageBuild',strip(read('patches/native-stages/runtime/source-catalog.mjs'))+';return BASE_SOURCE_STAGES;')(null);
for(const filename of fs.readdirSync(path.join(root,'patches/native-stages/definitions'))){if(filename.endsWith('.json'))catalog.push(JSON.parse(read('patches/native-stages/definitions/'+filename)));}
console.log(JSON.stringify({stages,catalog}));
'''

def digest(data): return hashlib.sha256(data).hexdigest()

def git(root,*args):
    return subprocess.check_output(['git','-C',str(root),*args],env={**os.environ,'GIT_NO_LAZY_FETCH':'1'})

def verified_array(root,folder,record,name,receipts):
    spec=record['arrays'][name]; parts=[]
    dtype={'Float32Array':'<f4','Float64Array':'<f8','Uint32Array':'<u4','Int32Array':'<i4','Uint8Array':'u1'}[spec['type']]
    for c in spec['chunks']:
        p=folder/c['file']; data=p.read_bytes(); sha=digest(data)
        pointer=git(root,'show',f'HEAD:native-prebuilt/{folder.name}/{c["file"]}').decode()
        assert f'oid sha256:{sha}' in pointer, f'HEAD LFS mismatch: {p}'
        assert sha==c['sha256'] and len(data)==c['bytes'],f'Cached manifest mismatch: {p}'
        receipts.append({'file':f'native-prebuilt/{folder.name}/{c["file"]}','sha256':sha,'bytes':len(data)})
        parts.append(np.frombuffer(data,dtype=dtype))
    arr=np.concatenate(parts) if len(parts)>1 else parts[0]
    assert len(arr)==spec['length'];return arr

def clip_xz(poly,b):
    # Sutherland-Hodgman; preserve Y by interpolation at each clipping plane.
    for axis,value,ge in [(0,b['minX'],True),(0,b['maxX'],False),(2,b['minZ'],True),(2,b['maxZ'],False)]:
        if not poly:return []
        out=[];a=poly[-1];ain=(a[axis]>=value) if ge else (a[axis]<=value)
        for c in poly:
            cin=(c[axis]>=value) if ge else (c[axis]<=value)
            if cin!=ain:
                t=(value-a[axis])/(c[axis]-a[axis]);out.append(a+(c-a)*t)
            if cin:out.append(c)
            a,ain=c,cin
        poly=out
    return poly

def geometry_metrics(tris,normals,bounds,step):
    b=bounds; nx=math.ceil((b['maxX']-b['minX'])/step);nz=math.ceil((b['maxZ']-b['minZ'])/step)
    # Last partial cells use their actual area, identical for every stage.
    xs=np.minimum(b['minX']+np.arange(nx+1)*step,b['maxX']);zs=np.minimum(b['minZ']+np.arange(nz+1)*step,b['maxZ'])
    xc=(xs[:-1]+xs[1:])/2;zc=(zs[:-1]+zs[1:])/2;weights=np.diff(zs)[:,None]*np.diff(xs)[None,:]
    low=np.full((nz,nx),np.inf);high=np.full((nz,nx),-np.inf)
    selected=normals[:,1]>=.68;ts=tris[selected];ns=normals[selected]
    projected=surface=0.;sampled=0
    lo=tris.reshape(-1,3).min(axis=0);hi=tris.reshape(-1,3).max(axis=0)
    for t,n in zip(ts,ns):
        poly=clip_xz(list(t),b)
        if len(poly)<3:continue
        area=0.
        for k in range(1,len(poly)-1):
            a,c=poly[k]-poly[0],poly[k+1]-poly[0];area+=abs(a[0]*c[2]-a[2]*c[0])*.5
        projected+=area;surface+=area/n[1]
        x0=max(0,int(np.searchsorted(xc,min(p[0] for p in poly),side='left')));x1=min(nx,int(np.searchsorted(xc,max(p[0] for p in poly),side='right')))
        z0=max(0,int(np.searchsorted(zc,min(p[2] for p in poly),side='left')));z1=min(nz,int(np.searchsorted(zc,max(p[2] for p in poly),side='right')))
        if x1<=x0 or z1<=z0:continue
        a,c,d=t;den=(c[2]-d[2])*(a[0]-d[0])+(d[0]-c[0])*(a[2]-d[2])
        if abs(den)<1e-10:continue
        X=xc[x0:x1][None,:];Z=zc[z0:z1][:,None]
        u=((c[2]-d[2])*(X-d[0])+(d[0]-c[0])*(Z-d[2]))/den
        v=((d[2]-a[2])*(X-d[0])+(a[0]-d[0])*(Z-d[2]))/den
        hit=(u>=-1e-9)&(v>=-1e-9)&(u+v<=1+1e-9)
        Y=u*a[1]+v*c[1]+(1-u-v)*d[1]
        l=low[z0:z1,x0:x1];h=high[z0:z1,x0:x1]
        np.minimum(l,np.where(hit,Y,np.inf),out=l);np.maximum(h,np.where(hit,Y,-np.inf),out=h)
    have=np.isfinite(high);span=high-low
    return {'collisionBoundsXYZ':[lo.tolist(),hi.tolist()],
      'upwardTriangleCount':int(selected.sum()),'clippedUpwardSurfaceSumWU2':surface,
      'clippedUpwardProjectedSumWU2':projected,'projectedUnionSampleWU2':float(weights[have].sum()),
      'overlapSpanAtLeast1_6SampleWU2':float(weights[have&(span>=1.6)].sum()),
      'overlapSpanAtLeast2_5SampleWU2':float(weights[have&(span>=2.5)].sum()),
      'sampleStepWU':step,'sampledSurfaceHeightRangeWU':[float(low[have].min()),float(high[have].max())]}

def dimensions(s):
    b=s['bounds'];a,c=s['spawnPads'];w=b['maxX']-b['minX'];d=b['maxZ']-b['minZ']
    return {'widthWU':w,'lengthZWU':d,'boundsAreaWU2':w*d,'spawnDistance3DWU':math.dist(a,c),
      'spawnDistanceXZWU':math.hypot(a[0]-c[0],a[2]-c[2]),'spawnPads':s['spawnPads'],'bounds':b}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=pathlib.Path,default=pathlib.Path.cwd());ap.add_argument('--native-root',type=pathlib.Path,required=True);ap.add_argument('--three',type=pathlib.Path);ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--step',type=float,default=.5);args=ap.parse_args()
    root=args.root.resolve();three=args.three or root/'inkwave-public/vendor/three/build/three.module.js'
    extracted=json.loads(subprocess.check_output(['node','--input-type=module','-e',EXPORT_JS,str(root),str(three)]));ordinary=extracted['stages'];catalog={s['id']:s for s in extracted['catalog']}
    result={'schema':1,'headParent':git(root,'rev-parse','HEAD').decode().strip(),'mapSourceSha256':digest((root/'inkwave-public/src/world/maps.js').read_bytes()),
      'units':'WU, WU²; no calibrated SI conversion','method':{'commonGeometry':'collidable upward triangles normal.y >= 0.68; triangle surfaces clipped to configured XZ bounds; raw sums count buried/overlapping surfaces; union and overlap sampled at cell centers; neither is reachable floor area',
      'overlap':'max surface height minus min surface height at one XZ sample; does not establish empty headroom, connection or body clearance',
      'turf':'runtime face masks/grid on each native or ordinary Level, no XZ clipping; upward turf normal.y > 0.7; stacked faces count separately; current ordinary values exclude dressing extras'},'ordinary':[],'native':[]}
    for s in ordinary:
        tris=np.asarray(s.pop('triangles'));normals=np.asarray(s.pop('normals'))
        result['ordinary'].append({**s,**dimensions(s),**geometry_metrics(tris,normals,s['bounds'],args.step)})
    # Only native IDs with payload manifests; unavailable source-only definitions are not included.
    for folder in sorted(args.native_root.iterdir()):
        p=folder/'stage.json'
        if not p.is_file():continue
        try:d=json.loads(p.read_text())
        except json.JSONDecodeError:continue
        m=d['manifest'];receipts=[]
        assert m['bounds']==catalog[m['id']]['bounds'] and m['spawnPads']==catalog[m['id']]['spawnPads'], 'Native metadata differs from HEAD catalog: '+m['id']
        assert m['sourceSha256']==catalog[m['id']]['sourceSha256']
        try:
            T=verified_array(root,folder,d,'triangles',receipts).reshape(-1,3,3).astype(np.float64)
            N=verified_array(root,folder,d,'normals',receipts).reshape(-1,3)
            F=verified_array(root,folder,d,'faceF64',receipts).reshape(-1,23)
            I=verified_array(root,folder,d,'faceI32',receipts).reshape(-1,4)
            mask=verified_array(root,folder,d,'mask',receipts)
        except (AssertionError,subprocess.CalledProcessError,FileNotFoundError) as e:
            result['native'].append({'id':folder.name,'error':str(e)});continue
        cells=0;area=0.;clipped_cells=0;clipped_area=0.;b=m['bounds']
        for f,i in zip(F,I):
            if f[10]>.7:
                live=mask[i[2]:i[2]+i[0]*i[1]].reshape(i[1],i[0]);count=int(np.count_nonzero(live));cells+=count;area+=count*f[14]*f[15]
                uu=(np.arange(i[0])[None,:]+.5)*f[14];vv=(np.arange(i[1])[:,None]+.5)*f[15]
                X=f[0]+uu*f[3]+vv*f[6];Z=f[2]+uu*f[5]+vv*f[8]
                count=int(np.count_nonzero(live&(X>=b['minX'])&(X<=b['maxX'])&(Z>=b['minZ'])&(Z<=b['maxZ'])))
                clipped_cells+=count;clipped_area+=count*f[14]*f[15]
        row={'id':m['id'],'name':m['name'],**dimensions(m),**geometry_metrics(T,N,m['bounds'],args.step),
          'runtimeTurfArea':area,'runtimeTurfCells':cells,'clippedRuntimeTurfAreaWU2':clipped_area,'clippedRuntimeTurfCells':clipped_cells,'sourceCommit':m['sourceCommit'],'sourceSha256':m['sourceSha256'],
          'nativeStatus':{k:m.get(k) for k in ['coordinates','boundsStatus','spawnStatus','collisionStatus','paintStatus','ruleStatus']},
          'cachedManifestSha256':digest(p.read_bytes()),'verifiedHeadArrayFiles':receipts}
        result['native'].append(row); print(m['id'],round(area,2),round(row['projectedUnionSampleWU2'],2),flush=True)
    valid=[r for r in result['native'] if 'error' not in r]
    keys=['widthWU','lengthZWU','boundsAreaWU2','spawnDistance3DWU','clippedUpwardSurfaceSumWU2','clippedUpwardProjectedSumWU2','projectedUnionSampleWU2','runtimeTurfArea','clippedRuntimeTurfAreaWU2','overlapSpanAtLeast2_5SampleWU2']
    result['nativeSummary']={'n':len(valid),**{k:{'min':min(r[k] for r in valid),'median':statistics.median(r[k] for r in valid),'max':max(r[k] for r in valid)} for k in keys}}
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result['nativeSummary'],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
