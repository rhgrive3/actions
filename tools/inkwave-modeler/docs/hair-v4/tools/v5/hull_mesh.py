# 外形のボクセル → 点 → Points to Volume → Volume to Mesh（標準の Geometry Nodes）
import bpy, numpy as np
d=np.load('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/hull_fine.npz'); vol=d['vol']; xs,ys,zs=d['xs'],d['ys'],d['zs']
I=np.argwhere(vol); P=np.stack([xs[I[:,0]],ys[I[:,1]],zs[I[:,2]]],1)
for o in list(bpy.data.objects):
    if o.name=='V5_hull': bpy.data.objects.remove(o)
me=bpy.data.meshes.new('V5_hull'); me.from_pydata(P.tolist(),[],[])
o=bpy.data.objects.new('V5_hull',me)
col=bpy.data.collections.get('V5_WORK') or bpy.data.collections.new('V5_WORK')
if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
col.objects.link(o)
g=bpy.data.node_groups.get('V5_hullgn')
if g: bpy.data.node_groups.remove(g)
g=bpy.data.node_groups.new('V5_hullgn','GeometryNodeTree')
g.interface.new_socket('Geometry',in_out='INPUT',socket_type='NodeSocketGeometry'); g.interface.new_socket('Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
N=g.nodes; L=g.links; gi=N.new('NodeGroupInput'); go=N.new('NodeGroupOutput')
m2p=N.new('GeometryNodeMeshToPoints'); m2p.inputs['Radius'].default_value=0.0022
p2v=N.new('GeometryNodePointsToVolume'); p2v.inputs['Density'].default_value=1.0
try: p2v.resolution_mode='VOXEL_SIZE'
except Exception: pass
for k in ('Voxel Size',):
    if k in p2v.inputs: p2v.inputs[k].default_value=0.0015
p2v.inputs['Radius'].default_value=0.0022
v2m=N.new('GeometryNodeVolumeToMesh'); v2m.inputs['Threshold'].default_value=0.3
L.new(gi.outputs[0],m2p.inputs[0]); L.new(m2p.outputs[0],p2v.inputs[0]); L.new(p2v.outputs[0],v2m.inputs[0]); L.new(v2m.outputs[0],go.inputs[0])
md=o.modifiers.new('hull','NODES'); md.node_group=g
sm=o.modifiers.new('Smooth','SMOOTH'); sm.iterations=15; sm.factor=0.8
mat=bpy.data.materials.get('V5_hull_mat') or bpy.data.materials.new('V5_hull_mat'); mat.diffuse_color=(0.9,0.3,0.9,1)
o.data.materials.append(mat)
__result__=len(P)
