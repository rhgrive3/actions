"""blender -b x.blend --python bake_front.py -- <out_dir> : front-camera render of the bare skin round the nose and mouth
(nose / lip / mouth-line / nostril decals hidden) under the reference-like light, camera box 120,125..245,225 at 4x.
Nothing is saved to the .blend.  STUDIO=1 keeps the scene's own lights."""
import sys, os, runpy, bpy
for n in ('HEAD_skin_03', 'HEAD_skin_06', 'HEAD_skin_07', 'HEAD_skin_08', 'HEAD_skin_09'):
    bpy.data.objects[n].hide_render = True
os.environ.update(LOOKS='beauty', VIEWS='front', BOX='front=120,125,245,225', SAMPLES=os.environ.get('SAMPLES', '64'))
out = sys.argv[sys.argv.index('--') + 1]
sys.argv = sys.argv[:sys.argv.index('--') + 1] + [out, '4']
HERE = os.path.dirname(os.path.abspath(__file__))
runpy.run_path(os.path.join(HERE, 'render_face.py' if os.environ.get('STUDIO') else 'reflight_render.py'), run_name='__main__')
