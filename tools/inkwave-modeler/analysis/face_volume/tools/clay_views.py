"""blender -b x.blend --python clay_views.py -- <out_dir> [views]: clay (Workbench studio, single grey) renders of the head
from look-at cameras placed in the head frame (mm): top, top34, front, below, q34, side. Hair and clothes hidden."""
import sys, math
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-volume/tools/inkwave-modeler/analysis/multiview')
import bpy, numpy as np
from mathutils import Vector
from pathlib import Path
import mvcore as M
a=sys.argv[sys.argv.index('--')+1:];out=Path(a[0]);out.mkdir(parents=True,exist_ok=True)
T=np.array([0,-40.0,55.0])     # look-at target (mm): mid face
CAMS={'top':((0,300,60),(0,-30,60),0.20),'top34':((150,260,220),(0,-40,55),0.20),'front':((0,-30,500),(0,-30,55),0.19),
      'below':((0,-330,260),(0,-45,55),0.20),'q34':((330,-20,330),(0,-35,50),0.20),'side':((500,-30,40),(0,-35,40),0.20),
      'topclose':((0,300,70),(0,-50,70),0.13),'topcut':((0,300,60),(0,-60,60),0.19),'topcut2':((0,300,60),(0,-60,60),0.19)}
CLIP={'topcut':0.300+0.030,'topcut2':0.300+0.052}
views=a[1].split(',') if len(a)>1 else list(CAMS)
for o in bpy.data.objects:
    if o.type=='MESH':
        hide=any(c.name in('HAIR','HEADGEAR','CLOTHES','FACE_FIT_ORIGINAL') for c in o.users_collection) or not o.name.startswith(('HEAD','BODY'))
        o.hide_render=hide
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sh=sc.display.shading
sh.light='STUDIO';sh.color_type='SINGLE';sh.single_color=(0.62,0.62,0.62);sh.show_specular_highlight=True;sh.show_cavity=False
sc.display.render_aa='16';sc.view_settings.view_transform='Standard';sc.render.film_transparent=False
sc.render.resolution_x=1000;sc.render.resolution_y=1000;sc.render.resolution_percentage=100;sc.render.use_border=False
cd=bpy.data.cameras.new('CLAYCAM');cd.type='ORTHO';cam=bpy.data.objects.new('CLAYCAM',cd);sc.collection.objects.link(cam);sc.camera=cam
for v in views:
    p,t,s=CAMS[v];P=Vector(M.to_world(np.array([p])/1000)[0]);Tt=Vector(M.to_world(np.array([t])/1000)[0])
    up=Vector(M.to_world(np.array([[0,0,-1.0] if v.startswith('top') else [0,1.0,0]]))[0])-Vector(M.to_world(np.zeros((1,3)))[0])
    d=(Tt-P).normalized();cam.location=P
    cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    # roll so that 'up' is up
    import mathutils
    z=-d;x=up.cross(z).normalized();y=z.cross(x)
    cam.rotation_euler=mathutils.Matrix((x,y,z)).transposed().to_euler()
    cd.ortho_scale=s
    cd.clip_start=CLIP.get(v,0.01);cd.clip_end=2.0
    sc.render.filepath=str(out/f'{v}.png');bpy.ops.render.render(write_still=True)
print('CLAY done')
