"""Annotate measured rear-view paint/drum ratios; never modifies game inputs."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.font_manager import FontProperties

root = Path(__file__).resolve().parents[1]
out = root / 'reports/roller-ratio-20261020'
out.mkdir(parents=True, exist_ok=True)
font = FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
font_manager.fontManager.addfont(font.get_file())
plt.rcParams['font.family'] = font.get_name()
items = [
    dict(path='.reference-data/roller-scale/gamewatch25-full.jpg', title='本家・スプラローラー', drum=[539, 753, 441], paint=[470, 864, 490]),
    dict(path='reports/roller-overhead-20261020/gameplay.png', title='INKWAVE・修正前', drum=[355, 555, 395], paint=[231, 682, 446]),
    dict(path='reports/roller-ratio-20261020/gameplay.png', title='INKWAVE・修正後', drum=[355, 555, 395]),
]
fig, axes = plt.subplots(1, 3, figsize=(17, 6.6), facecolor='#101822')
fig.subplots_adjust(left=.02, right=.98, top=.79, bottom=.24, wspace=.03)
fig.text(.025, .94, 'ローラー本体の横幅を1とした、転がし塗りの幅', color='white', fontsize=23)
fig.text(.025, .87, '胴の表示幅を統一。水色＝胴、ピンク＝直後の塗り幅（縁の揺らぎを5行平均）。', color='#d4e2f2', fontsize=15)
for ax, item in zip(axes, items):
    data = (root / item['path']).read_bytes()
    a = np.asarray(Image.open(root / item['path']).convert('RGB'))
    row = item.get('paint', [0, 0, 446])[2]
    # Same five-row window in every image; retain spans so jagged-edge
    # averaging can be reviewed independently of the displayed annotation.
    rows = []
    for y in range(row - 2, row + 3):
        r, g, b = a[y].astype(float).T
        mask = ((g > 145) & (r > 105) & (b < 85) & (g > r * 1.05)
                if item is items[0] else (r > 160) & (g > 55) & (b < 65))
        xs = np.flatnonzero(mask)
        assert xs.size > 200, 'expected reference/native ink stripe'
        rows.append(dict(row=y, left=int(xs.min()), right=int(xs.max())))
    item['paintRows'] = rows
    item['paint'] = [float(np.mean([s['left'] for s in rows])),
                     float(np.mean([s['right'] for s in rows])), row]
    lo, hi, cy = item['drum']
    d, cx = hi - lo, (lo + hi) / 2
    item['ratio'] = (item['paint'][1] - item['paint'][0]) / d
    item['sha256'] = hashlib.sha256(data).hexdigest()
    h, w = a.shape[:2]
    ax.imshow(a, extent=[-cx / d, (w - cx) / d, (h - cy) / d, -cy / d])
    ax.set_xlim(-1.55, 1.55)
    ax.set_ylim(1.1, -.38)
    ax.axis('off')
    ax.set_title(item['title'] + f"\n塗り／胴 ≈ {item['ratio']:.2f} 倍", color='white', fontsize=17, pad=13)
    for bounds, y, color in [([lo, hi], cy, '#70f4ff'), (item['paint'][:2], item['paint'][2], '#ff618e')]:
        x1, x2 = [(x - cx) / d for x in bounds]
        yy = (y - cy) / d
        ax.plot([x1, x2], [yy, yy], color=color, lw=2)
        for x in [x1, x2]:
            ax.plot([x, x], [yy - .05, yy + .05], color=color, lw=2)
relative_error = items[2]['ratio'] / items[0]['ratio'] - 1
assert abs(relative_error) < .01, 'native rear-view ratio must be within 1% of the selected image measurement'
fig.text(.025, .15, 'モデル寸法を維持し、5系統＋8派生の転がし塗りの最大幅を補正。', color='white', fontsize=17)
fig.text(.025, .095, '静止画上の比率を使った表示校正。本家の速度・ギア・画角は未確定。他4系統の本家比率の個別一致は未検証。', color='#d4e2f2', fontsize=12)
fig.text(.025, .045, '出典：GAME Watch（2022-12-01）https://game.watch.impress.co.jp/docs/kikaku/1460351.html　画像 © Nintendo', color='#b4c1d0', fontsize=10)
fig.savefig(out / 'comparison.png', dpi=120, facecolor=fig.get_facecolor())
(out / 'image-measurement.json').write_text(json.dumps(dict(
    sources=items, relativeError=relative_error, tolerance=.01,
    coordinates='Pixel spans, approximate drum bounds. No ground-plane rectification; these are projected ratios, not retail world dimensions.',
), ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(reference=items[0]['ratio'], before=items[1]['ratio'], after=items[2]['ratio'], relativeError=relative_error)))
