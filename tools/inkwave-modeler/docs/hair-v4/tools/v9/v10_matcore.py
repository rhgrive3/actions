import bpy
for s in 'LR':
    o=bpy.data.objects.get('V4_tailcore_'+s)
    if o: o.data.materials.clear(); o.data.materials.append(bpy.data.materials['V4_hair'])
__result__='ok'
