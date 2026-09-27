"""Reference hair sculpt. Run on a fresh master; changes only HAIR meshes/materials.
blender -b MASTER.blend --python scripts/inkwave_hair_refine.py -- --out candidate.blend
Original topology, UVs, hierarchy and all non-hair data are retained.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
import numpy as np

def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def mesh_hash(o):
 h=hashlib.sha256()
 for seq,attr,n,dt in [(o.data.vertices,'co',3,np.float32),(o.data.loops,'vertex_index',1,np.int32)]:
  a=np.empty(len(seq)*n,dt);seq.foreach_get(attr,a);h.update(a.tobytes())
 h.update(np.array(o.matrix_world).tobytes())
 for uv in o.data.uv_layers:
  a=np.empty(len(uv.data)*2,np.float32);uv.data.foreach_get('uv',a);h.update(a.tobytes())
 h.update('|'.join(m.name for m in o.data.materials).encode())
 return h.hexdigest()

def texture(m,si,club,tip,out):
 """Packed UV maps, including the irregular sucker markings, usable in glTF."""
 H,W=1024,256
 t=1-(np.arange(H)[:,None]+.5)/H;u=(np.arange(W)[None,:]+.5)/W
 # The two broad faces have teal centres and earlier lime at their rolled margins.
 edge=np.abs(np.cos(u*math.tau))
 start=(.77+.11*np.cos(u*math.tau)) if club else tip
 g=smooth(start,.985,t)
 root=np.array([.012,.245,.255]);end=np.array([.65,.98,.06])
 if si==32 or si==41:end=np.array([.30,.79,.66])
 col=root[None,None,:]*(1-g[...,None])+end[None,None,:]*g[...,None]
 col=np.broadcast_to(col,(H,W,3)).copy()
 streak=(.025*np.sin(u*math.tau*19 + .9*np.sin(t*5+si)) + .012*np.sin(u*math.tau*43+t*6))
 col*=1+streak[...,None]
 # Narrow, soft longitudinal mint streaks; colour variation, no painted specular.
 ridge=np.maximum(0,np.cos(u*math.tau*7+t*1.5+si*.83))**24
 col+=ridge[...,None]*np.array([.025,.035,.032])*(1-g[...,None])
 dots=np.zeros((H,W),np.float64)
 if club:
  # Broad-face UV centres are 0.25 and 0.75. Fewer, larger, varied suckers.
  marks=[(.635,.23,.008,.017),(.678,.14,.010,.021),(.701,.33,.012,.026),(.746,.12,.015,.030),(.762,.26,.019,.036),(.795,.385,.017,.032),(.819,.07,.016,.028),(.842,.205,.024,.044),(.874,.36,.020,.036),(.904,.105,.018,.031),(.928,.265,.024,.040),(.952,.405,.015,.029),(.975,.12,.014,.028)]
  for tv,uv,rt,ru in marks:
   tv+=.006*math.sin(si+uv*9)
   for shift in [0,.5]:
    d=np.sqrt(((t-tv)/rt)**2+((u-uv-shift)/ru)**2)
    mask=1-smooth(.87,1.05,d)
    ring=1-.12*np.exp(-((d-.67)/.08)**2)
    dots=np.maximum(dots,mask)
    pale=np.array([.80,.99,.54])*(ring[...,None])
    col=col*(1-mask[...,None])+pale*mask[...,None]
 col=np.clip(col,0,1)
 emit=col*(.015+.14*g[...,None])+dots[...,None]*np.array([.015,.020,.005])
 # Encode linear colours into standard sRGB PNGs for Blender and glTF alike.
 for socket,values,kind in [('Base Color',col,'color'),('Emission Color',emit,'emission')]:
  bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  node=bs.inputs[socket].links[0].from_node
  old=node.image
  image=bpy.data.images.new('HAIR_REFERENCE_%02d_%s'%(si,kind),width=W,height=H,alpha=True)
  image.colorspace_settings.name='Non-Color'
  encoded=np.where(values<=.0031308,values*12.92,1.055*np.maximum(values,0)**(1/2.4)-.055)
  rgba=np.concatenate([encoded,np.ones((H,W,1))],axis=2).astype(np.float32)
  image.pixels.foreach_set(rgba.ravel());image.update()
  image.filepath_raw=str(out/('%02d_%s.png'%(si,kind)));image.file_format='PNG';image.save()
  path=image.filepath_raw;name=image.name;bpy.data.images.remove(image)
  image=bpy.data.images.load(path,check_existing=False);image.name=name;image.colorspace_settings.name='sRGB';image.pack()
  node.image=image
 bs.inputs['Roughness'].default_value=.27
 bs.inputs['Coat Roughness'].default_value=.12
 bs.inputs['Coat Weight'].default_value=.8
 # Fresnel uses the base texture node; it follows the new colour automatically.

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True);ap.add_argument('--textures',type=Path);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
 assert not bpy.data.objects['HAIR'].get('referenceHairRevision'),'Use an unmodified baseline; sculpt is not cumulative.'
 args.out.parent.mkdir(parents=True,exist_ok=True)
 tex=args.textures or args.out.parent/'hair-textures';tex.mkdir(parents=True,exist_ok=True)
 source_path=bpy.data.filepath
 before={o.name:mesh_hash(o) for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('HAIR')}
 changed=[]
 for o in bpy.data.objects:
  if not o.name.startswith('HAIR_strand'):continue
  si=int(o.name.split('_')[2]);club=si in (0,1,6,7);cols=19 if club else 13
  a=np.empty(len(o.data.vertices)*3,np.float32);o.data.vertices.foreach_get('co',a);a=a.reshape(-1,cols,3).astype(float)
  orig=a.copy();cent=a[:,:-1].mean(axis=1,keepdims=True);d=a-cent;t=np.linspace(0,1,len(a))[:,None]
  if si<12:
   # Keep each tied root fixed. Open the paddle, then curl its pointed tip inward.
   side=1 if si<6 else -1
   if club:
    bulge=np.exp(-((t-.82)/.15)**2)
    a=cent+d*(1+.22*bulge[...,None])
    a[:,:,0]-=side*.017*smooth(.79,1,t)
    if si in (1,7):a[:,:,2]+=.044*smooth(.40,1,t)
    # Reference outer silhouette flares just below the shoulder, with a softer bend.
    a[:,:,0]+=side*.009*np.exp(-((t-.68)/.12)**2)
    # Calibrated front-sheet silhouette correction (448 x 560 sheet).
    # Each tail keeps its own asymmetry; corrections fade out above the shoulder.
    rows=np.array([100,110,120,130,140,150,160,170,180,190,200,210])
    dx=np.array([0,0,3,0,-2,-1,-6,-5,-4,-1,0,0] if side<0 else [0,0,-6,-3,-2,-3,-2,0,-1,-4,0,0])
    field=np.interp(np.arange(560),rows,dx)
    kernel=np.exp(-(np.arange(-12,13)/4)**2/2);kernel/=kernel.sum()
    field=np.convolve(field,kernel,mode='same')
    ysheet=(1334-a[:,:,2]*842)/(1402/560)
    a[:,:,0]+=np.interp(ysheet,np.arange(560),field)/(842/(1122/448))
   elif si in (2,3,8,9):
    # Fine pointed overlapping locks above the broad, dotted paddle.
    a=cent+d*(1+.22*smooth(.4,.8,t))[...,None]
    a[:,:,0]+=side*.025*smooth(.55,1,t)
    a[:,:,2]-=.008*smooth(.5,1,t)
   a[:,:,2]-=(.025 if side<0 else .013)*smooth(1.49,1.59,a[:,:,2])
  elif si in range(12,32):
   # Flatten the scalp ribbons onto the cap, preserving their combed direction.
   n=cent-np.array([0,.025,1.39]);n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-9)
   amount=1-smooth(.45,.95,t)
   a-=n*(np.sum(d*n,axis=2,keepdims=True)*.60+.0025)*amount[...,None]
  elif si in range(32,38):
   # Distinct swept locks rather than a wide fan. Shape tips independently.
   shifts={32:(-.011,-.002,.002),33:(-.006,.007,-.016),34:(-.022,.014,.002),35:(-.040,.023,.019),36:(-.017,.010,.010),37:(-.009,.005,.0)}
   delta=np.array(shifts[si]);a+=smooth(.12,1,t)[...,None]*delta
   # Narrow only the last third, producing the curved tapered tips of the sheet.
   c=a[:,:-1].mean(axis=1,keepdims=True);a=c+(a-c)*(1-.18*smooth(.55,.98,t))[...,None]
  elif si in (38,39,40):
   a=cent+d*(1+.45*smooth(.20,.7,t))[...,None]
   a[:,:,0]+=(1 if si in (38,39) else -1)*(.010*smooth(.25,.85,t)-.015*smooth(.8,1,t))
   a[:,:,2]-=.004*smooth(.45,1,t)
  if not np.allclose(a,orig,atol=1e-9):
   o.data.vertices.foreach_set('co',a.astype(np.float32).ravel())
   # Imported split normals describe the old surface; zero selects recalculated normals.
   o.data.normals_split_custom_set(np.zeros((len(o.data.loops),3),dtype=np.float32))
   for f in o.data.polygons:f.use_smooth=True
   o.data.update()
   changed.append({'name':o.name,'max_displacement_mm':round(float(np.linalg.norm(a-orig,axis=2).max())*1000,3)})
  tips={32:.72,33:.69,34:.65,35:.58,36:.74,37:.88,38:.52,39:.59,40:.55,41:.85}
  if si<12 or si>=32:
   tip=tips.get(si,.50 if si%6==4 else .58)
   texture(o.data.materials[0],si,club,tip,tex)
 after={o.name:mesh_hash(o) for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('HAIR')}
 assert before==after,'Non-hair geometry changed'
 bpy.data.objects['HAIR']['referenceHairRevision']='20260927-v5'
 bpy.ops.wm.save_as_mainfile(filepath=str(args.out))
 report={'source':source_path,'blender':bpy.app.version_string,'changed_meshes':changed,'non_hair_meshes_unchanged':len(before),'non_hair_hashes':before,'output':str(args.out)}
 args.out.with_suffix('.hair-report.json').write_text(json.dumps(report,indent=2))
 print('HAIR_REFINE_COMPLETE',len(changed),'meshes;',len(before),'non-hair meshes preserved')
if __name__=='__main__':main()
