"""hm.py geom.npz [geom_ref.npz] : front height z(x,y) table (mm) of HEAD_face (left side), and difference to a second geometry."""
import sys, numpy as np
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent.parent.parent/'multiview'))
import mvcore as M
def hmap(path,res=0.5,X0=-70,Y0=-115):
    g=M.load(path); L=M.to_local(g['HEAD_face']['v'])*1000; F=g['HEAD_face']['f']
    W,H=int(140/res),int(125/res); Z=np.full((H,W),-1e9,np.float32); tri=L[F]
    for t in tri[tri[:,:,2].min(1)>20]:
        p=(t[:,:2]-[X0,Y0])/res
        x0,x1=int(max(np.floor(p[:,0].min()),0)),int(min(np.ceil(p[:,0].max()),W-1)); y0,y1=int(max(np.floor(p[:,1].min()),0)),int(min(np.ceil(p[:,1].max()),H-1))
        if x1<x0 or y1<y0: continue
        xx,yy=np.meshgrid(np.arange(x0,x1+1),np.arange(y0,y1+1))
        d=(p[1,1]-p[2,1])*(p[0,0]-p[2,0])+(p[2,0]-p[1,0])*(p[0,1]-p[2,1])
        if abs(d)<1e-9: continue
        a=((p[1,1]-p[2,1])*(xx-p[2,0])+(p[2,0]-p[1,0])*(yy-p[2,1]))/d; b=((p[2,1]-p[0,1])*(xx-p[2,0])+(p[0,0]-p[2,0])*(yy-p[2,1]))/d; c=1-a-b
        ins=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6); z=a*t[0,2]+b*t[1,2]+c*t[2,2]
        sub=Z[y0:y1+1,x0:x1+1]; sub[ins]=np.maximum(sub[ins],z[ins])
    return Z
if __name__=='__main__':
    res,X0,Y0=0.5,-70,-115
    Z=hmap(sys.argv[1]); R=hmap(sys.argv[2]) if len(sys.argv)>2 else None
    xs=[10,15,20,25,30,35,40,45,50,55,60]
    print('    y  '+' '.join('%6d'%x for x in xs)+('   |  minus ref' if R is not None else ''))
    for y in range(-23,-104,-3):
        r=' %4d  '%y+' '.join('%6.1f'%Z[int((y-Y0)/res),int((x-X0)/res)] for x in xs)
        if R is not None: r+='   | '+' '.join('%5.1f'%(Z[int((y-Y0)/res),int((x-X0)/res)]-R[int((y-Y0)/res),int((x-X0)/res)]) for x in xs)
        print(r)
