#!/usr/bin/env python3
"""Read-only image check: python script.py <original-24.jpg> <output.json>.

Requires Pillow and numpy. No game values, models or reference image are written.
The floor homography uses guide/joint intersections, independently of ink edges.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

reference = json.loads((Path(__file__).resolve().parent.parent /
    'patches/splatoon3/reference/roller-overhead-2026-10-20.json').read_text())
source = reference['image']
raw = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == source['sha256'], 'Unreviewed reference image'
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
assert [im.shape[1], im.shape[0]] == source['size']


def homography(points):
    a, b = [], []
    for (x, y), (u, v) in zip(points, source['floorQuadCoordinates']):
        a.extend([[x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]])
        b.extend([u,v])
    return np.append(np.linalg.solve(a, b), 1).reshape(3,3)


def measure(matrix):
    rows = []
    x0, y0, x1, y1 = source['inkCrop']
    for y in range(y0, y1):
        r, g, b = im[y,x0:x1].T
        # Yellow-green connected body in the isolated normal-Roller region.
        xs = np.where((r>90)&(g>130)&(b<110)&(g-b>65))[0] + x0
        if not len(xs):
            continue
        p = matrix @ np.array([[min(xs),max(xs)],[y,y],[1,1]])
        p = p[:2] / p[2]
        rows.append({'imageY': y, 'left': float(p[0,0]), 'right': float(p[0,1]),
                     'widthInGuideIntervals': float(p[0,1]-p[0,0])})
    assert len(rows) >= 170, 'Reference body segmentation failed'
    return rows


h = homography(source['floorQuadPixels'])
rows = measure(h)
widths = [r['widthInGuideIntervals'] for r in rows]
# Check the unused right-hand guide as an independent perspective control.
# Its fitted image-space line comes from cyan pixels outside the ink crop.
right = []
for y in range(100,610):
    r,g,b = im[y,850:1100].T
    xs = np.where((g>115)&(b>90)&(g>r*1.2))[0] + 850
    if len(xs):
        p = h @ np.array([float(np.median(xs)),y,1])
        right.append(float(p[0]/p[2]))
right_error = float(np.median(np.abs(np.array(right)-2)))
assert right_error < .04, 'Floor calibration fails unused guide'

# Pixel-picking uncertainty, not a confidence interval for retail gameplay.
rng = np.random.default_rng(20261020)
medians = []
for _ in range(200):
    points = np.array(source['floorQuadPixels']) + rng.uniform(-2,2,(4,2))
    medians.append(float(np.median([r['widthInGuideIntervals'] for r in measure(homography(points))])))
result = {'reference': source, 'homography': h.tolist(), 'rows': rows,
    'medianWidthInGuideIntervals': float(np.median(widths)),
    'minWidthInGuideIntervals': min(widths), 'maxWidthInGuideIntervals': max(widths),
    'cornerJitterMedianBounds': [min(medians),max(medians)],
    'unusedGuideMedianError': right_error,
    'retailMaximumSpeedVerified': False, 'retailParityCertified': False,
    'note': 'This still has no speed/input history. Do not tune a maximum or a model to its measured median.'}
Path(sys.argv[2]).parent.mkdir(parents=True,exist_ok=True)
Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('reference','rows','homography')}))
