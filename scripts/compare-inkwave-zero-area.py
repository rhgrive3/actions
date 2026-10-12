#!/usr/bin/env python3
"""Strict decoded RGBA parity plus independent measured same-runner metrics."""
import json, pathlib, statistics, sys
from PIL import Image, ImageChops
root = pathlib.Path(sys.argv[1])
pairs = [('before', 'after')] if '--crowd' not in sys.argv else [('before-A','after-B'),('before-A2','after-B2')]
report = {'comparisons': [], 'rgbaEqual': True}
for before, after in pairs:
    a, b = root / before, root / after
    names_a, names_b = sorted(p.name for p in a.glob('*.png')), sorted(p.name for p in b.glob('*.png'))
    if not names_a or names_a != names_b:
        raise AssertionError(f'Incomplete image coverage: {before} {after}')
    checks=[]
    for name in names_a:
        ia, ib = Image.open(a/name).convert('RGBA'), Image.open(b/name).convert('RGBA')
        if ia.size != ib.size: raise AssertionError(f'Size changed: {name}')
        ba, bb = ia.tobytes(), ib.tobytes()
        changed = sum(ba[i:i+4] != bb[i:i+4] for i in range(0,len(ba),4))
        if changed:
            report['rgbaEqual'] = False
            ImageChops.difference(ia,ib).save(root / f'diff-{before}-{name}')
        checks.append({'image':name,'changedPixels':changed,'pixels':ia.width*ia.height})
    ja, jb = json.loads((a/'gallery.json').read_text()), json.loads((b/'gallery.json').read_text())
    assert not ja['errors'] and not jb['errors'], 'Browser errors'
    assert [r['id'] for r in ja['rows']] == [r['id'] for r in jb['rows']], 'Weapon coverage'
    for ra,rb in zip(ja['rows'],jb['rows']):
        for key in ['muzzle','size','maxGrip','nonFinite','firingFrames','weaponKind','weaponModel','drawCalls']:
            assert ra.get(key)==rb.get(key),f'Contract changed: {ra["id"]} {key}'
    report['comparisons'].append({'before':before,'after':after,'images':checks,'baseline':ja,'candidate':jb})
if '--crowd' in sys.argv:
    summary={}
    for tier in ['game','far']:
        data={name:json.loads((root/name/'gallery.json').read_text())['rows'][0]['crowd'][tier] for pair in pairs for name in pair}
        reference=data['before-A']
        for name, row in data.items():
            for key in ['actors','ids','visited','visible','meshes','drawCalls','rendererGeometries']:
                assert row[key]==reference[key],f'Traversal/draw contract changed: {name} {tier} {key}'
        metrics={}
        for metric in ['animationMs','renderSubmitMs','renderCompleteMs']:
            metrics[metric]={}
            for percentile in ['p50','p95']:
                before=statistics.mean(data[n][metric][percentile] for n in ['before-A','before-A2'])
                after=statistics.mean(data[n][metric][percentile] for n in ['after-B','after-B2'])
                metrics[metric][percentile]={'beforeMs':before,'afterMs':after,'deltaMs':after-before,'deltaPercent':100*(after/before-1) if before else None}
        summary[tier]={'runs':data,'measured':metrics}
    report['performance']=summary
(root/'comparison.json').write_text(json.dumps(report,indent=2))
print('ZERO_AREA_COMPARISON '+json.dumps({'rgbaEqual':report['rgbaEqual'],'imagePairs':sum(len(c['images']) for c in report['comparisons']),'performance':report.get('performance')}))
assert report['rgbaEqual'], 'Decoded full-RGBA mismatch; inspect comparison.json and diff images'
