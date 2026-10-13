import pathlib,json,hashlib,os,sys,importlib,datetime
import numpy as np
repo=pathlib.Path('/workspace/actions');sys.path.insert(0,str(repo/'patches/native-stages/tools'));tool=importlib.import_module('build-native')
out=repo/'.codex-stage-sources/reviewed-v4';out.mkdir(exist_ok=True)
ids=['undertow','museum','mincemeat','flounder','barnacle','eeltail','hammerhead','crableg','airport','urchin','sturgeon','umami']
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1<<20):h.update(b)
 return h.hexdigest()
def mask_for(src):
 m=json.loads((src/'manifest.json').read_text());tri=np.memmap(src/'collision.bin',dtype='<f4',mode='r').reshape(-1,3,3);mask=np.zeros(m['gridCells'],dtype=np.uint8)
 for face in m['faces']:
  p=tri[face['triangles']].astype('f8');u=np.array(face['u']);v=np.array(face['v']);origin=p[0,0];rel=p-origin;xy=np.stack([rel@u,rel@v],axis=2);mn=xy.min(axis=(0,1));mx=xy.max(axis=(0,1));assert np.max(np.abs((mx-mn)-[face['su'],face['sv']]))<1e-10;assert np.max(np.abs(origin+u*mn[0]+v*mn[1]-np.array(face['origin'])))<1e-10;xy-=mn
  values=tool.raster_mask(xy,face['nu'],face['nv'],face['cu'],face['cv']);start=face['grid'];mask[start:start+len(values)]=values
 return m,mask
for id in ['scorch','hagglefish','inkblot','mako','brinewater']:
 src=repo/'.codex-stage-sources/generated'/id;_,mask=mask_for(src);assert hashlib.sha256(mask.tobytes()).hexdigest()==digest(src/'mask.bin'),id+' full-converter control mismatch';print(json.dumps({'control':id,'exactAcceptedV4Mask':True}),flush=True)
rows=[];summaries=[]
for id in ids:
 base=pathlib.Path('/workspace/stage-worktrees')/id/'.codex-stage-sources';src=base/('prepared' if id=='undertow' else 'generated')/id;dst=out/id
 assert src.is_dir() and not dst.exists(),id
 m,mask=mask_for(src);old=np.fromfile(src/'mask.bin',np.uint8);assert len(old)==len(mask) and not np.any((old!=0)&(mask==0)),id+' removes owned source cells'
 integrity=json.loads((src/'integrity.json').read_text());dst.mkdir()
 for rel,pin in integrity.items():
  p=src/rel;assert p.stat().st_size==pin['bytes'] and digest(p)==pin['sha256'],id+'/'+rel+' old integrity mismatch'
  if rel in ['mask.bin','manifest.json']:continue
  target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True);os.link(p,target)
 mask.tofile(dst/'mask.bin');m['maskDerivationRecipe']='inkwave-browser-source-v4';(dst/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')))
 fresh={p.relative_to(dst).as_posix():{'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(dst.rglob('*')) if p.is_file()};(dst/'integrity.json').write_text(json.dumps(fresh,separators=(',',':')))
 summary={k:v for k,v in m.items() if k not in ['faces','objects','materials','textureIntegrity']};summary.update(bytes=sum(x['bytes'] for x in fresh.values()),textureFiles=len(m['textureIntegrity']),validCells=int(mask.sum()),conversionSeconds=None);summaries.append(summary)
 row={'id':id,'source':str(src),'candidate':str(dst),'oldMaskSha256':digest(src/'mask.bin'),'newMaskSha256':digest(dst/'mask.bin'),'cells':len(mask),'beforeLive':int(old.sum()),'afterLive':int(mask.sum()),'removedCells':0,'otherBuffersAndTexturesExact':True,'originalAssetsMutated':False};rows.append(row);print(json.dumps(row),flush=True)
(out/'catalog.json').write_text(json.dumps({'schema':1,'sourceCommit':tool.REV,'stages':summaries},ensure_ascii=False,indent=2)+'\n')
(repo/'.ci-scratch/reviewed-v4-mask-refresh/refresh.json').write_text(json.dumps({'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRecipe':'v4','controlOriginalFiveMasksExact':True,'stages':rows,'workerParity':'pending'},ensure_ascii=False,indent=2)+'\n')
