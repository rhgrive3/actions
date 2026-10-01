"""blender -b x.blend --python nose_clay.py -- out_dir : clay close-ups of the nose and mouth (decals hidden): front camera
direction, from below (35 deg), 3/4.  Ortho, 60 mm wide."""
import sys, math
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent.parent.parent/'multiview'))
import bpy, numpy as np, mathutils
from mathutils import Vector
from pathlib import Path
import mvcore as M
out=Path(sys.argv[sys.argv.index('--')+1]); out.mkdir(parents=True,exist_ok=True)
for o in bpy.data.objects:
    if o.type=='MESH':
        o.hide_render = o.name not in ('HEAD_face',)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sh=sc.display.shading
sh.light='STUDIO'; sh.color_type='SINGLE'; sh.single_color=(0.62,0.62,0.62); sh.show_specular_highlight=True; sh.show_cavity=True; sh.cavity_type='WORLD'
sc.display.render_aa='16'; sc.view_settings.view_transform='Standard'; sc.render.film_transparent=False
sc.render.resolution_x=900; sc.render.resolution_y=900; sc.render.resolution_percentage=100; sc.render.use_border=False
cd=bpy.data.cameras.new('NC'); cd.type='ORTHO'; cam=bpy.data.objects.new('NC',cd); sc.collection.objects.link(cam); sc.camera=cam
T=(0,-55,110)
for name,p in (('front',(-45,-42,600)),('below',(0,-400,400)),('q34',(330,-40,400)),('side',(600,-55,110))):
    P=Vector(M.to_world(np.array([p])/1000)[0]); Tt=Vector(M.to_world(np.array([T])/1000)[0])
    up=Vector(M.to_world(np.array([[0,1.0,0]]))[0])-Vector(M.to_world(np.zeros((1,3)))[0])
    z=(P-Tt).normalized(); x=up.cross(z).normalized(); y=z.cross(x)
    cam.location=P; cam.rotation_euler=mathutils.Matrix((x,y,z)).transposed().to_euler()
    cd.ortho_scale=0.06; cd.clip_start=0.01; cd.clip_end=3
    sc.render.filepath=str(out/f'{name}.png'); bpy.ops.render.render(write_still=True)
