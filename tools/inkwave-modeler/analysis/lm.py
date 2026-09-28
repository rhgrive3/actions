import sys, json, numpy as np, mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision
opts = vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path='face_landmarker.task'), num_faces=1, min_face_detection_confidence=0.2, min_face_presence_confidence=0.2, output_facial_transformation_matrixes=True)
det = vision.FaceLandmarker.create_from_options(opts)
def run(path, crop=None, up=1):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    ox=oy=0
    if crop: im = im.crop(crop); ox,oy = crop[0],crop[1]
    if up!=1: im = im.resize((im.width*up, im.height*up), Image.LANCZOS)
    arr = np.asarray(im).copy()
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=arr))
    if not r.face_landmarks: return None
    L = np.array([[p.x*im.width/up+ox, p.y*im.height/up+oy, p.z*im.width/up] for p in r.face_landmarks[0]])
    M = np.array(r.facial_transformation_matrixes[0]) if r.facial_transformation_matrixes else None
    return L, M
if __name__ == '__main__':
    for p in sys.argv[1:]:
        res = run(p)
        print(p, 'none' if res is None else res[0][[1,33,263,61,291,152]].round(1).tolist())
