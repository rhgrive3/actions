import sys
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5')
from locks2d import LOCKS
from PIL import Image, ImageDraw
im=Image.open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/an/zf.png').convert('RGB'); d=ImageDraw.Draw(im)
COL={'A':(255,0,0),'B':(255,140,0),'C':(0,200,0),'D':(0,0,255),'E':(200,0,200)}
for k,(e1,e2) in LOCKS.items():
    d.line(e1,fill=COL[k],width=3); d.line(e2,fill=COL[k],width=3); d.text(e1[0],k,fill=COL[k])
im.save(sys.argv[1])
