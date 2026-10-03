# face polygons within 4 mm of the neck: count those facing into the neck (a folded, inside-out layer)
import bpy, sys, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,'/tmp/inkjaw/tools/inkwave-modeler/scripts')
import inkwave_eye_refine as er
out=sys.argv[sys.argv.index('--')+1]
face=bpy.data.objects['HEAD_face']; me=face.data; W=er.world(face)
torso=bpy.data.objects['BODY_torso']
tree=BVHTree.FromPolygons([Vector(v) for v in er.world(torso)],[tuple(f.vertices) for f in torso.data.polygons])
mw=face.matrix_world.to_3x3(); C=[];D=[];DOT=[]
for p in me.polygons:
    c=Vector(W[list(p.vertices)].mean(0)); co,n,_,d=tree.find_nearest(c)
    if d is None or d>0.004: continue
    C.append(tuple(c)); D.append(d*1000*(1 if (c-co).dot(n)>=0 else -1)); DOT.append((mw@p.normal).normalized().dot(n))
C=np.array(C); u,v=er.camera_pixels('sideR',C); u2,v2=er.camera_pixels('q34R',C)
np.savez(out,C=C,D=np.array(D),DOT=np.array(DOT),u=u,v=v,u2=u2,v2=v2)
print('FOLD polys near neck',len(C),'inward-facing',int((np.array(DOT)<0).sum()))
