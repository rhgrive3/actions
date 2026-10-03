# projline.py -- out.json : jaw_tuck line (side plane, x on the face surface) projected to sideR/q34R px + face/torso border
import bpy, sys, json, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,'/tmp/inkjaw/tools/inkwave-modeler/scripts')
import inkwave_eye_refine as er
M=er.M
out=sys.argv[sys.argv.index('--')+1]
p=json.load(open('/tmp/inkjaw/tools/inkwave-modeler/analysis/face_volume/params.json'))
line=np.array([s for s in p['steps'] if s['name']=='jaw_tuck'][0]['line'],float)
face=bpy.data.objects['HEAD_face']; W=er.world(face); L=M.to_local(W)*1000
res={}
# outer x of the face at each line point (right side, x<0)
pts=[]
for z,y in line:
    s=(np.abs(L[:,2]-z)<2)&(np.abs(L[:,1]-y)<2)&(L[:,0]<0)
    x=L[s,0].min() if s.any() else -40
    pts.append([x,y,z])
pts=np.array(pts)
for v in ('sideR','q34R'):
    u,vv=er.camera_pixels(v,M.to_world(pts/1000)); res[v]=np.c_[u,vv].tolist()
json.dump(res,open(out,'w')); print('PROJ',res)
