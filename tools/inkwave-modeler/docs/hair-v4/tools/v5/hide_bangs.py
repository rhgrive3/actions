import bpy
o=bpy.data.objects.get('V5_bangs')
if o: o.data.materials.clear(); bpy.data.collections['HAIR_V4'].objects.unlink(o); (bpy.data.collections.get('V5_WORK') or bpy.data.collections.new('V5_WORK')).objects.link(o)
__result__='ok'
