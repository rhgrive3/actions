"""prof_num.py <dir> [view ...] : profile numbers in sheet px. front edge x(y) (rows nose -> chin) and underside y(x); model - ref.
Positive dx = model further FORWARD; positive dy = model LOWER."""
import sys, numpy as np
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
import prof_cmp as P
K=P.K
def front(m,side):
    out=np.full(m.shape[0],np.nan)
    for y in range(m.shape[0]):
        i=np.where(m[y]>0)[0]
        if len(i): out[y]=i[-1] if side=='R' else i[0]
    return out
def bottom(m):
    out=np.full(m.shape[1],np.nan)
    for x in range(m.shape[1]):
        i=np.where(m[:600*K//6+300,x]>0)[0]
        if len(i): out[x]=i[-1]
    return out
def run(d,v,quiet=False):
    side='R' if v=='sideR' else 'L'; sg=1 if side=='R' else -1
    rm=P.ref_mask(P.ref_tile(v)); mm=P.model_mask(d,v)
    fr,fm=front(rm,side),front(mm,side); res={}
    rows=[]
    for ys in range(150,236,3):   # sheet rows relative to the box top (box top = cam y 100)
        y=ys*K-K*100+K//2
        if y<0 or y>=len(fr): continue
        dx=sg*(fm[y]-fr[y])/K; rows.append((ys,fr[y]/K,fm[y]/K,dx))
    res['front']=rows
    # underside: only rows below the chin tip, columns behind the chin
    H=rm.shape[0]
    def under(m):
        out=np.full(m.shape[1],np.nan)
        for x in range(m.shape[1]):
            col=m[int(95*K):int(150*K),x]    # box rows 95..150 (cam y 195..250)
            i=np.where(col>0)[0]
            if len(i): out[x]=95*K+i[-1]
        return out
    ur,um=under(rm),under(mm); cols=[]
    for xs in range(4,160,6):
        x=xs*K
        cols.append((xs,ur[x]/K+100,um[x]/K+100,(um[x]-ur[x])/K))
    res['under']=cols
    if not quiet:
        print(v,'front edge: cam_y  ref_x  model_x  model-ref(forward +)')
        for r in rows: print('  %3d  %6.1f %6.1f  %+5.1f'%r)
        print(v,'underside: box_x  ref_y  model_y  model-ref(lower +)')
        for r in cols: print('  %3d  %6.1f %6.1f  %+5.1f'%r)
    return res
if __name__=='__main__':
    for v in (sys.argv[2:] or ['sideR','sideL']): run(sys.argv[1],v)
