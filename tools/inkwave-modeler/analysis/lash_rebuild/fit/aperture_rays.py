"""blender -b x.blend --python aperture_rays.py -- out.npz : model eye opening (R eye) in front camera px, liner/lashes/rim ignored.
For each column x (0.25 px): top and bottom y where the eyeball (HEAD_eyes_18/19) is the first surface hit."""
import sys
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/scripts')
import numpy as np, bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import inkwave_lash_rebuild as lr
er=lr.er
own=set(lr.R['lashes']+lr.L['lashes']+[lr.R['liner'],lr.L['liner'],lr.R['rim'],lr.L['rim']])
verts=[];polys=[];owner=[]
for o in bpy.data.objects:
    if o.type!='MESH' or o.name in own or o.hide_render or not o.data.polygons: continue
    if not o.name.startswith('HEAD_') or any(c.name in('FACE_FIT_ORIGINAL','HAIR','HEADGEAR','CLOTHES') for c in o.users_collection): continue
    base=sum(len(v) for v in verts);verts.append(er.world(o))
    for p in o.data.polygons: polys.append([base+i for i in p.vertices]);owner.append(o.name)
tree=BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)],polys)
rays=lr.FrontRays(tree)
EYE={'HEAD_eyes_18','HEAD_eyes_19'}
xs=np.arange(100,162,0.25);top=np.full(len(xs),np.nan);bot=np.full(len(xs),np.nan)
for i,x in enumerate(xs):
    ys=np.arange(108,150,0.1);vis=[]
    for y in ys:
        p,d,t=rays.cast(x,y)
        o=p-d*t;h=tree.ray_cast(Vector(o),Vector(d),50)
        vis.append(owner[h[2]] in EYE)
    vis=np.array(vis)
    if vis.any():
        k=np.nonzero(vis)[0];top[i]=ys[k[0]];bot[i]=ys[k[-1]]
np.savez(sys.argv[-1],x=xs,top=top,bot=bot)
ok=~np.isnan(top);print('APERTURE x',xs[ok].min(),xs[ok].max(),'top min',np.nanmin(top),'bot max',np.nanmax(bot))
