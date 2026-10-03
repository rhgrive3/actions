# INKWAVE 髪 v4 の共通部品（GUI の Blender 内で exec する）
import bpy, bmesh, numpy as np
from mathutils import Vector, Matrix
X0=0.004
def col(name='HAIR_V4'):
    c=bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    return c
def clear(prefix):
    for o in list(bpy.data.objects):
        if o.name.startswith(prefix): bpy.data.objects.remove(o)
def mat(name,rgb,rough,metal=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*[min(1,c*1.4+0.02) for c in rgb],1); m.roughness=rough; m.metallic=metal; return m
def mirror(P): P=np.array(P,float).copy(); P[...,0]=2*X0-P[...,0]; return P
