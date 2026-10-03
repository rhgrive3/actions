import bpy
for n in ('V5_side_bangs','V5_side_crown','V5_side_silver'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
__result__='ok'
