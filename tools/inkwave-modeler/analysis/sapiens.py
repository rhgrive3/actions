import torch, numpy as np, sys, time
from PIL import Image
torch.set_num_threads(4)
_M = None
def model():
    global _M
    if _M is None:
        _M = torch.jit.load(__import__('os').environ.get('SAPIENS_PT', 'models/sapiens_1b_normal_render_people_epoch_115_torchscript.pt2'), map_location='cpu').eval()
    return _M
MEAN = np.array([123.675, 116.28, 103.53], np.float32); STD = np.array([58.395, 57.12, 57.375], np.float32)
def normals(img):  # PIL RGB, any size -> HxWx3 unit normals at image size
    W0, H0 = img.size
    x = np.asarray(img.convert('RGB').resize((768, 1024), Image.BICUBIC), np.float32)
    x = (x - MEAN) / STD
    t = torch.from_numpy(x.transpose(2, 0, 1)[None])
    with torch.inference_mode():
        y = model()(t)
    y = torch.nn.functional.interpolate(y, size=(H0, W0), mode='bilinear', align_corners=False)[0].numpy()
    y = y / (np.linalg.norm(y, axis=0, keepdims=True) + 1e-8)
    return y.transpose(1, 2, 0)
def vis(n): return Image.fromarray(((n + 1) / 2 * 255).clip(0, 255).astype(np.uint8))
if __name__ == '__main__':
    src, box, out = sys.argv[1], [int(v) for v in sys.argv[2].split(',')], sys.argv[3]
    im = Image.open(src).convert('RGB')
    if box[2] > 0: im = im.crop(box)
    t = time.time(); n = normals(im); print('sec', time.time() - t)
    np.save(out + '.npy', n.astype(np.float16)); vis(n).save(out + '.png')
