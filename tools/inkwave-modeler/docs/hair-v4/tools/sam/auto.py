import numpy as np, sys, cv2
from PIL import Image, ImageDraw
from transformers import pipeline
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
src,tag,model=sys.argv[1],sys.argv[2],(sys.argv[3] if len(sys.argv)>3 else 'facebook/sam-vit-base')
g=pipeline('mask-generation',model=model,device='cpu')
img=Image.open(src).convert('RGB')
o=g(img,points_per_batch=64,pred_iou_thresh=0.86,stability_score_thresh=0.9)
masks=[np.array(m) for m in o['masks']]; sc=[float(s) for s in o['scores']]
np.savez_compressed(S+f'sam/auto_{tag}.npz',masks=np.array(masks),scores=np.array(sc))
a=np.asarray(img).astype(float)*0.4; rng=np.random.default_rng(1)
order=np.argsort([-m.sum() for m in masks])
for i in order:
    m=masks[i]; c=rng.integers(40,255,3); a[m]=a[m]*0.3+c*0.7
im=Image.fromarray(a.astype(np.uint8)); d=ImageDraw.Draw(im)
for i in order:
    ys,xs=np.nonzero(masks[i]); d.text((xs.mean(),ys.mean()),str(i),fill=(255,255,255))
im.save(S+f'sam/auto_{tag}.png'); print(len(masks),'masks')
