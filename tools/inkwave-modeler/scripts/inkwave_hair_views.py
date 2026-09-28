import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
sc=bpy.context.scene
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=20;sc.cycles.use_denoising=True
sc.render.threads_mode='FIXED';sc.render.threads=8
sc.render.resolution_x=896;sc.render.resolution_y=480;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.film_transparent=True
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=0
cam=bpy.data.objects['INKWAVE_VALIDATION_CAMERA'];sc.camera=cam
cam.data.type='ORTHO';cam.data.sensor_fit='HORIZONTAL';cam.data.ortho_scale=1.334;cam.data.shift_x=cam.data.shift_y=0
views={'front':((-.006,-10,1.255),(-.006,0,1.255)), 'back':((0,10,1.255),(0,0,1.255)), 'side':((-10,0,1.255),(0,0,1.255)), 'three_quarter':((-6,-8,1.65),(0,.05,1.255)), 'top':((0,0,10),(0,.14,1.4))}
for v,(eye,target) in views.items():
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
 sc.render.filepath=str(out/(v+'.png'));bpy.ops.render.render(write_still=True)
print('HAIR_REVIEW_COMPLETE',str(out))
