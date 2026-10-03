import bpy
assert 'INKWAVE_CHARACTER_MASTER' not in bpy.data.filepath
n=0
for o in list(bpy.data.collections['HAIR'].all_objects):
    if o.type=='MESH': bpy.data.objects.remove(o); n+=1
__result__=(n,bpy.data.filepath)
