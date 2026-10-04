# finalmat.py -- OUT.blend : what the official build's last step (lash_rebuild remove_lower_paint) does to the face
# material: HEAD_face gets the plain skin (skin_b27050) back, so trial colours match the official build
import bpy, sys
face = bpy.data.objects['HEAD_face']; skin = bpy.data.materials['skin_b27050']
for i, s in enumerate(face.data.materials):
    if s is not None and s.name == 'INKWAVE_face_skin_lash':
        face.data.materials[i] = skin
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index('--') + 1])
