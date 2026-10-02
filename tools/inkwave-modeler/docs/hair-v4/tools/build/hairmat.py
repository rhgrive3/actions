# 髪のマテリアル: hair_t（根元 0 → 先 1）で 青緑 → ライム。つや、少し透ける。
import bpy
def hair_material(name='V4_hair', t0=0.55, t1=0.95):
    m=bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; N=nt.nodes; L=nt.links
    b=N.get('Principled BSDF')
    at=N.new('ShaderNodeAttribute'); at.attribute_name='hair_t'; at.attribute_type='GEOMETRY'
    cr=N.new('ShaderNodeValToRGB'); e=cr.color_ramp.elements
    e[0].position=t0; e[0].color=(0.012,0.33,0.40,1); e[1].position=t1; e[1].color=(0.62,0.95,0.12,1)
    mid=e.new((t0+t1)/2); mid.color=(0.10,0.62,0.45,1)
    L.new(at.outputs['Fac'],cr.inputs[0]); L.new(cr.outputs[0],b.inputs['Base Color'])
    b.inputs['Roughness'].default_value=0.12
    for k in ('Coat Weight',):
        if k in b.inputs: b.inputs[k].default_value=0.6
    if 'Subsurface Weight' in b.inputs:
        b.inputs['Subsurface Weight'].default_value=0.35; L.new(cr.outputs[0],b.inputs['Subsurface Color']) if 'Subsurface Color' in b.inputs else None
    if 'Transmission Weight' in b.inputs: b.inputs['Transmission Weight'].default_value=0.15
    m.diffuse_color=(0.05,0.55,0.62,1)
    return m
