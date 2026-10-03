# sidelight.py -- OUT side_energy key_energy elev : two suns from both sides (head frame), corneas excluded
import bpy, sys, numpy as np
from mathutils import Vector
sys.path.insert(0,'/tmp/inkjaw/tools/inkwave-modeler/scripts')
import inkwave_eye_refine as er
a=sys.argv[sys.argv.index("--")+1:]; out=a[0]; se=float(a[1]); ke=float(a[2]); el=float(a[3]); fr=float(a[4]) if len(a)>4 else 0.35
M=er.M
bpy.data.objects['KEY'].data.energy=ke
corneas=bpy.data.collections.get('INKWAVE_eye_look_corneas')
for name,sx in (('SIDE_R',-1.0),('SIDE_L',1.0)):
    l=bpy.data.lights.new(name,'SUN'); l.energy=se; l.angle=0.35; l.color=(1.0,0.95,0.9)
    o=bpy.data.objects.new(name,l); bpy.data.objects['KEY'].users_collection[0].objects.link(o)
    src=np.array([[sx,el,fr]]); src/=np.linalg.norm(src)       # from the side, a little above and in front
    d=M.to_world(-src)[0]-M.to_world(np.zeros((1,3)))[0]; d/=np.linalg.norm(d)
    o.rotation_euler=Vector(-d).to_track_quat('Z','Y').to_euler()
    if corneas: o.light_linking.receiver_collection=corneas
bpy.ops.wm.save_as_mainfile(filepath=out)
print('SIDELIGHT',se,ke,el,'corneas excluded',bool(corneas))
