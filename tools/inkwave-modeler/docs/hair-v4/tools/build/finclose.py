import bpy, sys
from mathutils import Vector
OUT=sys.argv[sys.argv.index('--')+1]
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=24; sc.cycles.use_denoising=True
cam=bpy.data.objects.new('CAM_fin',bpy.data.cameras.new('CAM_fin')); sc.collection.objects.link(cam)
t=Vector((0.34,0.29,1.08)); cam.location=t+Vector((0.35,-0.45,0.05)); cam.rotation_euler=(t-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=50
sc.camera=cam; sc.render.resolution_x=600; sc.render.resolution_y=600; sc.render.filepath=OUT; bpy.ops.render.render(write_still=True)
