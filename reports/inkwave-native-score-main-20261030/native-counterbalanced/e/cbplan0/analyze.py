#!/usr/bin/env python3
"""Independent descriptive statistics after successful verify.mjs readback."""
import datetime
import hashlib
import json
import pathlib
import statistics
import sys
from statistics_lib import stats,ratio_stats,pct,ci

P=pathlib.Path(__file__).resolve().parent
plan=json.loads((P/'plan.json').read_text());run=next(x for x in plan['runs'] if x['name']==sys.argv[1])
D=pathlib.Path(run['evidence']);raw=(D/'result.json').read_bytes();r=json.loads(raw);a=json.loads((D/'analysis.json').read_text())
assert r['status']=='passed' and a['resultSha256']==hashlib.sha256(raw).hexdigest()
metrics=('frameMeanMs','rendererThreadMsPerTick')
phases={}
for phase in ('preflight','measurements'):
    rows=r[phase];quartets=[]
    for i in range(0,len(rows),4):
        group=rows[i:i+4];order=''.join(w['side'] for w in group).upper()
        assert order in ('ABBA','BAAB') and order==run['conditions']['aaOrders' if phase=='preflight' else 'abOrders'][i//4]
        assert [w['slot'] for w in group]==[0,1,2,3]
        q=dict(round=group[0]['round'],order=order,metrics={})
        for metric in metrics:
            ma=statistics.mean(w[metric] for w in group if w['side']=='a')
            mb=statistics.mean(w[metric] for w in group if w['side']=='b')
            q['metrics'][metric]=dict(a=ma,b=mb,ratio=mb/ma,changePercent=100*(mb/ma-1),differenceMs=mb-ma)
        quartets.append(q)
    def ratios(qs):return {name:ratio_stats(q['metrics'][name]['ratio'] for q in qs) for name in metrics}
    sides={}
    for side in ('a','b'):
        ws=[w for w in rows if w['side']==side]
        deltas=[{k:w['cgroup']['after'][k]-v for k,v in w['cgroup']['before'].items()} for w in ws]
        sides[side]=dict(windowMetrics={name:stats(w[name] for w in ws) for name in metrics},
            pooledFramesDescriptiveOnly=stats(t for w in ws for t in w['times']),
            frameP95Ms=stats(w['frameStats']['p95'] for w in ws),frameMaxMs=stats(w['frameStats']['max'] for w in ws),
            evaluationWallMs=stats(w['evaluationWallMs'] for w in ws),
            heapUsedBytesBefore=stats(w['heap']['before']['JSHeapUsedSize'] for w in ws),
            heapUsedBytesAfter=stats(w['heap']['after']['JSHeapUsedSize'] for w in ws),
            heapUsedBytesDelta=stats(w['heap']['after']['JSHeapUsedSize']-w['heap']['before']['JSHeapUsedSize'] for w in ws),
            heapTotalBytesBefore=stats(w['heap']['before']['JSHeapTotalSize'] for w in ws),
            heapTotalBytesAfter=stats(w['heap']['after']['JSHeapTotalSize'] for w in ws),
            heapUsedNegativeDeltaWindows=sum(w['heap']['after']['JSHeapUsedSize']<w['heap']['before']['JSHeapUsedSize'] for w in ws),
            cgroupDeltaTotals={k:sum(d[k] for d in deltas) for k in deltas[0]},
            throttledWindows=sum(d['nr_throttled']>0 for d in deltas))
    phases[phase]=dict(quartets=quartets,ratios=ratios(quartets),byOrder={order:ratios([q for q in quartets if q['order']==order]) for order in ('ABBA','BAAB')},sides=sides)
allrows=sorted(r['warmups']+r['preflight']+r['measurements'],key=lambda w:w['startedAt'])
windows=[]
for w in allrows:
    record={key:w[key] for key in ('phase','kind','round','slot','side','buildSide','replayOrdinal','startedAt','completedAt',
        'frameMeanMs','frameStats','rendererThreadMsPerTick','threadCpuMs','heap','frameBlocks100','evaluationWallMs',
        'bvh','counts','draw','digest','poseDigest','budgetWork','audioWork','scoreSnapshot')}
    record['order']=w.get('order');record['cgroupDelta']={k:w['cgroup']['after'][k]-v for k,v in w['cgroup']['before'].items()}
    windows.append(record)
warmups={phase:{side:{name:stats(w[name] for w in r['warmups'] if w['phase']==phase and w['side']==side) for name in metrics} for side in ('a','b')} for phase in ('preflight','measurements')}
a['statistics']=dict(analyzedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),phases=phases,warmups=warmups,allWindows=windows,
    quantiles='linear interpolation at (n-1)*q; harness per-window p95 retains its original convention',
    inference='Conditional Student-t 95% intervals of quartet log-ratios; retained pages, shared browser, serial host interference and drift can violate independence and approximate-normality assumptions. Individual frame/window summaries are descriptive only. Independent reversed sessions must be assessed separately.',
    heapInterpretation='Ordinary runtime GC, no forced GC or profiling. Heap snapshots cannot identify individual GC events, timing causality, leak absence, or allocation counts.')
(D/'analysis.json').write_text(json.dumps(a,indent=2)+'\n')
smoke=run['name']=='smoke';title='30-frame admission smoke' if smoke else '300-frame counterbalanced session '+run['name']
lines=[f'# {title}', '', f"Status **passed**, launcher exit **0**. Result SHA-256 `{a['resultSha256']}` ({a['resultBytes']:,} bytes).",'',
    f"Hagglefish native, low, 480×300, eight actors/seven bots, shooter, 60 Hz fixed cadence. {run['conditions']['frames']} frames per warmup/measured window. Page creation `{r['config']['pageOrder']}`, quartet start `{r['config']['quartetStart']}`. A/A orders {', '.join(run['conditions']['aaOrders'])}; A/B orders {', '.join(run['conditions']['abOrders'])}.",'',
    f"All {len(allrows)} windows retained ({len(r['warmups'])} warmups, {len(r['preflight'])} A/A, {len(r['measurements'])} A/B), with {len(a['pairInventory'])} exact ordinal pairs, including score/HUD caches and binary64 coverage bits. No page errors, context loss or rejected windows. Scene submissions are zero; software GPU paint-atlas draws remain active. GPU CPUs 0–1, worker CPUs 2–3; unchanged four-core quota. No profiling, forced GC, outlier removal, automatic retry, or post-launch affinity changes.",'',
    'The score observer reads already-produced own-data caches after both timing metrics and GPU drain. Every endpoint is current and unchanged, has matching coverage/HUD bits, and passes exact pair parity. The observer invokes no coverage, teamSummary, getters, simulation, or state transition. This verifies live-Turf endpoint cache/transport behavior, not every intermediate HUD frame, DOM/pixels, finish coverage, judge/winner behavior, or external-device behavior.', '']
if smoke:lines += ['**This smoke validates admission and actual score observation only. Its short timing is not performance evidence and is not pooled with the full runs.**','']
lines += ['## Timing and uncertainty','','B/A ratios; negative changes mean lower cost. A/A compares build A on both pages. The quartet is a reporting unit; its repeated use of retained pages does not establish independent replication. Conditional log-ratio t intervals are shown without treating individual frames as independent samples. One-order A/A has only one quartet and no interval.','',
    '| Phase | Order group | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval | Quartet range |',
    '|---|---|---:|---|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for order,summary in [('all',phases[phase]['ratios'])]+list(phases[phase]['byOrder'].items()):
        for metric,s in summary.items():
            lines.append(f"| {label} | {order} | {s['n']} | {metric} | {s['geometricMean']:.5f} | {pct(s['changePercent'])} | {ci(s)} | {s['min']:.5f}–{s['max']:.5f} |")
lines += ['', 'A/A state parity does not establish acceptable timing noise; no numerical timing-noise acceptance threshold was predeclared. Alternating ABBA/BAAB balances outer/inner slots but does not remove persistent page/renderer differences or guarantee equal wall-clock spacing. Reversed page order and quartet start change together across the two full sessions, so their effects cannot be individually identified. Fixed session order and changing host conditions also limit causal attribution.', '']
if not smoke:
    for metric,s in phases['measurements']['ratios'].items():
        low,high=s['changePercentInterval95']
        if low<=0<=high:message='The interval includes zero; this session does not establish a directional performance change.'
        elif high<0:message='The conditional interval is below zero; assess this together with A/A noise, order-specific results and the reversed independent session before attributing the change.'
        else:message='The conditional interval is above zero, indicating higher cost under these fixed conditions; assess control/order/session sensitivity.'
        lines.append(f"`{metric}`: {pct(s['changePercent'])}, conditional 95% interval {ci(s)}. {message}")
lines += ['', '## Every measured quartet','','| Phase | Round | Order | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |','|---|---:|---|---:|---:|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for q in phases[phase]['quartets']:
        f=q['metrics']['frameMeanMs'];t=q['metrics']['rendererThreadMsPerTick']
        lines.append(f"| {label} | {q['round']} | {q['order']} | {f['a']:.3f} | {f['b']:.3f} | {pct(f['changePercent'])} | {t['a']:.3f} | {t['b']:.3f} | {pct(t['changePercent'])} |")
lines += ['', '## Measured-window distributions, heap and cgroup','','SD across windows is descriptive. Heap values use MiB (2²⁰ bytes). Negative deltas cannot identify individual GC events; no samples were removed for heap changes or throttling. Cgroup counters cover the entire cgroup, not just the game.','',
    '| Phase · side | n | Frame mean ± SD ms | Thread mean ± SD ms/tick | Pooled frame p95/max ms | Used heap before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows/periods/ms |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for side,s in phases[phase]['sides'].items():
        f=s['windowMetrics']['frameMeanMs'];t=s['windowMetrics']['rendererThreadMsPerTick'];ff=s['pooledFramesDescriptiveOnly'];h=s['heapUsedBytesDelta'];c=s['cgroupDeltaTotals']
        lines.append(f"| {label} · {side.upper()} | {f['n']} | {f['mean']:.3f} ± {f['sd']:.3f} | {t['mean']:.3f} ± {t['sd']:.3f} | {ff['p95']:.3f}/{ff['max']:.3f} | {s['heapUsedBytesBefore']['mean']/2**20:.2f}→{s['heapUsedBytesAfter']['mean']/2**20:.2f} | {h['mean']/2**20:.2f} [{h['min']/2**20:.2f},{h['max']/2**20:.2f}] | {s['heapUsedNegativeDeltaWindows']} | {s['throttledWindows']}/{c['nr_throttled']}/{c['throttled_usec']/1000:.3f} |")
lines += ['', '## Every retained window','','| Phase | Kind | Round/slot | Order | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods | Score coverage bits |','|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|']
for w in windows:
    h=w['heap'];f=w['frameStats']
    lines.append(f"| {'A/A' if w['phase']=='preflight' else 'A/B'} | {w['kind']} | {w['round']}/{w['slot']} | {w['order'] or 'warmup'} | {w['side']}/{w['buildSide']} | {w['replayOrdinal']} | {w['frameMeanMs']:.3f} | {w['rendererThreadMsPerTick']:.3f} | {f['p95']:.3f}/{f['max']:.3f} | {h['before']['JSHeapUsedSize']/2**20:.2f}→{h['after']['JSHeapUsedSize']/2**20:.2f} | {w['cgroupDelta']['nr_throttled']} | `{w['scoreSnapshot']['coverageBits']}` |")
lines += ['', '## Source, LFS, HTTP and saved-file readback','']
for side,s in a['sourceAndReceipts'].items():
    lines.append(f"- {side.upper()} source `{s['sourceSha']}`, content `{s['contentHash']}`: all {s['privateFiles']} private LFS oid/size records verified; {s['servedUniqueFiles']} served files and {s['totalRequests']} requests with admitted hash/size receipts.")
    if s['unrequestedPrivateFiles']:lines.append(f"  Private files admitted on disk but not requested by HTTP: {', '.join(s['unrequestedPrivateFiles'])}.")
lines += ['', f"All nine harness hashes match the fixed plan, saved copies and execution sources. Before/after affinity verifies {a['validation']['observedThreadEntries']:,} observed thread entries with one GPU PID ({a['validation']['gpuPid']}). All exact pairs independently compare recorded initial fixture, all gameplay digests, final paint counts, score/HUD stamp/cache/flags/binary64 values, scene/draw/resources/pose/budget counters, and exact BVH work. No BVH reduction was admitted.",'',
    '## Every exact ordinal pair','','| Pair | Gameplay digest | Coverage bits | Coverage | Paint counts | BVH queries/triangle tests | Draw calls/triangles |','|---|---:|---|---|---|---:|---:|']
for pair in a['pairInventory']:
    b=pair['bvh'];d=pair['draw']
    lines.append(f"| {pair['key']} | {pair['digest']} | `{pair['coverageBits']}` | {pair['coverage']} | {pair['counts']} | {b['queries']}/{b['triangleTests']} | {d['calls']}/{d['triangles']} |")
lines += ['', '## Limits','','This fixed-step software-GPU-paint host experiment excludes scene submissions and supplies no device FPS or presented-FPS evidence. Per-frame wall excludes subsequent digest/counter observers; renderer ThreadTime includes observers and CDP evaluation. GPU drain and score observation occur after timing. Tiny score-observer allocations can affect subsequent heap history. Ordinary rematches preserve JIT and some runtime state, so equality applies only to matched ordinals. Zero drawn actor frames and constant pose digests are not visible-animation evidence. Recorded equality is not all pixels, audio, private state, external-device behavior, or a Splatoon 3 hardware comparison. All warmups, raw frame samples and failures remain in their original evidence files; no earlier timing is pooled into this run.', '']
(D/'report.md').write_text('\n'.join(lines))
saved=json.loads((D/'analysis.json').read_text());assert len(saved['statistics']['allWindows'])==run['expected']['totalWindows']
print(json.dumps(dict(run=run['name'],resultSha256=a['resultSha256'],counts=a['counts'],ratios={phase:phases[phase]['ratios'] for phase in phases}),indent=2))
