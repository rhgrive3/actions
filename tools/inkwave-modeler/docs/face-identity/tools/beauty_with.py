"""apply identity params (or none) then run render_face.py.  blender -b base.blend --python beauty_with.py -- params|none outdir [scale]"""
import sys, json, importlib.util
argv = sys.argv[sys.argv.index('--') + 1:]
spec = importlib.util.spec_from_file_location('idmod', '/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/scripts/inkwave_face_identity.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
if argv[0] != 'none':
    m.restore(); print('STATS', json.dumps(m.apply(json.load(open(argv[0])))))
sys.argv = sys.argv[:sys.argv.index('--') + 1] + argv[1:]
exec(open('/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools/render_face.py').read())
