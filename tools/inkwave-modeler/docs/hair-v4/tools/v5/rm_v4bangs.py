import bpy
for n in ('V4_bangs',):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
__result__=[o.name for o in bpy.data.collections['HAIR_V4'].objects]
