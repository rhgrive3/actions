#!/usr/bin/env python3
"""Read-only verification of committed evidence; Python standard library only.

Run from any directory: python3 /path/to/this/report/verify-evidence.py
No browser, original assets, generated site, network, scratch files or writes are
required. Source/content checks verify archived receipt consistency, not a new
application build or CI/merge/hardware-performance acceptance.
"""
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
BASELINE = 'e0072a749df0ec8c2d368e383bdf337baa7b44ad'
CANDIDATE = '65fa7f183d2d163af798972c2ff0ced46a92868f'
HARNESS = '101a74df5a39de3730c06c3dbd677a2c0fbf702f1df9d71408b4da285170fdb2'
CONTENT = {
    'baseline': '83772a6fa910e158b9f1b139d6c187a840b73ec24cd7be043a7bf556530ed898',
    'baseline-native': '1cce60c8fc2f1d76a01ca89780aaa033eaa89fb98e14f9f71024d42855bbb036',
    'candidate': '3eb1f3dc5eade6c994053877fbb38bd054a33ce0e7714d2159a1106591ea605b',
}
PAIRS = {
    'crab': ('baseline-crab-clean', 'candidate-crab-clean'),
    'raf18': ('baseline-raf-18', 'candidate-raf-18'),
    'native': ('baseline-native-final', 'candidate-native-final'),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    data = path.read_bytes()
    return json.loads(gzip.decompress(data) if path.suffix == '.gz' else data)


def near(actual, expected, message):
    require(math.isfinite(actual) and math.isfinite(expected)
            and math.isclose(actual, expected, rel_tol=1e-11, abs_tol=1e-8),
            f'{message}: {actual!r} != {expected!r}')


def indexed_path(index, name):
    require(isinstance(name, str) and not Path(name).is_absolute(),
            f'{index.name}: expected relative indexed filename')
    target = (index.parent / name).resolve()
    require(target.is_relative_to(ROOT), f'{index.name}: path escapes report: {name}')
    require(target.is_file(), f'Missing indexed file: {target.relative_to(ROOT)}')
    return target


def verify_indices():
    covered, count = set(), 0
    indices = [ROOT / 'evidence-hashes.json', *sorted(ROOT.rglob('files.json')),
               ROOT / 'local-verification.json']
    for index in indices:
        records = read_json(index)
        if index.name == 'local-verification.json':
            records = records['logs']
        for name, meta in records.items():
            target = indexed_path(index, name)
            data = target.read_bytes()
            require(digest(data) == meta['sha256'], f'Indexed SHA mismatch: {name}')
            decoded = gzip.decompress(data) if target.suffix == '.gz' else data
            if 'uncompressedSha256' in meta:
                require(digest(decoded) == meta['uncompressedSha256'],
                        f'Decoded SHA mismatch: {name}')
            if 'bytes' in meta:
                # Main raw index counts expanded JSON; inventory index counts
                # stored files. These are the two documented index schemas.
                size = len(decoded) if index.name == 'evidence-hashes.json' else len(data)
                require(meta['bytes'] == size, f'Indexed byte count mismatch: {name}')
            covered.add(target)
            count += 1
    missing = {p.resolve() for p in ROOT.rglob('*.gz')} - covered
    require(not missing, f'Gzip files absent from indices: {sorted(map(str, missing))}')
    return count


def weighted(windows, field):
    count = sum(w[field]['n'] for w in windows)
    require(count > 0, f'Missing {field} samples')
    return sum(w[field]['mean'] * w[field]['n'] for w in windows if w[field]['n']) / count


def observed_cpu(run):
    pids = {}
    for sample in run['samples']:
        require(sample['processes'], 'Empty process sample')
        for process in sample['processes']:
            value = process.get('cpuSeconds')
            if value is None:
                continue
            require(math.isfinite(value) and value >= 0, 'Invalid process CPU counter')
            rec = pids.setdefault(process['pid'], [process['type'], value, value])
            require(rec[0] == process['type'], 'PID type changed during sampling')
            rec[1], rec[2] = min(rec[1], value), max(rec[2], value)
    totals = {}
    for typ, low, high in pids.values():
        totals[typ] = totals.get(typ, 0) + high - low
    return totals


def api_draws(windows, labels):
    total, frames = 0, 0
    for window in windows:
        warm = labels[window['label'].replace('combat-', 'warm-')]
        delta = window['resources']['draws'] - warm['resources']['draws']
        require(delta >= 0, 'Negative combat draw-call delta')
        total += delta
        frames += window['windowFrames']
    require(frames > 0, 'Missing observed combat frames')
    return total, frames, total / frames


def verify_run(name, key, side, summary, measurement):
    run = read_json(ROOT / f'{name}.json.gz')
    require(run['sourceSha'] == (BASELINE if side == 0 else CANDIDATE), f'{name}: source SHA')
    content_key = 'candidate' if side else ('baseline-native' if key == 'native' else 'baseline')
    require(run['contentHash'] == CONTENT[content_key], f'{name}: content hash')
    require(run['harnessHash'] == HARNESS, f'{name}: harness hash')
    require(digest(json.dumps(run['harnessFiles'], separators=(',', ':')).encode()) == HARNESS,
            f'{name}: harness dependency receipt')
    require(run['status'] == 'passed' and run['errors'] == [], f'{name}: failed/incomplete run')
    require(run['conditions']['processScope'] == 'Linux browser process tree including zygotes',
            f'{name}: process scope')
    windows = run['windows']
    labels = {w['label']: w for w in windows}
    require(len(labels) == len(windows), f'{name}: duplicate windows')
    require(windows[-1]['label'] == 'final' and windows[-1]['gc'], f'{name}: final GC receipt')
    observed_errors = {w['label']: w['glError'] for w in windows if w['glError']}
    expected_errors = {'warm-0': 1282, 'warm-2': 1282} if name == 'baseline-native-final' else {}
    require(observed_errors == expected_errors, f'{name}: unexpected raw GL observations')
    require(summary['observedGlErrors'] == observed_errors, f'{name}: GL summary')
    previous_draws = -1
    for window in windows:
        require(not any(window[k] for k in ('contextLost', 'frozen', 'skipRender')),
                f'{name}/{window["label"]}: context/freeze/render failure')
        draws = window['resources']['draws']
        require(type(draws) is int and draws >= 0 and draws >= previous_draws,
                f'{name}: invalid/nonmonotonic WebGL draw counter')
        previous_draws = draws
    cycles = {'crab': 6, 'raf18': 18, 'native': 3}[key]
    require(run['conditions']['cycles'] == cycles, f'{name}: cycle count')
    for prefix in ('warm-', 'combat-', 'released-'):
        require({w['label'] for w in windows if w['label'].startswith(prefix)}
                == {f'{prefix}{i}' for i in range(cycles)}, f'{name}: missing {prefix} window')
    combat = [labels[f'combat-{i}'] for i in range(cycles)]
    for window in combat:
        require(window['state'] == 'playing' and window['actors'] == 8
                and any(v > 0 for v in window['coverage'])
                and window['windowFrames'] == window['frames']['n'] > 0,
                f'{name}: invalid combat window')
    wall = sum(w['elapsedSeconds'] - labels[w['label'].replace('combat-', 'warm-')]['elapsedSeconds']
               for w in combat)
    frames = sum(w['windowFrames'] for w in combat)
    require(wall > 0, f'{name}: nonpositive combat wall time')
    computed = {
        'seconds': run['samples'][-1]['elapsedSeconds'],
        'peakPssMiB': max(sum(p['pssKiB'] for p in s['processes']) for s in run['samples']) / 1024,
        'peakUssMiB': max(sum(p['ussKiB'] for p in s['processes']) for s in run['samples']) / 1024,
        'finalHeapMiB': windows[-1]['metrics']['JSHeapUsedSize'] / 1048576,
        'combatFrames': frames, 'combatWallSeconds': wall, 'aggregateCombatFps': frames / wall,
        'frameCpuWallMeanMs': weighted(combat, 'frameCpu'),
        'renderGpuMeanMs': weighted(combat, 'gpuRenderMs'), 'drawCallsMean': weighted(combat, 'calls'),
    }
    for field, value in computed.items():
        near(value, summary[field], f'{name}/{field}')
    require(summary['perWindowIntervalP95Ms'] == [w['frames']['p95'] for w in combat],
            f'{name}: per-window p95 list')
    cpu = observed_cpu(run)
    require(cpu.keys() == summary['cpuObservedDeltaSecondsByType'].keys(), f'{name}: CPU types')
    for typ, value in cpu.items():
        near(value, summary['cpuObservedDeltaSecondsByType'][typ], f'{name}/CPU/{typ}')
    for i, row in enumerate(summary['released']):
        window = labels[f'released-{i}']
        require(window['gc'] and row['cycle'] == i + 1, f'{name}: exit GC/index')
        near(row['heapMiB'], window['metrics']['JSHeapUsedSize'] / 1048576, f'{name}: exit heap')
        require(row['apiLive'] == {k: v['live'] for k, v in window['resources']['resources'].items()},
                f'{name}: exit API resources')
        require(row['inkFlightPool'] == window['inkFlightPool'], f'{name}: exit pool')
    require(len(summary['released']) == cycles, f'{name}: exit summary count')
    require(summary['finalCrab'] == windows[-1]['crab']
            and summary['finalPool'] == windows[-1]['inkFlightPool'], f'{name}: final ownership summary')
    for field in ('sourceSha', 'contentHash', 'harnessHash', 'harnessFiles', 'conditions', 'status'):
        require(measurement[field] == run[field], f'{name}: measurement receipt {field}')
    for field in ('peakPssMiB', 'peakUssMiB'):
        near(measurement[field], computed[field], f'{name}: measurement {field}')
    if key == 'crab':
        require(run['lifecycleStatus'] == ('leak-observed' if side == 0 else 'released'),
                f'{name}: Crab lifecycle verdict')
        require(len(windows[-1]['crab']) == 6 and all(
            rec['created'] == 1 and rec['inScene'] == (side == 0)
            and rec['geometryDisposed'] == side and rec['materialDisposed'] == side
            for rec in windows[-1]['crab']), f'{name}: Crab disposal receipts')
    if key == 'native':
        require([w['map'] for w in combat] == ['scorch', 'tidewater', 'scorch']
                and run['conditions']['viewport'] == [1133, 744]
                and run['conditions']['deviceScaleFactor'] == 2, f'{name}: native display/stage conditions')
    groups = ({stage: [w for w in combat if w['map'] == stage]
               for stage in ('tidewater', 'kelpline', 'halyard')} if key == 'raf18'
              else {w['label']: [w] for w in combat} if key == 'native' else {})
    return run, {group: api_draws(items, labels) for group, items in groups.items()}


def verify_primary():
    comparison = read_json(ROOT / 'final-comparison.json')
    measurements = read_json(ROOT / 'measurements.json')
    markdown = (ROOT / 'measurement-tables.md').read_text()
    for key, names in PAIRS.items():
        runs, draw_tables = [], []
        for side, name in enumerate(names):
            run, draws = verify_run(name, key, side, comparison[key]['runs'][name], measurements[name])
            runs.append(run)
            draw_tables.append(draws)
        require(runs[0]['harnessFiles'] == runs[1]['harnessFiles'], f'{key}: dependency mismatch')
        conditions = [dict(run['conditions']) for run in runs]
        if key == 'crab':
            require(conditions[0].pop('expectedLifecycle') == 'leak-observed'
                    and conditions[1].pop('expectedLifecycle') == 'released', 'Crab expectations')
        require(conditions[0] == conditions[1], f'{key}: pair condition mismatch')
        conditions[0].pop('expectedLifecycle', None)
        require(conditions[0] == comparison[key]['conditions'], f'{key}: summary conditions')
        for group in draw_tables[0]:
            before, after = draw_tables[0][group], draw_tables[1][group]
            text = (f'| {before[0]} / {after[0]} | {before[1]} / {after[1]} | '
                    f'{before[2]:,.2f} / {after[2]:,.2f} |')
            require(text in markdown, f'{key}/{group}: actual API draw table differs from raw')


def main():
    try:
        count = verify_indices()
        verify_primary()
    except (ValueError, KeyError, TypeError, OSError, EOFError, ZeroDivisionError) as error:
        print(f'Evidence verification FAILED: {error}', file=sys.stderr)
        return 1
    print(f'Evidence verification passed: {count} indexed SHA/gzip receipts; all six final runs; '
          'source/content/harness/conditions; exact native-baseline GL1282 controls; '
          'PSS/USS/heap/CPU/timing/draw arithmetic. No files written.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
