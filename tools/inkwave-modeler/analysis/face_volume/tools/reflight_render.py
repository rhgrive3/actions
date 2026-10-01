"""Like render_face.py, but the scene lights are replaced (for this render only, nothing is saved) by a soft light from the
front and above plus an even ambient, close to the reference sheet's lighting, so the SHAPE can be compared by its shading.
blender -b x.blend --python reflight_render.py -- <out_dir> [scale] ; env LOOKS/VIEWS/BOX/SAMPLES as render_face.py"""
import sys, runpy, numpy as np, bpy
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent.parent/'multiview'))
import mvcore as M
from mathutils import Vector
for o in bpy.data.objects:
    if o.type=='LIGHT': o.hide_render=True
def sun(name,h,energy,angle,color=(1,1,1)):
    d=bpy.data.lights.new(name,'SUN'); d.energy=energy; d.angle=angle; d.color=color
    o=bpy.data.objects.new(name,d); bpy.context.scene.collection.objects.link(o)
    w=M.to_world(np.array([h]))[0]-M.to_world(np.zeros((1,3)))[0]
    o.rotation_euler=Vector(w).normalized().to_track_quat('Z','Y').to_euler()
sun('REF_KEY',(0.0,0.3,0.95),1.3,1.5,(1.0,0.96,0.92))
sun('REF_BOUNCE',(0.0,-0.55,0.84),0.9,1.5,(1.0,0.93,0.88))   # light from below: the reference's undersides (nose, lip) are lit
w=bpy.context.scene.world
for n in w.node_tree.nodes:
    if n.type=='BACKGROUND':
        for l in list(n.inputs[0].links): w.node_tree.links.remove(l)
        n.inputs[0].default_value=(0.62,0.64,0.68,1); n.inputs[1].default_value=1.5
runpy.run_path(str(HERE/'render_face.py'),run_name='__main__')
