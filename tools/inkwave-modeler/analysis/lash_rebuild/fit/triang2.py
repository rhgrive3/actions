import sys, json
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/scripts')
import numpy as np, bpy
from mathutils import Vector
import inkwave_lash_rebuild as lr
er=lr.er;M=lr.M
tree=lr.surface_tree()
def ray(view,u,v):
    mat,w,h=er.camera_matrix(view);inv=np.linalg.inv(mat)
    nd=[np.array([2*u/w-1,1-2*v/h,z,1])@inv.T for z in(-1,1)];p,q=[t[:3]/t[3] for t in nd];return p,(q-p)/np.linalg.norm(q-p)
def tri(obs):
    A=np.zeros((3,3));b=np.zeros(3)
    for view,(u,v) in obs:
        p,d=ray(view,u,v);P=np.eye(3)-np.outer(d,d);A+=P;b+=P@p
    X=np.linalg.solve(A,b);err=[]
    for view,(u,v) in obs:
        ux,uy=er.camera_pixels(view,X[None]);err.append([round(float(ux[0]-u),2),round(float(uy[0]-v),2)])
    n=tree.find_nearest(Vector(X))
    p,d=ray('front',*[float(c[0]) for c in er.camera_pixels('front',X[None])])
    h=tree.ray_cast(Vector(p),Vector(d),50);along=(h[3]-np.dot(X-p,d))*1000
    return X,err,n[3]*1000,along
P={'wing':[('front',(92.7,107.8)),('q34R',(168.5,107.3)),('sideR',(249.5,108.3))],
   'L1':[('front',(100.5,105.2)),('q34R',(182.5,106.2)),('sideR',(262.2,107.2))],
   'L2':[('front',(109.3,106.0)),('q34R',(195.5,108.8)),('sideR',(272.0,110.3))],
   'L3':[('front',(118.2,105.3)),('q34R',(208.2,107.2)),('sideR',(281.5,108.2))],
   'F1':[('q34R',(231.0,120.3)),('sideR',(294.5,120.2))],
   'FW1':[('q34R',(229.5,121.5)),('sideR',(293.5,119.8))],
   'FW2':[('q34R',(230.0,127.0)),('sideR',(290.5,128.5))],
   'FW0':[('q34R',(227.0,118.5)),('sideR',(289.5,112.5))],
   'R1':[('front',(103.5,109.2)),('q34R',(185.5,111.3)),('sideR',(265.0,112.3))],
   'R2':[('front',(111.5,108.6)),('q34R',(198.7,112.0)),('sideR',(273.8,112.7))],
   'R3':[('front',(120.3,108.4)),('q34R',(209.5,111.3)),('sideR',(282.5,112.8))]}
out={}
for k,obs in P.items():
    X,err,dist,along=tri(obs);loc=M.to_local(X[None])[0]*1000
    fx,fy=er.camera_pixels('front',X[None])
    out[k]={'local_mm':loc.tolist(),'front_px':[float(fx[0]),float(fy[0])],'err':err,'skin_mm':dist,'along_front_mm':along}
    print('TRI',k,'local',np.round(loc,1).tolist(),'front',round(float(fx[0]),1),round(float(fy[0]),1),'err',err,'dist skin mm',round(dist,1),'float along front ray mm',round(along,1))
json.dump(out,open(sys.argv[-1],'w'))
