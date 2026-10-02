# 頭の上の髪の外形（visual hull）を 2.5mm で。背景に写るビューが 0、髪に写るビューが 3 以上。頭の中は除く。
import numpy as np, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from cam import CAMS; from band3 import rhead, C
BOX={'front':(48,100),'q34L':(400,100),'sideL':(850,100),'q34R':(1350,100),'sideR':(1790,100)}
PAN={'front':(0,445),'q34L':(445,880),'sideL':(880,1292),'q34R':(1292,1716),'sideR':(1716,2172)}
bg=np.load(S+'an/sheet_bg.npy'); hair=np.load(S+'an/sheet_hair.npy')
import cv2
from PIL import Image
im=np.asarray(Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB'))
dark=im.max(2)<80
skin=~(hair|bg|dark)          # 肌・目・眉など（髪でも背景でも黒でもない）
skin=cv2.erode(skin.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool)
st=0.0025
xs=np.arange(-0.17,0.23,st); ys=np.arange(-0.20,0.17,st); zs=np.arange(1.36,1.66,st)
G=np.stack(np.meshgrid(xs,ys,zs,indexing='ij'),-1).reshape(-1,3).astype(np.float32)
nbg=np.zeros(len(G),np.int8); nh=np.zeros(len(G),np.int8); front=np.zeros(len(G),bool)
for v,c in CAMS.items():
    uv=c.proj(G); x0,y0=BOX[v]; sx=x0+uv[:,0]/2; sy=y0+uv[:,1]/2
    ins=(sx>=PAN[v][0])&(sx<PAN[v][1])&(sy>=0)&(sy<724)
    xi=np.clip(sx.astype(int),0,2171); yi=np.clip(sy.astype(int),0,723)
    ins2=(sx>=PAN[v][0]-60)&(sx<PAN[v][1]+60)&(sy>=0)&(sy<724)
    nbg+=(ins2&bg[yi,xi]); nh+=(ins&hair[yi,xi])
    HD=np.load(S+f'an/hdepth_{v}.npy'); ui=np.clip(uv[:,0].astype(int),0,c.rx-1); vi=np.clip(uv[:,1].astype(int),0,c.ry-1)
    z=-c.cam(G)[:,2]; hd=HD[vi,ui]
    front|= ins & skin[yi,xi] & np.isfinite(hd) & (z<hd-0.003)
K=(nbg==0)&(nh>=3)&~front
q=G-C; r=np.linalg.norm(q,axis=1); K&=r>rhead(q/np.maximum(r[:,None],1e-9))-0.001
vol=K.reshape(len(xs),len(ys),len(zs))
np.savez(S+'v5/hull_fine.npz',vol=vol,xs=xs,ys=ys,zs=zs)
print('voxels',K.sum())
