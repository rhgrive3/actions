# 尻尾（左 +X、右は鏡像）。芯の道すじ（参照の正面・後ろ・横の全身画像とシートから読んだ点）に沿って、
# 太い芯 1 本 + 表面の束 5 本。束はカフの中の高さ f から前→後ろへ通り、芯に合流して落ち、長さ s_end で細く終わる。
import json
exec(open(V4+'clumps.py').read()); exec(open(V4+'hairmat.py').read())
CF=json.load(open(V4+'cuff.json'))
HM=bpy.data.materials.get('V4_hair') or hair_material()
def mid(side,f):
    o=np.array(CF[side]['outer']); i=np.array(CF[side]['inner']); B=np.array(CF[side]['B'])
    k=int(round(f*(len(o)-1))); return (o[k]+i[k])/2, B[k]
def catmull(P,n):
    P=np.asarray(P,float); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]; s=np.linspace(0,d[-1],n)
    out=[]
    for x in s:
        k=min(np.searchsorted(d,x,side='right')-1,len(P)-2); t=(x-d[k])/max(d[k+1]-d[k],1e-9)
        p0=P[max(k-1,0)];p1=P[k];p2=P[k+1];p3=P[min(k+2,len(P)-1)]
        out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
    return np.array(out), s/d[-1]
CORE=[(0.095,0.15,1.54),(0.13,0.2,1.48),(0.15,0.24,1.37),(0.185,0.26,1.285),(0.25,0.28,1.225),(0.31,0.29,1.18),(0.35,0.295,1.115),(0.365,0.29,1.04),(0.36,0.285,0.995)]
RCORE=([0,0.06,0.18,0.3,0.45,0.6,0.75,0.88,0.96,1],[0.022,0.050,0.070,0.064,0.056,0.048,0.046,0.052,0.042,0.010])
# 表面の束: (カフの高さ f, 芯からの向きの角度 deg, 離れ具合, 終わり s_end, 最大半径)
SURF=[(0.92,60,0.040,0.62,0.040),(0.72,150,0.042,0.52,0.038),(0.50,220,0.040,0.46,0.036),(0.30,300,0.040,0.42,0.034),(0.10,20,0.036,0.36,0.030),(0.85,110,0.034,0.82,0.034),(0.62,260,0.036,0.70,0.034),(0.40,340,0.038,0.58,0.032)]
def build(side):
    f0=0.6; m0,B0=mid(side,f0)
    core=[m0-B0*0.004,m0+B0*0.03]+[np.array(p) if side=='L' else mirror(np.array(p)) for p in CORE]
    P,s=catmull(core,26); R=np.interp(s,*RCORE)
    T=np.gradient(P,axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)
    U=np.cross(T,[0,0,1.0]); U/=np.linalg.norm(U,axis=1,keepdims=True)+1e-9; V=np.cross(T,U)
    clumps=[dict(p=P.tolist(),r=R.tolist())]
    for f,ang,dd,se,rmax in SURF:
        m,B=mid(side,f); a=np.radians(ang if side=='L' else 180-ang)
        off=(np.cos(a)*U+np.sin(a)*V)*dd
        k=int(se*(len(P)-1)); grow=(np.clip((s[:k+1]-0.06)/0.22,0,1)*np.clip((se-s[:k+1])/0.2,0,1))[:,None]*0.8; Pc=P[:k+1]+off[:k+1]*grow
        w=np.clip(np.linspace(0,1,k+1)/0.18,0,1)[:,None]          # 根元はカフの f の位置から芯へ合流
        start=np.array([m-B*0.004,m+B*0.03])
        path=np.concatenate([start,Pc[2:]*w[2:]+ (Pc[2:]*0+m+B*0.03)*(1-w[2:])])
        Q,sq=catmull(path,18)
        Rq=rmax*1.25*np.clip(np.minimum(sq/0.12,1),0.45,1)*np.clip((1-sq)/0.5,0,1)**0.5; Rq[-1]=0.004
        clumps.append(dict(p=Q.tolist(),r=Rq.tolist()))
    for c in clumps: assert len(c['p'])==len(c['r'])
    make('V4_tail_'+side,clumps[1:],0.55,HM,res=18)
    CORES[side]=clumps[0]
def fin(side):
    # ヒレ: 芯の最後の 30% を、幅広で平たい断面で重ねる（先は丸く）
    f0=0.6; m0,B0=mid(side,f0)
    core=[m0-B0*0.004,m0+B0*0.03]+[np.array(p) if side=='L' else mirror(np.array(p)) for p in CORE]
    P,s=catmull(core,40); k=int(0.70*(len(P)-1)); Q=P[k:]; sq=np.linspace(0,1,len(Q))
    R=np.interp(sq,[0,0.2,0.55,0.82,0.95,1],[0.036,0.068,0.078,0.070,0.045,0.012])
    return dict(p=Q.tolist(),r=R.tolist())
CORES={}
for side in ('L','R'): build(side)
_lens_make=make
exec(open(V4+'clumps.py').read())      # 芯は丸い（楕円）断面
for side in ('L','R'): make('V4_tailcore_'+side,[CORES[side]],0.85,HM,res=18)
make=_lens_make
make('V4_fins',[fin('L'),fin('R')],0.75,HM,res=20)
__result__='ok'
