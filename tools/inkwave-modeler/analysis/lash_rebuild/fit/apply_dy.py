"""apply_dy.py <fit_top.json> [scale] : shift design.json liner top edge (and upper lash root/mid/tip) down by dy(x)"""
import sys,json,numpy as np
DES='/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/lash_rebuild/design.json'
f=json.load(open(sys.argv[1]));k=float(sys.argv[2]) if len(sys.argv)>2 else 1.0
CX,DY=np.array(f['CX']),k*np.array(f['dy'])
d=json.load(open(DES));top=np.array(d['liner_top']);top[:,1]+=np.interp(top[:,0],CX,DY);d['liner_top']=top.tolist()
for L in d['lashes']:
    for kk in ('root','mid','tip'): L[kk][1]+=float(np.interp(L[kk][0],CX,DY))
json.dump(d,open(DES,'w'));print('applied dy x',k,np.round(DY,2).tolist())
