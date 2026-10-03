# hit.py -- view x y [x y ...] : head-frame mm of the first hit at camera px
import sys, bpy, numpy as np
from mathutils import Vector
sys.path.insert(0,'/tmp/inkjaw/tools/inkwave-modeler/scripts')
import inkwave_eye_refine as er
a=sys.argv[sys.argv.index('--')+1:]; view=a[0]; pts=list(map(float,a[1:]))
sc=bpy.context.scene
for o in bpy.data.collections['FACE_FIT_ORIGINAL'].objects: o.hide_viewport=True; o.hide_set(True)
cam=bpy.data.objects['FACE_FIT_CAM_'+view]; w,h=[int(v) for v in cam['inkwave_resolution']]
sc.render.resolution_x,sc.render.resolution_y=w,h
dg=bpy.context.evaluated_depsgraph_get()
inv=(cam.calc_matrix_camera(dg,x=w,y=h,scale_x=1,scale_y=1)@cam.matrix_world.inverted()).inverted()
for px,py in zip(pts[::2],pts[1::2]):
    r=[]
    for z in (-1,1):
        p=inv@Vector((2*px/w-1,1-2*py/h,z,1)); r.append(Vector((p.x/p.w,p.y/p.w,p.z/p.w)))
    hit,loc,n,idx,obj,m=sc.ray_cast(dg,r[0],(r[1]-r[0]).normalized())
    print('HIT',px,py,obj.name if hit else '-', np.round(er.M.to_local(np.array([tuple(loc)]))[0]*1000,1) if hit else '')
