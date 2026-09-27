import sys, json, numpy as np, mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from PIL import Image
src='../../docs/face-multiview-fit/refs/sheet_5view.png'
boxes={'front':(60,180,420,540),'q34L':(450,180,810,540),'sideL':(880,180,1240,540),'q34R':(1350,180,1710,540),'sideR':(1800,180,2160,540)}
opt=vision.FaceLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path='../face_landmarker.task'),num_faces=1,output_facial_transformation_matrixes=True,min_face_detection_confidence=0.1,min_face_presence_confidence=0.1)
det=vision.FaceLandmarker.create_from_options(opt)
im=Image.open(src).convert('RGB'); out={}
for v,(x0,y0,x1,y1) in boxes.items():
    k=3; c=im.crop((x0,y0,x1,y1)).resize(((x1-x0)*k,(y1-y0)*k),Image.LANCZOS)
    r=det.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=np.asarray(c).copy()))
    if not r.face_landmarks: print(v,'none'); continue
    p=np.array([[l.x*c.width/k+x0,l.y*c.height/k+y0] for l in r.face_landmarks[0]])
    out[v]=p.tolist(); print(v,'ok',len(p), 'nose1',p[1].round(1),'chin152',p[152].round(1),'eyes 468/473',p[468].round(1),p[473].round(1))
json.dump(out,open('mp_ref.json','w'))
