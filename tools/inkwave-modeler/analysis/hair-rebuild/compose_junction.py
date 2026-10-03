"""付け根の比較シート: ビューごとに 参照（シートの枠）| 描いたもの | 半透明で重ねたもの。
python3 compose_junction.py <out.png> <render_dir> [<render_dir2> ...]"""
import os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BOX = {'front': (48, 100, 428, 470), 'q34L': (400, 100, 780, 470), 'sideL': (850, 100, 1230, 470),
       'q34R': (1350, 100, 1730, 470), 'sideR': (1790, 100, 2170, 470)}
SHEET = os.path.join(HERE, '../../docs/face-multiview-fit/refs/sheet_5view.png')
out, dirs = sys.argv[1], sys.argv[2:]
sheet = Image.open(SHEET).convert('RGB')
rows = []
for v, (x0, y0, x1, y1) in BOX.items():
    ref = sheet.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.LANCZOS)
    tiles = [ref]
    for d in dirs:
        r = Image.open(os.path.join(d, f'{v}.png')).convert('RGBA')
        bg = Image.new('RGBA', r.size, (150, 153, 160, 255))
        flat = Image.alpha_composite(bg, r).convert('RGB')
        tiles.append(flat)
    ov = Image.blend(ref, tiles[1], 0.5)
    tiles.append(ov)
    w, h = ref.size
    row = Image.new('RGB', (w * len(tiles), h))
    for i, t in enumerate(tiles):
        row.paste(t, (i * w, 0))
    rows.append(row.resize((row.width // 2, row.height // 2), Image.LANCZOS))
sheet_out = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)))
y = 0
for r in rows:
    sheet_out.paste(r, (0, y)); y += r.height
sheet_out.save(out)
print('saved', out, sheet_out.size)
