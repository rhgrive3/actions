"""Fit a vertical offset profile dy(x) of the liner top edge (front px) so the top edge on the model skin matches the
reference top edge in front, q34R and sideR (lash spikes removed from the reference edge)."""
import sys,json,numpy as np
from scipy.optimize import minimize
from scipy.interpolate import RegularGridInterpolator as RGI
EV='/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929'
DES='/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/lash_rebuild/design.json'
E=json.load(open(f'{EV}/lr/ref_liner_edges.json'))
S=np.load(f'{EV}/lr/skinmap.npz')
MAP={v:RGI((S['ys'],S['xs']),S[v],bounds_error=False,fill_value=None) for v in ('q34R','sideR')}
d=json.load(open(DES));TOP=np.array(d['liner_top'])
REF={}
for v in ('front','q34R','sideR'):
    t=np.array(E[v+'_R']['top']);t=t[np.argsort(t[:,0])]
    # median filter the reference edge (removes leftover lash stubs)
    y=np.array([np.median(t[max(0,i-3):i+4,1]) for i in range(len(t))]);REF[v]=(t[:,0],y)
CX=np.array([94,100,106,112,118,124,130,136,142,148,154.])
def proj(v,p): return p if v=='front' else MAP[v](p[:,::-1])
def resid(dy,v):
    top=TOP.copy();top[:,1]+=np.interp(top[:,0],CX,dy);q=proj(v,top)
    x,y=REF[v];ok=(q[:,0]>x.min()+1)&(q[:,0]<x.max()-1)
    return q[ok,1]-np.interp(q[ok,0],x,y)
W={'front':1.0,'q34R':1.0,'sideR':1.0}
def cost(dy): return sum(W[v]*np.mean(np.minimum(np.abs(resid(dy,v)),6)**2) for v in W)+0.05*np.sum(np.diff(dy)**2)
dy0=np.zeros(len(CX))
for v in W: r=resid(dy0,v);print('before',v,'mean dy(model-ref)',round(float(r.mean()),2),'rms',round(float(np.sqrt(np.mean(r**2))),2))
res=minimize(cost,dy0,method='Powell',bounds=[(-1,5)]*len(CX),options={'maxiter':20000,'xtol':1e-3,'ftol':1e-6})
for v in W: r=resid(res.x,v);print('after ',v,'mean',round(float(r.mean()),2),'rms',round(float(np.sqrt(np.mean(r**2))),2))
print('dy',np.round(res.x,2).tolist())
json.dump({'CX':CX.tolist(),'dy':res.x.tolist()},open(f'{EV}/lr/fit_top.json','w'))
