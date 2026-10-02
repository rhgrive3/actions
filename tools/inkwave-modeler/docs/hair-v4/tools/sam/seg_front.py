import numpy as np, torch, sys, json, cv2
from PIL import Image
from transformers import SamModel, SamProcessor
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5')
from locks2d import LOCKS
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
MODEL=sys.argv[1] if len(sys.argv)>1 else 'facebook/sam-vit-base'
m=SamModel.from_pretrained(MODEL).eval(); p=SamProcessor.from_pretrained(MODEL)
img=Image.open(S+'an/zf_clean.png').convert('RGB')
def mids(e1,e2,n):
    def rs(e):
        e=np.array(e,float); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(e,axis=0),axis=1))]; t=np.linspace(0.12,0.88,n)*d[-1]
        return np.stack([np.interp(t,d,e[:,0]),np.interp(t,d,e[:,1])],1)
    return (rs(e1)+rs(e2))/2
C={k:mids(*v,4) for k,v in LOCKS.items()}
out={}
with torch.no_grad():
    emb=m.get_image_embeddings(p(img,return_tensors='pt')['pixel_values'])
    for k in LOCKS:
        pos=C[k].tolist(); neg=[q.tolist() for kk in LOCKS if kk!=k for q in C[kk][1:3]]
        pts=[pos+neg]; lab=[[1]*len(pos)+[0]*len(neg)]
        inp=p(img,input_points=[pts],input_labels=[lab],return_tensors='pt')
        o=m(image_embeddings=emb,input_points=inp['input_points'],input_labels=inp['input_labels'],multimask_output=True)
        masks=p.image_processor.post_process_masks(o.pred_masks,inp['original_sizes'],inp['reshaped_input_sizes'])[0][0].numpy()
        sc=o.iou_scores[0,0].numpy(); i=int(np.argmax(sc)); out[k]=masks[i]; print(k,'iou',sc.round(3),'area',masks[i].sum())
np.savez_compressed(S+'sam/front_masks.npz',**out)
a=np.asarray(img).copy().astype(float)
COL={'A':(255,0,0),'B':(255,140,0),'C':(0,200,0),'D':(0,0,255),'E':(200,0,200),'F':(0,200,200)}
for k,mk in out.items():
    a[mk]=a[mk]*0.5+np.array(COL[k])*0.5
    cs,_=cv2.findContours(mk.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    b=a.astype(np.uint8).copy(); cv2.drawContours(b,cs,-1,COL[k],2); a=b.astype(float)
Image.fromarray(a.astype(np.uint8)).save(S+'sam/front_masks.png')
