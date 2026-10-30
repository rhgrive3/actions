#!/usr/bin/env python3
"""Compare matched full-frame replays and their separately captured images."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('reference', type=Path)
parser.add_argument('candidate', type=Path)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--min-speedup', type=float, default=1.3)
parser.add_argument('--images-only', action='store_true', help='Validate RGB/alpha and final replay state without claiming FPS')
args = parser.parse_args()

before = json.loads((args.reference / 'result.json').read_text())
after = json.loads((args.candidate / 'result.json').read_text())
errors = []
for label, result in [('reference', before), ('candidate', after)]:
    if result['status'] != 'passed':
        errors.append(f'{label}: replay did not pass')
    if result['errors']:
        errors.append(f'{label}: browser errors')
    if bool(result.get('imagesOnly')) != args.images_only:
        errors.append(f'{label}: measurement mode differs from comparator mode')
    if not args.images_only and len(result['windows']) < 3:
        errors.append(f'{label}: at least three complete windows required')
    if any(w['newPrograms'] for w in result['windows']):
        errors.append(f'{label}: cold shader in measured windows')

for key in ['stage', 'quality', 'setupFrames', 'warmup', 'frames', 'runs']:
    if before[key] != after[key]:
        errors.append(f'mismatched {key}')
for key in ['syncFrames','occlusionChecks','imagesOnly']:
    if bool(before.get(key)) != bool(after.get(key)):
        errors.append(f'mismatched {key}')
if before.get('activePreroll',0)!=after.get('activePreroll',0):
    errors.append('mismatched active preroll')
for key in ['native', 'actors', 'bots', 'state', 'quality', 'atlas', 'sourceSha256', 'renderer','device','framebuffer','paused','menu','textureQuality','textureLimit','textureCount']:
    if before['setup'].get(key) != after['setup'].get(key):
        errors.append(f'mismatched setup: {key}')
for key in ['cpu', 'node', 'viewport', 'renderer','browser','browserVersion','device']:
    if before['environment'].get(key) != after['environment'].get(key):
        errors.append(f'mismatched environment: {key}')

pairs = []
if args.images_only and before.get('semantic') != after.get('semantic'):
    errors.append('image replay: final actor/paint state differs')
if len(before['windows']) != len(after['windows']):
    errors.append('window counts differ')
for a, b in zip(before['windows'], after['windows']):
    for key in ['run', 'firstStep', 'frames', 'traceSha256', 'actors', 'paint', 'quality', 'scale', 'state', 'glError']:
        if a[key] != b[key]:
            errors.append(f'window {a["run"]}: mismatched {key}')
    pairs.append({'run': a['run'], 'firstStep': a['firstStep'], 'frames': a['frames'],
                  'referenceFps': a['fps'], 'candidateFps': b['fps'],
                  'speedup': b['fps'] / a['fps'], 'traceSha256': a['traceSha256'],
                  'gridSha256': a['paint']['gridSha256']})

images = []
views=['forward', 'left', 'back', 'right']
if before.get('occlusionChecks'):
    views+=['feet-lowered','feet-raised','window-off']
for name in views:
    files = [args.reference / (name + '.png'), args.candidate / (name + '.png')]
    if not all(f.exists() for f in files):
        errors.append(f'{name}: missing image')
        continue
    a, b = [np.asarray(Image.open(f).convert('RGBA'), dtype=np.int16) for f in files]
    if a.shape != b.shape:
        errors.append(f'{name}: image dimensions differ')
        continue
    delta = np.abs(a - b)
    mean = float(delta[:, :, :3].mean())
    p99 = float(np.percentile(delta[:, :, :3], 99))
    alpha = int(delta[:, :, 3].max())
    images.append({'view': name, 'width': a.shape[1], 'height': a.shape[0],
                   'meanRgbDelta': mean, 'p99RgbDelta': p99, 'maxDelta': int(delta.max()),
                   'changedPixels': int(np.any(delta != 0, axis=2).sum()), 'maxAlphaDelta': alpha,
                   'sha256': [hashlib.sha256(f.read_bytes()).hexdigest() for f in files]})
    # Existing material-native image budget, in 8-bit output channel levels.
    if mean > 1.25 or p99 > 3 or alpha:
        errors.append(f'{name}: image difference exceeds mean<=1.25/p99<=3/alpha=0')

def throughput(result):
    windows = result['windows']
    return sum(w['frames'] for w in windows) * 1000 / sum(w['elapsedMs'] for w in windows)

reference_fps, candidate_fps = (None,None) if args.images_only else (throughput(before), throughput(after))
speedup = None if args.images_only else candidate_fps / reference_fps
if speedup is not None and speedup < args.min_speedup:
    errors.append(f'whole-frame speedup {speedup:.4f} below {args.min_speedup}')
report = {'schema': 1, 'status': 'failed' if errors else 'passed', 'errors': errors,
          'referenceContentHash': before['contentHash'], 'candidateContentHash': after['contentHash'],
          'environment': before['environment'], 'stage': before['stage'], 'quality': before['quality'],
          'referenceFps': reference_fps, 'candidateFps': candidate_fps, 'speedup': speedup,
          'fpsImprovementPercent': None if speedup is None else (speedup - 1) * 100, 'pairs': pairs, 'images': images,
          'referenceCompletedFrameMs':before.get('completedFrameMs'),
          'candidateCompletedFrameMs':after.get('completedFrameMs'),
          'limits': [before['measurement'], 'This is one matched replay with three timed windows, not a physical GPU or whole-device benchmark.']}
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'errors', 'referenceFps', 'candidateFps', 'fpsImprovementPercent']}))
raise SystemExit(bool(errors))
