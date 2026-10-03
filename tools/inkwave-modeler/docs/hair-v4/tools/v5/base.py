# 土台のふくらみ = 外形（hull）の前の部分。Volume to Mesh → 後ろ(y>YC)と下(z<ZC)を消す → なめらか → 内側へ縮める
import bpy, numpy as np
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/hull_mesh.py').read().split("md=o.modifiers.new")[0])   # V5_hull と GN 'V5_hullgn' を作り直す
h=bpy.data.objects['V5_hull']; h.hide_render=True; h.hide_set(True)
md=h.modifiers.new('hull','NODES'); md.node_group=bpy.data.node_groups['V5_hullgn']
for o in list(bpy.data.objects):
    if o.name=='V5_base': bpy.data.objects.remove(o)
b=h.copy(); b.data=h.data.copy(); b.name='V5_base'; bpy.data.collections['HAIR_V4'].objects.link(b)
b.hide_render=False; b.hide_set(False)
for m in list(b.modifiers): b.modifiers.remove(m)
g=bpy.data.node_groups.get('V5_basegn')
if g: bpy.data.node_groups.remove(g)
g=bpy.data.node_groups['V5_hullgn'].copy(); g.name='V5_basegn'
N=g.nodes; L=g.links; go=[n for n in N if n.bl_idname=='NodeGroupOutput'][0]; v2m=[n for n in N if n.bl_idname=='GeometryNodeVolumeToMesh'][0]
pos=N.new('GeometryNodeInputPosition'); sep=N.new('ShaderNodeSeparateXYZ'); L.new(pos.outputs[0],sep.inputs[0])
c1=N.new('FunctionNodeCompare'); c1.data_type='FLOAT'; c1.operation='GREATER_THAN'; L.new(sep.outputs['Y'],c1.inputs[0]); c1.inputs[1].default_value=YC
c2=N.new('FunctionNodeCompare'); c2.data_type='FLOAT'; c2.operation='LESS_THAN'; L.new(sep.outputs['Z'],c2.inputs[0]); c2.inputs[1].default_value=ZC
orr=N.new('FunctionNodeBooleanMath'); orr.operation='OR'; L.new(c1.outputs[0],orr.inputs[0]); L.new(c2.outputs[0],orr.inputs[1])
dl=N.new('GeometryNodeDeleteGeometry'); dl.domain='POINT'; L.new(v2m.outputs[0],dl.inputs[0]); L.new(orr.outputs[0],dl.inputs['Selection'])
L.new(dl.outputs[0],go.inputs[0])
m=b.modifiers.new('base','NODES'); m.node_group=g
s=b.modifiers.new('Smooth','SMOOTH'); s.iterations=30; s.factor=0.9
d=b.modifiers.new('Shrink','DISPLACE'); d.strength=-SHR; d.mid_level=0.0
b.data.materials.clear(); b.data.materials.append(bpy.data.materials['V4_hair_crown'])
for p in b.data.polygons: p.use_smooth=True
__result__='ok'
