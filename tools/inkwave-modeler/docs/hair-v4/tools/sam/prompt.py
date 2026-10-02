# python3 prompt.py <img> <out_prefix> '<json: {name:{pos:[[x,y]..],neg:[[x,y]..]}}>'
import numpy as np, torch, sys, json
from PIL import Image, ImageDraw
from transformers import SamModel, SamProcessor
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
src,outp,spec=sys.argv[1],sys.argv[2],json.loads(sys.argv[3])
MODEL='facebook/sam-vit-base'
m=SamModel.from_pretrained(MODEL).eval(); p=SamProcessor.from_pretrained(MODEL)
img=Image.open(src).convert('RGB'); res={}
with torch.no_grad():
    emb=m.get_image_embeddings(p(img,return_tensors='pt')['pixel_values'])
    for k,v in spec.items():
        pts=v['pos']+v.get('neg',[]); lab=[1]*len(v['pos'])+[0]*len(v.get('neg',[]))
        inp=p(img,input_points=[[pts]],input_labels=[[lab]],return_tensors='pt')
        o=m(image_embeddings=emb,input_points=inp['input_points'],input_labels=inp['input_labels'],multimask_output=True)
        ms=p.image_processor.post_process_masks(o.pred_masks,inp['original_sizes'],inp['reshaped_input_sizes'])[0][0].numpy()
        sc=o.iou_scores[0,0].numpy(); i=int(v.get('pick',np.argmax(sc))); res[k]=ms[i]; print(k,sc.round(3),[int(x.sum()) for x in ms],'pick',i)
np.savez_compressed(outp+'.npz',**res)
a=np.asarray(img).astype(float)
tiles=[]
for k,mk in res.items():
    b=a*0.35; b[mk]=a[mk]; t=Image.fromarray(b.astype(np.uint8)); d=ImageDraw.Draw(t)
    for x,y in spec[k]['pos']: d.ellipse((x-6,y-6,x+6,y+6),fill=(0,255,0))
    for x,y in spec[k].get('neg',[]): d.ellipse((x-6,y-6,x+6,y+6),fill=(255,0,0))
    d.text((5,5),k,fill=(255,255,0)); tiles.append(t.resize((t.width//2,t.height//2)))
W=Image.new('RGB',(tiles[0].width*min(3,len(tiles)),tiles[0].height*((len(tiles)+2)//3)))
for i,t in enumerate(tiles): W.paste(t,((i%3)*t.width,(i//3)*t.height))
W.save(outp+'.png')
