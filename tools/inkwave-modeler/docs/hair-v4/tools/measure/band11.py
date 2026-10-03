# 右: sideR+front ステレオ。左: sideL の帯中心線の光線上で、x = 右の鏡像 x(z) になる点。上は弧でつなぐ。
import numpy as np, sys
from scipy.interpolate import UnivariateSpline, splprep, splev
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import *
X0=0.004
P=np.load(A+'st_sideR_front.npy'); P=P[np.argsort(P[:,2])]
sm=len(P)*0.003**2
fx=UnivariateSpline(P[:,2],P[:,0],k=3,s=sm); fy=UnivariateSpline(P[:,2],P[:,1],k=3,s=sm)
zlo,zhi=P[:,2].min(),P[:,2].max()
def xr(z): return fx(np.clip(z,zlo,zhi))+(z<zlo)*0.0
# 左
cs=CAMS['sideL']; cl=centerline('sideL'); D=ray(cs,cl[:,0],cl[:,1])
L=[]
for i in range(len(cl)):
    s=np.linspace(2.6,3.1,2000); Pp=cs.t+D[i]*s[:,None]
    f=Pp[:,0]-(2*X0-xr(Pp[:,2]))
    j=np.nonzero(np.diff(np.sign(f)))[0]
    if len(j): L.append(Pp[j[0]])
L=np.array(L); L=L[np.argsort(L[:,2])]
L=L[(L[:,2]>=zlo-0.03)&(L[:,2]<=zhi)]
gx=UnivariateSpline(L[:,2],L[:,0],k=3,s=len(L)*0.003**2); gy=UnivariateSpline(L[:,2],L[:,1],k=3,s=len(L)*0.003**2)
print('left z',L[:,2].min().round(3),L[:,2].max().round(3))
for z in [1.38,1.42,1.46,1.50]: print(z,'R x,y',round(float(fx(z)),3),round(float(fy(z)),3),'L x,y',round(float(gx(z)),3),round(float(gy(z)),3))
zb=1.365
zsR=np.linspace(zlo,zhi,40); R=np.stack([fx(zsR),fy(zsR),zsR],1)
g=R[1]-R[0]; g/=np.linalg.norm(g); lowR=np.array([R[0]-g*k for k in np.linspace((R[0,2]-zb)/max(g[2],1e-3),0,6)[:-1]])
zsL=np.linspace(L[:,2].min(),min(L[:,2].max(),zhi),40); Lc=np.stack([gx(zsL),gy(zsL),zsL],1)
g=Lc[1]-Lc[0]; g/=np.linalg.norm(g); lowL=np.array([Lc[0]-g*k for k in np.linspace((Lc[0,2]-zb)/max(g[2],1e-3),0,6)[:-1]])
right=np.concatenate([lowR,R]); left=np.concatenate([lowL,Lc])[::-1]
# 上の弧: 右上端と左上端を結ぶ。高さは band10 の弧（上の b10 曲線）から
B10=np.load(A+'band_curve_b10.npy')
a_,b_=right[-1],left[0]
top=B10[(B10[:,0]>a_[0]+0.008)&(B10[:,0]<b_[0]-0.008)].copy(); top=top[np.argsort(top[:,0])]
w=(top[:,0]-a_[0])/(b_[0]-a_[0]); top[:,1]=a_[1]*(1-w)+b_[1]*w
top[:,2]+= (a_[2]-top[0,2])*(1-w)+(b_[2]-top[-1,2])*w
pts=np.concatenate([right,top,left])
tck,u=splprep(pts.T,s=len(pts)*0.002**2,k=3)
Q=np.array(splev(np.linspace(0,1,181),tck)).T
np.save(A+'band_curve_b11.npy',Q); np.save(A+'band_curve_b10.npy',Q) if False else None
print('ok',len(pts),Q[:,2].min().round(3),Q[:,2].max().round(3))
