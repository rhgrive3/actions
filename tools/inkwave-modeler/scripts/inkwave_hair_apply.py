"""Apply the reviewed HAIR library to a newer master, preserving other work.
blender -b latest.blend --python scripts/inkwave_hair_apply.py -- \
 --hair blender/INKWAVE_HAIR_REFINED.blend --out merged.blend --export merged.glb --report receipt.json
This never opens/replaces the whole donor scene and does not edit non-hair objects.
Missing strands are removed only when listed by the donor's hairRemovedObjects.
"""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from inkwave_hair_refine import mesh_hash

def protected():
 objects={}
 for o in bpy.data.objects:
  if o.name.startswith('HAIR'):continue
  data={'type':o.type,'matrix':np.asarray(o.matrix_world).tolist(),'parent':o.parent.name if o.parent else None,'hide_render':o.hide_render}
  if o.type=='MESH':data['mesh']=mesh_hash(o)
  objects[o.name]=data
 # Hash packed non-hair material images and material parameter values as well.
 mats={m for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('HAIR') for m in o.data.materials if m}
 materials={}
 for m in mats:
  nodes=[]
  if m.use_nodes:
   for n in m.node_tree.nodes:
    d={'name':n.name,'type':n.type,'inputs':{s.name:list(s.default_value) if hasattr(s.default_value,'__len__') else s.default_value for s in n.inputs if hasattr(s,'default_value')}}
    if n.type=='TEX_IMAGE' and n.image:
     d['image']=n.image.name;d['packed_sha256']=hashlib.sha256(n.image.packed_file.data).hexdigest() if n.image.packed_file else None
    nodes.append(d)
  materials[m.name]={'nodes':nodes,'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links] if m.use_nodes else []}
 return {'objects':objects,'materials':materials}

def main():
 p=argparse.ArgumentParser();p.add_argument('--hair',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--export',type=Path);p.add_argument('--report',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 before=protected();source=bpy.data.filepath;pre=set(bpy.data.objects)
 names=sorted(o.name for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('HAIR'))
 original_materials={m for n in names for m in bpy.data.objects[n].data.materials if m}
 assert all(all(o.name.startswith('HAIR') for o in bpy.data.objects if o.type=='MESH' and m.name in o.data.materials) for m in original_materials),'Hair material shared with another part'
 old_images={n.image for m in original_materials if m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
 with bpy.data.libraries.load(str(a.hair),link=False) as (src,dst):
  assert 'HAIR' in src.objects,'Donor must include the HAIR metadata object'
  donor_names={n for n in src.objects if n.startswith('HAIR') and n!='HAIR'}
  assert donor_names<=set(names),'Donor adds hair objects; an explicit addition workflow is required'
  present=[n for n in names if n in src.objects]
  dst.objects=present+['HAIR']
  image_names=list(src.images)
  dst.images=list(image_names)
 imported=list(dst.objects[:-1]);donor_root=dst.objects[-1]
 imported_images=list(dst.images)
 revision=donor_root.get('referenceHairRevision')
 assert isinstance(revision,str) and revision,'Donor lacks a hair revision'
 removed=json.loads(donor_root.get('hairRemovedObjects','[]'))
 assert isinstance(removed,list) and all(isinstance(n,str) and n.startswith('HAIR_strand_') for n in removed),'Invalid removal manifest'
 assert set(names)-set(present)<=set(removed),'Donor misses hair objects without an explicit removal manifest'
 assert not set(present)&set(removed),'Donor both supplies and removes a hair object'
 newmat_names={};newmesh_names={}
 old_meshes=[]
 for name,donor in zip(present,imported):
  current=bpy.data.objects[name];old_meshes.append(current.data)
  newmesh_names[donor.data]=current.data.name
  assert len(current.data.vertices)==len(donor.data.vertices) and len(current.data.polygons)==len(donor.data.polygons),'Hair topology changed'
  for old,new in zip(current.data.materials,donor.data.materials):newmat_names[new]=old.name
  current.data=donor.data
 for name in set(names)-set(present):
  old_meshes.append(bpy.data.objects[name].data)
  bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
 for o in set(bpy.data.objects)-pre:bpy.data.objects.remove(o,do_unlink=True)
 for m in old_meshes:
  if m.users==int(m.use_fake_user):bpy.data.meshes.remove(m)
 for m in original_materials:
  if m.users==int(m.use_fake_user):bpy.data.materials.remove(m)
 for m,name in newmat_names.items():m.name=name
 for im in old_images:
  if im.users==int(im.use_fake_user):bpy.data.images.remove(im)
 for mesh,name in newmesh_names.items():mesh.name=name
 # Stable hair-owned image names prevent .001/.002 drift on repeated imports.
 for image,name in zip(imported_images,image_names):
  image.name=name if name.startswith('HAIR_ASSET_') else 'HAIR_ASSET_'+name
 bpy.data.objects['HAIR']['referenceHairRevision']=revision
 bpy.data.objects['HAIR']['hairRemovedObjects']=json.dumps(removed)
 after=protected();assert before==after,'Protected scene data changed'
 a.out.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(a.out))
 if a.export:
  root=bpy.data.objects['INKWAVE_CHARACTER'];bpy.ops.object.select_all(action='DESELECT')
  for o in [root]+list(root.children_recursive):o.select_set(True)
  bpy.context.view_layer.objects.active=root
  bpy.ops.export_scene.gltf(filepath=str(a.export),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
 report={'source':source,'donor':str(a.hair),'output':str(a.out),'blender':bpy.app.version_string,'revision':revision,'removed':sorted(set(names)-set(present)),'hair_meshes':len(present),'non_hair_objects_unchanged':len(before['objects']),'non_hair_materials_unchanged':len(before['materials']),'protected':before,'pass':True}
 a.report.write_text(json.dumps(report,indent=2,default=str));print('HAIR_MERGE_PASS',len(present),'hair meshes;',len(before['objects']),'protected objects')
if __name__=='__main__':main()
