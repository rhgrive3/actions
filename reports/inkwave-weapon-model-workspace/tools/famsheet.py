import sys, json, os
from PIL import Image, ImageDraw, ImageFont
# usage: famsheet.py sp out.png title id...
sp, out, title = sys.argv[1:4]; ids = sys.argv[4:]
names = dict(l.rstrip('\n').split('\t') for l in open(f'{sp}/tools/names.tsv'))
ja = {}
import subprocess
b = json.load(open(f'{sp}/before2/silhouette.json')); n = json.load(open(f'{sp}/now/silhouette.json'))
W = 260; H = 260; head = 40
try: font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', 18)
except Exception:
    try: font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 18)
    except Exception: font = ImageFont.load_default(size=18)
def tile(p):
    bg = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    if os.path.exists(p):
        im = Image.open(p).convert('RGBA'); im.thumbnail((W, H)); bg.alpha_composite(im, ((W - im.width) // 2, (H - im.height) // 2))
    return bg.convert('RGB')
sheet = Image.new('RGB', (W * 3 + 300, head + len(ids) * (H + 6)), (255, 255, 255)); d = ImageDraw.Draw(sheet)
d.text((10, 8), title + '   columns: Splatoon 3 official render | INKWAVE before | INKWAVE now', fill=(0, 0, 0), font=font)
for i, wid in enumerate(ids):
    y = head + i * (H + 6)
    sheet.paste(tile(f'{sp}/refs/{wid}.3d.png'), (0, y)); sheet.paste(tile(f'{sp}/before2/{wid}.side.png'), (W, y)); sheet.paste(tile(f'{sp}/now/{wid}.side.png'), (2 * W, y))
    bi = b.get(wid, {}).get('iou', 0); ni = n.get(wid, {}).get('iou', 0)
    d.text((3 * W + 12, y + 90), names.get(wid, wid), fill=(0, 0, 0), font=font)
    d.text((3 * W + 12, y + 120), f'IoU {bi:.2f} → {ni:.2f}', fill=(0, 90, 0) if ni > bi + 0.01 else (150, 0, 0), font=font)
    d.line([(0, y + H + 3), (sheet.width, y + H + 3)], fill=(220, 220, 220))
sheet.save(out, quality=85)
