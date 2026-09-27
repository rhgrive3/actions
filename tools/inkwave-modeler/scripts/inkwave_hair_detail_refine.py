"""Continue from the integrated v5 master: scalp flow, stray lock, ear clearance.
All changes are confined to HAIR. The reviewed result must be integrated with
inkwave_hair_apply.py, which carries explicit hair deletion metadata.
"""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from inkwave_hair_apply import protected
from inkwave_hair_refine import smooth


def coords(o):
 a=np.empty(len(o.data.vertices)*3,np.float32);o.data.vertices.foreach_get('co',a);return a.reshape(-1,3).astype(float)
def put(o,a):
 o.data.vertices.foreach_set('co',a.astype(np.float32).ravel())
 o.data.normals_split_custom_set(np.zeros((len(o.data.loops),3),np.float32))
 for p in o.data.polygons:p.use_smooth=True
 o.data.update()
def tree(o):
 return BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[list(f.vertices) for f in o.data.polygons],all_triangles=False)

def surface_detail(out):
 out.mkdir(parents=True,exist_ok=True)
 H,W=512,256;u=(np.arange(W)[None,:]+.5)/W;v=(np.arange(H)[:,None]+.5)/H
 maps={}
 for label,freq,perimeter,length in [('scalp',28,.55,.16),('ribbon',5,.10,.24)]:
  phase=2*np.pi*(freq*u+.18*np.sin(v*4))
  envelope=smooth(.06,.25,v)*(1-smooth(.88,1,v))
  height=.00012*envelope*(.7*np.sin(phase)+.3*np.sin(phase*2+.8))
  du=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*W/2/perimeter
  dv=np.gradient(height,axis=0)*H/length
  normal=np.stack([-du,-dv,np.ones_like(du)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
  im=bpy.data.images.new('HAIR_DETAIL_NORMAL_'+label,width=W,height=H,alpha=True);im.colorspace_settings.name='Non-Color'
  rgba=np.concatenate([normal*.5+.5,np.ones((H,W,1))],axis=-1).astype(np.float32);im.pixels.foreach_set(rgba.ravel());im.update()
  im.filepath_raw=str(out/(label+'_normal.png'));im.file_format='PNG';im.save();im.pack();maps[label]=im
 for o in bpy.data.objects:
  if o.name=='HAIR_scalp':label='scalp'
  elif o.name.startswith('HAIR_strand_') and int(o.name.split('_')[2])>=32:label='ribbon'
  else:continue
  m=o.data.materials[0];nodes=m.node_tree.nodes;links=m.node_tree.links;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
  assert not bs.inputs['Normal'].is_linked,'Existing hair normals would be replaced'
  tex=nodes.new('ShaderNodeTexImage');tex.name='INKWAVE_HAIR_FINE_GROOVES';tex.image=maps[label]
  norm=nodes.new('ShaderNodeNormalMap');norm.name='INKWAVE_HAIR_FINE_GROOVE_NORMAL';norm.inputs['Strength'].default_value=.7
  links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs['Normal']);links.new(norm.outputs['Normal'],bs.inputs['Coat Normal'])
  if label=='scalp':bs.inputs['Roughness'].default_value=.31;bs.inputs['Coat Roughness'].default_value=.13

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 root=bpy.data.objects['HAIR'];assert root.get('referenceHairRevision')=='20260927-v5','Requires integrated v5 hair'
 before=protected();changes=[]
 removed=[o.name for o in bpy.data.objects if o.name.startswith('HAIR_strand_') and (12<=int(o.name.split('_')[2])<32 or int(o.name.split('_')[2])==41)]
 cap=bpy.data.objects['HAIR_scalp'];ca=coords(cap).reshape(-1,73,3);cap_before=ca.copy()
 # Soften the sawtooth nape edge without changing the crown.
 for row,blend in [(0,.72),(1,.42),(2,.16)]:
  ring=ca[row,:72].copy();avg=ring.copy()
  for _ in range(3):avg=.5*avg+.25*np.roll(avg,1,axis=0)+.25*np.roll(avg,-1,axis=0)
  ca[row,:72]=ring+(avg-ring)*blend;ca[row,72]=ca[row,0]
 # Raise the front-left cap edge into a diagonal part rather than a straight shelf.
 head=tree(bpy.data.objects['HEAD_face'])
 for row,weight in enumerate([1,.72,.40,.15,0]):
  for j,v in enumerate(ca[row]):
   mask=float((1-smooth(-.045,.015,v[1]))*(1-smooth(-.015,.045,v[0])))
   if mask<.001 or weight==0:continue
   q,n,_,_=head.find_nearest(Vector(v+[0,0,.021*mask*weight]))
   if np.dot(np.array(n),np.array(q)-np.array([0,.02,1.39]))<0:n=-n
   target=np.array(q+n*(.0008+row*.0008))
   ca[row,j]=v+(target-v)*mask*weight
 put(cap,ca.reshape(-1,3));changes.append({'name':cap.name,'max_mm':float(np.linalg.norm(ca-cap_before,axis=2).max()*1000)})
 for o in list(bpy.data.objects):
  if not o.name.startswith('HAIR_strand_') or o.name in removed:continue
  si=int(o.name.split('_')[2])
  if si==40:
   # The former nape curl passed through the ear. Route its entire root behind it.
   v=coords(o).reshape(-1,13,3);old=v.copy();cent=v[:,:12].mean(1);t=np.linspace(0,1,len(v))
   points=np.array([[-.082,.100,1.47],[-.094,.115,1.437],[-.107,.119,1.392],[-.118,.111,1.349],[-.112,.095,1.319],[-.090,.075,1.323]])
   knots=np.linspace(0,1,len(points));cs=np.stack([np.interp(t,knots,points[:,i]) for i in range(3)],axis=1)
   # Cubic smoothing of interior centres, preserving the root and curl tip.
   for _ in range(3):cs[1:-1]=(cs[:-2]+2*cs[1:-1]+cs[2:])/4
   oldtan=np.gradient(cent,axis=0);newtan=np.gradient(cs,axis=0)
   for j in range(len(v)):
    rot=Vector(oldtan[j]).rotation_difference(Vector(newtan[j]));v[j]=cs[j]+np.array([rot@Vector(d) for d in old[j]-cent[j]])*.85
   put(o,v.reshape(-1,3));changes.append({'name':o.name,'max_mm':float(np.linalg.norm(v-old,axis=2).max()*1000)})
 for name in removed:
  if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
 surface_detail(a.out.parent/'detail-textures')
 root['referenceHairRevision']='20260927-v6-detail'
 root['hairRemovedObjects']=json.dumps(removed)
 assert protected()==before,'Non-hair data changed'
 a.out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(a.out))
 a.out.with_suffix('.detail.json').write_text(json.dumps({'revision':root['referenceHairRevision'],'changed':changes,'removed':removed,'protected':before},indent=2,default=str))
 print('DETAIL_SCULPT_PASS',len(changes),'changed; stray removed; protected scene unchanged')
if __name__=='__main__':main()
