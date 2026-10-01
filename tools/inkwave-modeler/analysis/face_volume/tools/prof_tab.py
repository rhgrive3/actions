"""prof_tab.py name [name2] : side profile residuals (model - ref, + = model forward) per camera row (1 px steps), with the
two views' mean offsets removed and the sideL rows shifted onto the sideR rows (same head height)."""
import sys, numpy as np
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
import prof_cmp as P, prof_num as N
K=P.K
def res(name,sub='prof'):
    out={}
    for v,side,sg in (('sideR','R',1),('sideL','L',-1)):
        rm=P.ref_mask(P.ref_tile(v)); mm=P.model_mask(f'{name}/{sub}',v)
        fr,fm=N.front(rm,side),N.front(mm,side)
        out[v]={ys:sg*(fm[(ys-100)*K+3]-fr[(ys-100)*K+3])/K for ys in range(140,226)}
        out[v+'_ref']={ys:fr[(ys-100)*K+3]/K for ys in range(140,226)}
    return out
if __name__=='__main__':
    names=sys.argv[1:]; R=[res(n) for n in names]
    offs=[(np.mean([r['sideR'][y] for y in range(156,200)]),np.mean([r['sideL'][y] for y in range(153,196)])) for r in R]
    print('offsets (R,L):',[(round(a,2),round(b,2)) for a,b in offs])
    print('rowR  headY |'+' | '.join('%s: R   L   mean'%n for n in names))
    for y in range(146,224,2):
        yl=int(round(y-3.6+ (y-174)*0.006))
        hy=-55.6-(y-174)/1.057
        print('%4d %6.1f |'%(y,hy)+' | '.join('     %+4.1f %+4.1f  %+4.1f'%(r['sideR'][y]-o[0],r['sideL'][yl]-o[1],0.5*(r['sideR'][y]-o[0]+r['sideL'][yl]-o[1])) for r,o in zip(R,offs)))
