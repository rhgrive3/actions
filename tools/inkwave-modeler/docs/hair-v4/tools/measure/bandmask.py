import numpy as np, sys
from PIL import Image
sys.path.insert(0,'/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/analysis/hair-rebuild')
BOX = {'front': (48, 100, 428, 470), 'q34L': (400, 100, 780, 470), 'sideL': (850, 100, 1230, 470),
       'q34R': (1350, 100, 1730, 470), 'sideR': (1790, 100, 2170, 470)}
sheet = Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/an'
tiles=[]
for v,(x0,y0,x1,y1) in BOX.items():
    ref = sheet.crop((x0,y0,x1,y1)).resize(((x1-x0)*2,(y1-y0)*2), Image.LANCZOS)
    a = np.asarray(ref).astype(float)/255
    mx=a.max(2); mn=a.min(2)
    # black band: dark, low chroma. Only upper 55% (above eyes lash zone handled by manual cut below)
    m = (mx<0.30)&((mx-mn)<0.10)
    H=m.shape[0]; m[int(H*0.62):]=False
    np.save(f'{S}/band_{v}.npy', m)
    ov=a.copy(); ov[m]=[1,0,0]
    tiles.append(Image.fromarray((ov*255).astype(np.uint8)))
W=Image.new('RGB',(sum(t.width for t in tiles)//2, tiles[0].height//2))
x=0
for t in tiles: W.paste(t.resize((t.width//2,t.height//2)),(x,0)); x+=t.width//2
W.save(S+'/bandmask.png')
