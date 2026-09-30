"""prof_edges.py <dir> : outer skin edge per row, model - ref (sheet px, + = model sticks out) for q34R (right edge),
q34L (left edge), front (both)."""
import sys, numpy as np
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
import prof_cmp as P
K=P.K
def edge(m,side,x0=None,x1=None):
    out=np.full(m.shape[0],np.nan)
    for y in range(m.shape[0]):
        r=m[y,x0:x1]; i=np.where(r>0)[0]
        if len(i): out[y]=(i[-1] if side=='R' else i[0])+(x0 or 0)
    return out
def run(d,quiet=False):
    res={}
    for v,side,xr in (('q34R','R',(None,None)),('q34L','L',(None,None)),('front','L',(None,80*K)),('front','R',(80*K,None))):
        rm=P.ref_mask(P.ref_tile(v)); mm=P.model_mask(d,v); sg=1 if side=='R' else -1
        er,em=edge(rm,side,*xr),edge(mm,side,*xr); rows=[]
        for ys in range(124,226,4):
            y=(ys-100)*K+K//2; rows.append((ys,er[y]/K,em[y]/K,sg*(em[y]-er[y])/K))
        res[v+side]=rows
    if not quiet:
        print('row   '+'   '.join('%-22s'%k for k in res))
        for i in range(len(rows)):
            print('%3d  '%rows[i][0]+'   '.join('%6.1f %6.1f %+5.1f  '%res[k][i][1:] for k in res))
    return res
if __name__=='__main__': run(sys.argv[1])
