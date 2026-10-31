#!/usr/bin/env python3
"""Apply the baseline triangle method to the two isolated coordinate proposals.

Run from repository root:
 python docs/stage-redesign/map3/measure_proposal.py

No game files are changed or executed. Nominal vertical-sided proposal slabs
are not the runtime Level/R colliders; this comparison measures the stated
proposal geometry, including cover tops and buried/overlapping top faces.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np

from measure_baseline import geometry_metrics
import tidewater_design
import kelpline_design


HERE = Path(__file__).resolve().parent


def nominal_triangles(d):
    triangles, normals = [], []
    for kind in ('floors', 'ramps', 'obstacles'):
        for s in d[kind]:
            x0, x1, z0, z1 = s['rect']
            xz = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
            if kind == 'ramps':
                i = 0 if s['axis'] == 'x' else 1
                lo, hi = (x0, x1) if i == 0 else (z0, z1)
                top = [s['y0'] + (p[i] - lo) / (hi - lo) * (s['y1'] - s['y0']) for p in xz]
                bot = [v - s['thickness'] for v in top]
            else:
                top = [s['y'] if kind == 'floors' else s['y1']] * 4
                bot = [s['bottom'] if kind == 'floors' else s['y0']] * 4
            points = np.asarray([[x, y, z] for ys in (bot, top) for (x, z), y in zip(xz, ys)])
            center = points.mean(axis=0)
            faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
            for face in faces:
                p = points[list(face)]
                n = np.cross(p[1] - p[0], p[2] - p[0])
                n = n / np.linalg.norm(n)
                if np.dot(n, p.mean(axis=0) - center) < 0:
                    n = -n
                for ids in ((0, 1, 2), (0, 2, 3)):
                    triangles.append(p[list(ids)])
                    normals.append(n)
    return np.asarray(triangles), np.asarray(normals)


def main():
    baseline = json.loads((HERE / 'baseline-metrics.json').read_text())
    quarter = json.loads((HERE / 'baseline-resolution-check.json').read_text())
    medians = {'.5': baseline['nativeSummary']['projectedUnionSampleWU2']['median'],
               '.25': quarter['nativeMedianQuarterWU2']}
    rows = []
    for module in (tidewater_design, kelpline_design):
        d = module.build()
        t, n = nominal_triangles(d)
        x0, x1, z0, z1 = d['bounds']
        b = dict(minX=x0, maxX=x1, minZ=z0, maxZ=z1)
        a, c = [s['point'] for s in d['spawns']]
        by_step = {'.5': geometry_metrics(t, n, b, .5), '.25': geometry_metrics(t, n, b, .25)}
        for step, metrics in by_step.items():
            metrics['ratioToNativeMedianSameStep'] = metrics['projectedUnionSampleWU2'] / medians[step]
        rows.append(dict(id=d['id'], inputFile=Path(module.__file__).name,
                         inputSha256=hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest(),
                         bounds=b, boundsAreaWU2=(x1-x0)*(z1-z0),
                         spawnPads=[a, c], spawnDistance3DWU=math.dist(a, c),
                         floorCount=len(d['floors']), rampCount=len(d['ramps']), obstacleCount=len(d['obstacles']),
                         bySampleStepWU=by_step))
    out = dict(schema=1, units='WU, WU²; no calibrated SI conversion',
               method='Identical measure_baseline.geometry_metrics: upward normal.y >= .68, clip to configured XZ, raw projected and sloped sums, XZ union at cell centers with weighted boundary cells.',
               inclusion='All nominal floors, ramps and obstacle top faces, including grates and buried or overlapping faces. No subtraction for cover footprints, paint flags, inaccessibility, ceiling or route connectivity.',
               modelLimit='Proposal-only geometry. Slabs have vertical sides and nominal vertical thickness. No Level R toe extension or normal-thickness conversion, dressing, rails, runtime paint grid, Actor, camera, nav or ranked execution. Same calculation does not make proposal primitives exact engine geometry.',
               nativeReference='baseline-metrics.json and baseline-resolution-check.json; same clipping, normal threshold and sample step. Native inferred asset classification differs from hand-authored proposal primitives.',
               proposals=rows)
    (HERE / 'proposal-common-metrics.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    for row in rows:
        print(row['id'], 'union at .5/.25:', *(row['bySampleStepWU'][s]['projectedUnionSampleWU2'] for s in ('.5', '.25')))


if __name__ == '__main__':
    main()
