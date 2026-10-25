#!/usr/bin/env python3
"""Compare seeded emitted-special browser evidence, including decoded RGBA.

Requires Pillow. Run the browser driver with the same --seed for both builds.
This checks the controlled diagnostic scenes, not retail or device FPS parity.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


def compare(before_dir, after_dir):
    before = json.loads((before_dir / 'special-presentation-result.json').read_text())
    after = json.loads((after_dir / 'special-presentation-result.json').read_text())
    for result in [before, after]:
        if result.get('status') != 'passed' or result.get('errors'):
            raise ValueError('Both browser runs must have passed without errors')
        if not isinstance(result.get('seed'), int):
            raise ValueError('Run both browser checks with an explicit --seed')
    if before['seed'] != after['seed'] or before['browser'] != after['browser']:
        raise ValueError('Seed and browser version must match')
    if before['driverSHA256'] != after['driverSHA256']:
        raise ValueError('Use the same browser driver for both builds')
    fields = ['rows', 'nativeExtra', 'cloudDrawCalls', 'nativeCloudRetirements',
              'baseline', 'after', 'vfxResources', 'fixture']
    for field in fields:
        if before[field] != after[field]:
            raise ValueError('Native/presentation/resource result differs: ' + field)
    files = sorted(p.name for p in before_dir.glob('*.png'))
    if not files or files != sorted(p.name for p in after_dir.glob('*.png')):
        raise ValueError('Screenshot inventories differ or are empty')
    images = []
    for name in files:
        a = Image.open(before_dir / name).convert('RGBA')
        b = Image.open(after_dir / name).convert('RGBA')
        if a.size != b.size:
            raise ValueError('Image dimensions differ: ' + name)
        # RGB differences must also be detected when alpha is identical.
        if any(channel.getbbox() for channel in ImageChops.difference(a, b).split()):
            raise ValueError('RGBA pixel mismatch: ' + name)
        images.append({'file': name, 'size': list(a.size),
                       'rgbaSHA256': hashlib.sha256(a.tobytes()).hexdigest()})
    return {'status': 'passed', 'seed': before['seed'], 'browser': before['browser'],
            'driverSHA256': before['driverSHA256'], 'equalFields': fields,
            'beforeContentHash': before['contentHash'],
            'afterContentHash': after['contentHash'], 'images': images}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.before, args.after)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'images': len(result['images']),
                      'out': str(args.out)}))
