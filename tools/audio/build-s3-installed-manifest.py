#!/usr/bin/env python3
"""Build a verified-only same-origin Splatoon 3 sample manifest.
Original source mapping remains immutable; only local validated MP3s are enabled.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path


def generate(source: Path, root: Path, output: Path):
    planned = json.loads(source.read_text(encoding='utf-8'))
    processed = {}
    installed = []
    for clip in planned['clips']:
        filename = Path(clip['file']).name
        if filename != clip['sourceName'] or '/' in filename or not filename.endswith('.mp3'):
            raise ValueError('Invalid reference mapping: ' + repr(clip))
        if filename not in processed:
            path = root / filename
            processed[filename] = None
            if path.is_file():
                proc = subprocess.run(
                    ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name,duration', '-of', 'json', str(path)],
                    check=True, capture_output=True, text=True, timeout=15)
                fmt = json.loads(proc.stdout)['format']
                if 'mp3' not in fmt['format_name'] or float(fmt['duration']) <= 0:
                    raise ValueError('Invalid MP3 ' + filename)
                processed[filename] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                       'durationSeconds': round(float(fmt['duration']), 5),
                                       'verification': 'locally-decoded-mp3'}
        info = processed[filename]
        if info:
            if clip.get('sha256') and info['sha256'].lower() != clip['sha256'].lower():
                raise ValueError(f'Source SHA256 mismatch {filename}: manifest {clip["sha256"]} vs MP3 {info["sha256"]}')
            installed.append({**clip, **info})
    result = {**{k:v for k,v in planned.items() if k != 'clips'}, 'clips': installed,
              'installedFiles': sum(v is not None for v in processed.values()),
              'plannedFiles': len(processed),
              'installedEventVariants': len(installed)}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Installed: {result['installedFiles']} / {result['plannedFiles']} sources; {len(installed)} / {len(planned['clips'])} event variants")
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, default=Path('patches/splatoon3/runtime/audio/real-s3-samples.json'))
    p.add_argument('--root', type=Path, default=Path('patches/splatoon3/runtime/audio/s3-real'))
    p.add_argument('--output', type=Path, default=Path('patches/splatoon3/runtime/audio/real-s3-installed.json'))
    args = p.parse_args(); generate(args.source, args.root, args.output)
