# 束のマスク → 中心線と幅（拡大図 zf の画素）。根元 = 分け目（ROOTPX）に最も近い端。測地距離で区切る。
import numpy as np, cv2, json, sys
from collections import deque
from PIL import Image, ImageDraw
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
auto=np.load(S+'sam/auto_front.npz')['masks']; pB=np.load(S+'sam/pB.npz'); pB2=np.load(S+'sam/pB2.npz'); pE=np.load(S+'sam/pE.npz')
A=pB['A']; B=pB2['B_s1']&~cv2.dilate(A.astype(np.uint8),np.ones((9,9),np.uint8)).astype(bool)
M={'A':A,'B':B,'C':auto[22],'D':auto[13],'E':pE['E1']&~auto[13]&(np.arange(952)[None,:]<470)&(np.arange(714)[:,None]>150)}
ROOTPX=(300,160)
def clean(m):
    m=cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m); k=1+np.argmax(st[1:,4]); return lab==k
def geod(m,seed):
    D=np.full(m.shape,-1,int); q=deque([seed]); D[seed]=0
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            yy,xx=y+dy,x+dx
            if 0<=yy<m.shape[0] and 0<=xx<m.shape[1] and m[yy,xx] and D[yy,xx]<0: D[yy,xx]=D[y,x]+1; q.append((yy,xx))
    return D
out={}
img=Image.open(S+'an/zf_clean.png').convert('RGB'); d=ImageDraw.Draw(img)
COL={'A':(255,0,0),'B':(255,140,0),'C':(0,220,0),'D':(0,80,255),'E':(220,0,220)}
for k,m in M.items():
    m=clean(m); ys,xs=np.nonzero(m)
    i=np.argmin((xs-ROOTPX[0])**2+(ys-ROOTPX[1])**2); D0=geod(m,(ys[i],xs[i]))
    j=np.argmax(D0); Dt=geod(m,(np.nonzero(D0==D0.max())[0][0],np.nonzero(D0==D0.max())[1][0]))   # 先端から
    L=Dt.max(); pts=[]
    for a in np.linspace(L,0,14):
        b=m&(np.abs(Dt-a)<L/28)
        if b.sum()<5: continue
        by,bx=np.nonzero(b); c=np.array([bx.mean(),by.mean()])
        # 幅: 帯の画素の主成分に直角な広がり
        P=np.stack([bx,by],1)-c; U,S_,Vt=np.linalg.svd(P,full_matrices=False) if len(P)>2 else (None,None,np.eye(2))
        w=np.ptp(P@Vt[1]) if len(P)>2 else 0
        pts.append((c[0],c[1],float(w)))
    pts=np.array(pts)
    # 幅はとなりの帯の向きが斜めでも正しくなるよう、中心線の向きに直角で測り直す
    T=np.gradient(pts[:,:2],axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)+1e-9; Nn=np.stack([-T[:,1],T[:,0]],1)
    W=[]
    for (x,y,_),n in zip(pts,Nn):
        s=np.arange(-120,121); q=(np.array([x,y])[None]+s[:,None]*n).astype(int)
        ok=(q[:,0]>=0)&(q[:,0]<m.shape[1])&(q[:,1]>=0)&(q[:,1]<m.shape[0]); inside=np.zeros(len(s),bool); inside[ok]=m[q[ok,1],q[ok,0]]
        c0=120; l=c0; r=c0
        while l>0 and inside[l-1]: l-=1
        while r<len(s)-1 and inside[r+1]: r+=1
        W.append(float(r-l+1))
    pts[:,2]=W
    out[k]=pts.tolist()
    ov=Image.new('RGBA',img.size,(0,0,0,0)); mm=Image.fromarray((m*90).astype(np.uint8)); img.paste(Image.new('RGB',img.size,COL[k]),(0,0),mm)
    d.line([tuple(p[:2]) for p in pts],fill=COL[k],width=4)
    for x,y,w in pts: d.ellipse((x-3,y-3,x+3,y+3),fill=(255,255,255))
    print(k,'len px',L,'n',len(pts),'w',np.round(pts[:,2]).astype(int).tolist())
json.dump(out,open(S+'sam/centerlines.json','w')); img.save(S+'sam/centerlines.png')
