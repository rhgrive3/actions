# 全身参照（1122x1402）と同じ正投影カメラ CAM_hi_{front,back,left}
import bpy
from mathutils import Vector
PX={'front':(566,1334,842),'back':(561,1338,847),'left':(575,1329,838)}
def hicam(view):
    name='CAM_hi_'+view
    o=bpy.data.objects.get(name)
    if o is None:
        o=bpy.data.objects.new(name,bpy.data.cameras.new(name)); bpy.context.scene.collection.objects.link(o)
    cx,gy,s=PX[view]; hc=(1122/2-cx)/s; vc=(gy-1402/2)/s
    o.location={'front':(hc,-10,vc),'back':(-hc,10,vc),'left':(10,-hc,vc)}[view]
    # left: 画像右 = -Y → +X 側から見る
    t=Vector((o.location.x if view in('front','back') else 0, o.location.y if view=='left' else 0, vc))
    o.rotation_euler=(t-o.location).to_track_quat('-Z','Y').to_euler()
    o.data.type='ORTHO'; o.data.ortho_scale=1402/s; o.data.sensor_fit='VERTICAL'; o.data.clip_end=30
    return o
def use_hi(view,scale=0.5):
    sc=bpy.context.scene; sc.camera=hicam(view); sc.render.resolution_x=int(1122*scale); sc.render.resolution_y=int(1402*scale); sc.render.resolution_percentage=100
