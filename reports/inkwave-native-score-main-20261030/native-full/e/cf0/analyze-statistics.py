#!/usr/bin/env python3
"""Saved-file independent descriptive analysis; no browser, profiling, or reruns."""
import collections
import datetime
import hashlib
import json
import math
import pathlib
import statistics

D = pathlib.Path(__file__).resolve().parent
raw = (D / 'result.json').read_bytes()
r = json.loads(raw)
a = json.loads((D / 'analysis.json').read_text())
p = json.loads((D / 'full-plan.json').read_text())
assert r['status'] == 'passed'
assert a['resultSha256'] == hashlib.sha256(raw).hexdigest()
assert [len(r[k]) for k in ('warmups', 'preflight', 'measurements', 'parityPairs', 'rejectedWindowAttempts')] == [20, 8, 16, 22, 0]
exit_record = json.loads((D / 'exit.json').read_text())
assert exit_record['exitCode'] == 0 and exit_record['resultStatus'] == 'passed'
assert exit_record['resultSha256'] == a['resultSha256']

def quantile(xs, q):
    ys = sorted(xs)
    n = (len(ys) - 1) * q
    lo, hi = math.floor(n), math.ceil(n)
    return ys[lo] + (ys[hi] - ys[lo]) * (n - lo)

def stats(xs):
    xs = list(xs)
    assert xs and all(math.isfinite(x) for x in xs)
    return dict(n=len(xs), mean=statistics.mean(xs), sd=statistics.stdev(xs) if len(xs) > 1 else None,
                median=statistics.median(xs), min=min(xs), p05=quantile(xs, .05), p95=quantile(xs, .95), max=max(xs))

T95 = {1: 12.7062047364, 2: 4.3026527297, 3: 3.1824463053, 4: 2.7764451052,
       5: 2.5705818356, 6: 2.4469118488, 7: 2.3646242510, 8: 2.3060041352,
       9: 2.2621571629, 10: 2.2281388520}

def ratio_stats(xs):
    d = stats(xs)
    logs = list(map(math.log, xs))
    lm = statistics.mean(logs)
    margin = T95[len(xs)-1] * statistics.stdev(logs) / math.sqrt(len(xs))
    d.update(geometricMean=math.exp(lm), logRatioTInterval95=[math.exp(lm-margin), math.exp(lm+margin)])
    d['changePercent'] = 100 * (d['geometricMean'] - 1)
    d['changePercentInterval95'] = [100 * (x - 1) for x in d['logRatioTInterval95']]
    return d

all_rows = r['warmups'] + r['preflight'] + r['measurements']
all_rows.sort(key=lambda w: w['startedAt'])
groups = collections.defaultdict(list)
parity_keys = ['initial','frames','hz','ticks','minActors','minLiving','digest','digests','counts','state','draw',
               'resources','scene','sceneRenderCalls','drawnActorFrames','poseDigests','poseDigest','budgetWork','bvh']
gpu_pid = r['environment']['affinity']['gpuPid']
thread_snapshots = 0
for w in all_rows:
    assert w['frames'] == w['ticks'] == 900 and w['hz'] == 60
    assert w['initial']['actors'] == w['minActors'] == w['initial']['sourceCharacters'] == 8
    assert w['initial']['bots'] == 7 and w['initial']['native'] is True
    assert w['initial']['triangles'] > 0 and w['initial']['paintFaces'] > 0
    assert w['sceneRenderCalls'] == 0 and w['renderRequested'] is False
    assert w['draw']['calls'] > 0 and w['draw']['triangles'] > 0
    assert not w['errors'] and not w['contextLost'] and w['state'] == 'playing'
    assert len(w['times']) == len(w['digests']) == 900
    assert abs(statistics.mean(w['times']) - w['frameMeanMs']) < 1e-9
    assert w['postWindow']['ticks'] == w['postWindow']['afterTicks'] == w['initial']['clockTicks'] + 900
    assert w['postWindow']['hidden'] is False and w['visibility']['hidden'] is False
    assert w['buildSide'] == ('a' if w['phase'] == 'preflight' else w['side'])
    for when in ('before', 'after'):
        snap = w['affinity'][when]
        assert snap['status'] == 'verified' and snap['violations'] == []
        assert [q['pid'] for q in snap['snapshot']['processes'] if q['type'] == 'GPU'] == [gpu_pid]
        for proc in snap['snapshot']['processes']:
            for thread in proc['threads']:
                assert thread['allowedCpus'] == ([0, 1] if proc['type'] == 'GPU' else [2, 3])
                thread_snapshots += 1
    groups[w['phase'], w['kind'], w['replayOrdinal']].append(w)
assert len(groups) == 22
pairs = []
for key, rows in groups.items():
    rows.sort(key=lambda w: w['side'])
    assert len(rows) == 2 and [w['side'] for w in rows] == ['a', 'b']
    for k in parity_keys:
        assert rows[0][k] == rows[1][k], (key, k)
    pairs.append(dict(phase=key[0], kind=key[1], replayOrdinal=key[2], status='exact-recorded-parity',
                      digest=rows[0]['digest'], paintCounts=rows[0]['counts'], bvh=rows[0]['bvh'], draw=rows[0]['draw']))

phases = {}
metric_names = ('frameMeanMs', 'rendererThreadMsPerTick')
for phase in ('preflight', 'measurements'):
    rows = r[phase]
    quartets = []
    for i in range(0, len(rows), 4):
        g = rows[i:i+4]
        assert [w['side'] for w in g] == ['a', 'b', 'b', 'a']
        assert [w['slot'] for w in g] == [0, 1, 2, 3]
        assert len({w['round'] for w in g}) == 1
        metrics = {}
        for name in metric_names:
            ma = statistics.mean(w[name] for w in g if w['side'] == 'a')
            mb = statistics.mean(w[name] for w in g if w['side'] == 'b')
            metrics[name] = dict(a=ma, b=mb, ratio=mb/ma, changePercent=100*(mb/ma-1), differenceMs=mb-ma)
        quartets.append(dict(round=g[0]['round'], metrics=metrics))
    sides = {}
    for side in ('a','b'):
        ws = [w for w in rows if w['side'] == side]
        deltas = [{k: w['cgroup']['after'][k] - v for k, v in w['cgroup']['before'].items()} for w in ws]
        sides[side] = dict(
            windowMetrics={name: stats(w[name] for w in ws) for name in metric_names},
            pooledFramesDescriptiveOnly=stats(t for w in ws for t in w['times']),
            heapUsedBytesBefore=stats(w['heap']['before']['JSHeapUsedSize'] for w in ws),
            heapUsedBytesAfter=stats(w['heap']['after']['JSHeapUsedSize'] for w in ws),
            heapUsedBytesDelta=stats(w['heap']['after']['JSHeapUsedSize']-w['heap']['before']['JSHeapUsedSize'] for w in ws),
            heapTotalBytesBefore=stats(w['heap']['before']['JSHeapTotalSize'] for w in ws),
            heapTotalBytesAfter=stats(w['heap']['after']['JSHeapTotalSize'] for w in ws),
            heapUsedNegativeDeltaWindows=sum(w['heap']['after']['JSHeapUsedSize']<w['heap']['before']['JSHeapUsedSize'] for w in ws),
            cgroupDeltaTotals={k: sum(d[k] for d in deltas) for k in deltas[0]},
            throttledWindows=sum(d['nr_throttled']>0 for d in deltas),
            frameP95Ms=stats(w['frameStats']['p95'] for w in ws),
            frameMaxMs=stats(w['frameStats']['max'] for w in ws),
            evaluationWallMs=stats(w['evaluationWallMs'] for w in ws))
    phases[phase] = dict(quartets=quartets, ratioStatistics={name: ratio_stats([q['metrics'][name]['ratio'] for q in quartets]) for name in metric_names}, sides=sides)

warmup_stats = {phase: {side: {name: stats(w[name] for w in r['warmups'] if w['phase']==phase and w['side']==side)
                           for name in metric_names} for side in ('a', 'b')} for phase in ('preflight', 'measurements')}
windows = []
for w in all_rows:
    d = {k: w[k] for k in ('phase','kind','round','slot','side','buildSide','replayOrdinal','startedAt','completedAt',
                         'frameMeanMs','frameStats','rendererThreadMsPerTick','heap','frameBlocks100','evaluationWallMs',
                         'bvh','counts','draw','digest','poseDigest','budgetWork','audioWork')}
    d['cgroupDelta'] = {k: w['cgroup']['after'][k]-v for k,v in w['cgroup']['before'].items()}
    windows.append(d)

a['independentStatistics'] = dict(analyzedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    quantileMethod='linear interpolation at (n-1)*q; raw report p95 uses its original harness convention',
    inference='Primary replication unit is an ABBA quartet; log-ratio Student-t 95% interval. Two A/A and four A/B quartets are too few to establish robust normality or independence. Persistent interference and serial drift can invalidate interval coverage. Window/frame summaries are descriptive only.',
    phases=phases, warmups=warmup_stats, all44Windows=windows, all22Pairs=pairs,
    validation=dict(exactPairs=22, windows=44, recordedThreadSnapshots=thread_snapshots, sameGpuPid=gpu_pid,
                    sourceLfsReceipts='verified by saved-file analyze.mjs readback',sceneRenderCalls=0,
                    paintAtlasDrawsActive=True,errors=0,contextLoss=0,rejectedWindowAttempts=0,exitCode=0),
    heapInterpretation='Unforced ordinary runtime GC remains active. Pre/post heap changes cannot identify individual GC events, prove leak absence, or attribute timing effects. No allocation/GC profiling was run.')
a['independentStatistics']['controlComparison'] = {
    name: dict(aaGeometricRatio=phases['preflight']['ratioStatistics'][name]['geometricMean'],
               abGeometricRatio=phases['measurements']['ratioStatistics'][name]['geometricMean'],
               exploratoryRatioOfRatios=phases['measurements']['ratioStatistics'][name]['geometricMean']/phases['preflight']['ratioStatistics'][name]['geometricMean'],
               interpretation='Descriptive sensitivity only. Separate phases may have different interference or state; this is not a validated noise correction or causal estimate.')
    for name in metric_names}
(D/'analysis.json').write_text(json.dumps(a,indent=2)+'\n')

def num(x, digits=3): return f'{x:.{digits}f}'
def pct(x): return f'{x:+.2f}%'
lines = [
    '# Native battle benchmark cf0', '',
    f"Saved result: `{a['resultSha256']}` ({len(raw):,} bytes). Status **passed**, launcher exit **0**.", '',
    f"A: `{r['builds']['a']['sourceSha']}`; B: `{r['builds']['b']['sourceSha']}`.", '',
    'Hagglefish native, low, 480×300, shooter, eight actors/seven bots, 900 fixed ticks per window at 60 Hz. Scene submissions are disabled (`_skipRender=true`); paint-atlas draws remain active on software GPU. Worker CPUs 2–3 and GPU CPUs 0–1 are disjoint under a four-core cgroup quota. No profiling, forced GC, outlier exclusion, automatic retry, or post-launch affinity changes.', '',
    f"44/44 windows retained: 20 warmups, 8 A/A measured windows, 16 A/B measured windows. 22/22 matched-ordinal pairs pass exact recorded parity. GPU PID {gpu_pid}; {thread_snapshots:,} observed thread entries across before/after snapshots satisfy affinity. No page errors, context loss, or rejected windows.", '',
    '## Timing result and uncertainty', '',
    'Ratios are B/A, so negative changes mean lower cost. A/A uses build A on both pages. Each estimate uses all predeclared ABBA quartets; frames are not independent replications. Intervals are descriptive Student-t 95% intervals over log quartet ratios, conditional on approximate normality and independence.', '',
    '| Phase | Metric | Quartets | Geometric B/A | Change | 95% change interval | Quartet min–max |',
    '|---|---|---:|---:|---:|---:|---:|'
]
for phase, label in [('preflight','A/A'),('measurements','A/B')]:
    for name in metric_names:
        s=phases[phase]['ratioStatistics'][name]
        lo,hi=s['changePercentInterval95']
        lines.append(f"| {label} | {name} | {s['n']} | {s['geometricMean']:.5f} | {pct(s['changePercent'])} | {pct(lo)} to {pct(hi)} | {s['min']:.5f}–{s['max']:.5f} |")
lines += ['', 'The A/A control quantifies noise in this run; its state-parity pass does not imply acceptable timing noise. Four A/B quartets and two A/A quartets provide limited uncertainty information. The same-run observations do not establish repeatability across hosts, sessions, stages, rendering settings, or devices.', '']
for name in metric_names:
    aa=phases['preflight']['ratioStatistics'][name]
    ab=phases['measurements']['ratioStatistics'][name]
    adj=ab['geometricMean']/aa['geometricMean']
    lines.append(f"Same-build A/A `{name}` shows an apparent {pct(aa['changePercent'])} change (quartets {pct(100*(aa['min']-1))} to {pct(100*(aa['max']-1))}). The A/B-to-A/A ratio of geometric ratios is {adj:.5f} ({pct(100*(adj-1))}); this is only a sensitivity description, not a validated correction, because the phases can have different interference and history. No timing-noise acceptance threshold was predeclared.")
lines.append('')
for name in metric_names:
    s=phases['measurements']['ratioStatistics'][name]
    lo,hi=s['changePercentInterval95']
    if lo<=0<=hi:
        lines.append(f"For `{name}`, the A/B interval includes zero change. The point estimate is {pct(s['changePercent'])}; this run does not establish a directional performance improvement.")
    elif hi<0:
        lines.append(f"For `{name}`, all of the approximate A/B interval is below zero ({pct(lo)} to {pct(hi)}). This supports lower cost under these fixed conditions, subject to the small sample and host-noise assumptions.")
    else:
        lines.append(f"For `{name}`, the A/B estimate indicates higher cost ({pct(s['changePercent'])}; the approximate interval is {pct(lo)} to {pct(hi)}. Treat this as a regression under these fixed conditions, subject to the small sample and host-noise assumptions.")
lines += ['', '## All measured quartets', '', '| Phase | Round | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |','|---|---:|---:|---:|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for q in phases[phase]['quartets']:
        f=q['metrics']['frameMeanMs'];t=q['metrics']['rendererThreadMsPerTick']
        lines.append(f"| {label} | {q['round']} | {num(f['a'])} | {num(f['b'])} | {pct(f['changePercent'])} | {num(t['a'])} | {num(t['b'])} | {pct(t['changePercent'])} |")
lines += ['', '## Measured-window distributions and heap', '', 'SD is across retained windows and is descriptive. Heap units are MiB (2²⁰ bytes); deltas are after minus before. Heap snapshots alone cannot identify GC events or establish memory-leak behavior. No timing samples were removed for heap changes or throttling.', '', '| Phase/side | Windows | Frame mean ± SD ms | Thread mean ± SD ms/tick | Frame pooled p95 / max ms | Used heap before mean | Used heap after mean | Heap delta mean [min, max] | Negative deltas | Throttled windows / periods / ms |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for side in ('a','b'):
        s=phases[phase]['sides'][side];f=s['windowMetrics']['frameMeanMs'];t=s['windowMetrics']['rendererThreadMsPerTick'];h=s['heapUsedBytesDelta'];c=s['cgroupDeltaTotals'];ff=s['pooledFramesDescriptiveOnly']
        lines.append(f"| {label}/{side.upper()} | {f['n']} | {f['mean']:.3f} ± {f['sd']:.3f} | {t['mean']:.3f} ± {t['sd']:.3f} | {ff['p95']:.3f} / {ff['max']:.3f} | {s['heapUsedBytesBefore']['mean']/2**20:.2f} | {s['heapUsedBytesAfter']['mean']/2**20:.2f} | {h['mean']/2**20:.2f} [{h['min']/2**20:.2f}, {h['max']/2**20:.2f}] | {s['heapUsedNegativeDeltaWindows']} | {s['throttledWindows']} / {c['nr_throttled']} / {c['throttled_usec']/1000:.3f} |")
lines += ['', 'Cgroup counters describe the cgroup-wide interval, including other processes and software GPU work; they are not per-game CPU measurements. Renderer ThreadTime includes digest/counter/CDP observer work. Per-frame wall times exclude subsequent observers and are not presented frame intervals.', '', '## Every retained window, including warmups', '', '| Phase | Kind | Round/slot | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods |', '|---|---|---:|---|---:|---:|---:|---:|---:|---:|']
for w in windows:
    h=w['heap'];c=w['cgroupDelta'];f=w['frameStats']
    lines.append(f"| {'A/A' if w['phase']=='preflight' else 'A/B'} | {w['kind']} | {w['round']}/{w['slot']} | {w['side']}/{w['buildSide']} | {w['replayOrdinal']} | {w['frameMeanMs']:.3f} | {w['rendererThreadMsPerTick']:.3f} | {f['p95']:.3f}/{f['max']:.3f} | {h['before']['JSHeapUsedSize']/2**20:.2f}→{h['after']['JSHeapUsedSize']/2**20:.2f} | {c['nr_throttled']} |")
lines += ['', '## Source, LFS, and replay validation', '']
for side in ('a','b'):
    s=a['sourceAndReceipts'][side]
    lines += [f"- {side.upper()}: source `{s['sourceSha']}`, content `{s['contentHash']}`; all {s['admittedPrivateFiles']} private assets match source-bound LFS SHA-256 and size. {s['servedUniqueFiles']} distinct served files, {s['totalRequests']} requests, with admitted hash/size receipts."]
    if s['unrequestedPrivateFiles']:
        lines += [f"  Unrequested private assets were admitted on disk but have no HTTP receipt: {', '.join(s['unrequestedPrivateFiles'])}."]
lines += ['', 'Saved harness copies match all eight recorded hashes and the execution-source files. Build source/content hashes match the predeclared plan and prior smoke receipt; the prior smoke result hash is verified. The smoke timing is not pooled with this run.', '', 'Each pair below independently compares initial fixture, every retained gameplay digest, final state/paint counts, draw/resources/scene counters, pose digests, offscreen-budget work, and exact BVH work. No BVH-work reduction was admitted. Zero scene submissions also means zero drawn actor frames; the constant pose digest is not visible-animation or pixel evidence. Real-time audio voice outcomes are recorded without equality requirements.', '', '| Phase | Kind | Ordinal | Digest | Paint counts | BVH queries / triangle tests | Draw calls / triangles |', '|---|---|---:|---:|---|---:|---:|']
for pair in pairs:
    b=pair['bvh'];d=pair['draw']
    lines.append(f"| {'A/A' if pair['phase']=='preflight' else 'A/B'} | {pair['kind']} | {pair['replayOrdinal']} | {pair['digest']} | {pair['paintCounts']} | {b['queries']} / {b['triangleTests']} | {d['calls']} / {d['triangles']} |")
lines += ['', '## Interpretation limits', '', 'This is a fixed-step host experiment with native geometry and software paint draws, with scene rendering excluded. It provides no device FPS, presented-FPS, full-rendering, or external-console performance evidence. Exact recorded parity does not establish equality of all pixels, all audio, all private state, or external-device behavior. Rematches retain JIT and some runtime history; matching is by replay ordinal, not across ordinals. All warmups and measured samples remain in `result.json`; detailed statistics, frame blocks, heap snapshots, cgroup deltas, and pair inventory are in `analysis.json`.', '']
(D/'report.md').write_text('\n'.join(lines))
print(json.dumps(dict(resultSha256=a['resultSha256'], counts=a['counts'], ratios={phase: phases[phase]['ratioStatistics'] for phase in phases}),indent=2))
