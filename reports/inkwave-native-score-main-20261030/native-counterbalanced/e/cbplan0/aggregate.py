#!/usr/bin/env python3
"""Keep reversed sessions separate; report uncertainty at session and order level."""
import datetime
import hashlib
import json
import pathlib
from statistics_lib import stats,ratio_stats,pct,ci

P=pathlib.Path(__file__).resolve().parent
plan=json.loads((P/'plan.json').read_text())
analyses={}
for name in ('smoke','ab','ba'):
    run=next(x for x in plan['runs'] if x['name']==name);d=pathlib.Path(run['evidence'])
    a=json.loads((d/'analysis.json').read_text());raw=(d/'result.json').read_bytes()
    assert a['status']=='verified-after-saved-file-readback' and a['resultSha256']==hashlib.sha256(raw).hexdigest()
    assert len(a['statistics']['allWindows'])==run['expected']['totalWindows']
    assert len(a['pairInventory'])==run['expected']['parityPairs']
    analyses[name]=a
assert analyses['ba']['startedAt']>analyses['ab']['completedAt']
assert analyses['ab']['startedAt']>analyses['smoke']['completedAt']
assert analyses['ab']['validation']['gpuPid']!=analyses['ba']['validation']['gpuPid']
metrics=('frameMeanMs','rendererThreadMsPerTick')
session_stats={phase:{metric:ratio_stats(analyses[name]['statistics']['phases'][phase]['ratios'][metric]['geometricMean'] for name in ('ab','ba')) for metric in metrics} for phase in ('preflight','measurements')}
order_sensitivity={name:{phase:{metric:dict(
    abbaRatio=analyses[name]['statistics']['phases'][phase]['byOrder']['ABBA'][metric]['geometricMean'],
    baabRatio=analyses[name]['statistics']['phases'][phase]['byOrder']['BAAB'][metric]['geometricMean'],
    baabOverAbba=analyses[name]['statistics']['phases'][phase]['byOrder']['BAAB'][metric]['geometricMean']/analyses[name]['statistics']['phases'][phase]['byOrder']['ABBA'][metric]['geometricMean'])
    for metric in metrics} for phase in ('preflight','measurements')} for name in ('ab','ba')}
pooled_descriptive={phase:{metric:stats(q['metrics'][metric]['ratio'] for name in ('ab','ba') for q in analyses[name]['statistics']['phases'][phase]['quartets']) for metric in metrics} for phase in ('preflight','measurements')}
out=dict(analyzedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='both-independent-reversed-sessions-verified',
    planSha256=hashlib.sha256((P/'plan.json').read_bytes()).hexdigest(),
    resultSha256={name:a['resultSha256'] for name,a in analyses.items()},
    counts=dict(smokeWindows=20,fullWindows=88,fullPairs=44,fullMeasuredWindows=48,fullWarmups=40,
                fullAAQuartets=4,fullABQuartets=8,independentBrowserSessions=2,rejectedWindowAttempts=0),
    independentSessionStatistics=session_stats,orderSensitivity=order_sensitivity,
    allQuartetRatioDistributionsDescriptiveOnly=pooled_descriptive,
    sessions={name:dict(startedAt=analyses[name]['startedAt'],completedAt=analyses[name]['completedAt'],
                       config=analyses[name]['config'],validation=analyses[name]['validation'],
                       phases=analyses[name]['statistics']['phases'],sourceAndReceipts=analyses[name]['sourceAndReceipts']) for name in ('ab','ba')},
    inference='Session-level log-ratio t intervals use only two independently launched sessions (df=1), conditional on independence and approximate normality. A single host in fixed sequential order does not establish those assumptions. Quartets remain nested in shared browsers/pages; pooled quartet/frame distributions are descriptive, not independent replications. Page order and quartet start reverse together, confounded with session/time.',
    priorEvidence='No cf0 900-frame or 30-frame smoke timings are pooled into full 300-frame timing. Smoke is admission only.',
    limits=plan['limits'])
(P/'analysis.json').write_text(json.dumps(out,indent=2)+'\n')
lines=['# Counterbalanced native battle validation','',
    'Both sequential, separately launched Chromium sessions passed saved-file readback: 88/88 full-run windows, 44/44 matched-ordinal pairs, zero rejected windows, page errors or WebGL context losses. All endpoint score/HUD caches are current, unchanged and exactly equal within each pair, including binary64 coverage encodings. The separate 20-window/10-pair 30-frame admission smoke also passed.','',
    'Hagglefish native, low, 480×300, shooter, eight actors/seven bots, fixed 60 Hz; 300 frames per warmup/measured window; five warmups per side per phase; two A/A and four A/B quartets per session. Scene submissions are disabled and software GPU paint-atlas draws remain active. GPU CPUs 0–1 and worker CPUs 2–3 remain disjoint under the same four-core quota. No profiling, forced GC, outlier exclusion, automatic retries or post-launch affinity changes.','',
    f"A: `{plan['source']['a']['sha']}`. B: `{plan['source']['b']['sha']}`.",'',
    'Fixed sequence: `cba0` creates pages A→B and starts with ABBA, then alternates BAAB/ABBA; `cbb0` starts a fresh browser, creates pages B→A and starts with BAAB, then alternates ABBA/BAAB. A/A uses the baseline A build on both pages. The second session began after the first finished, with a different GPU PID. The two schedule factors reverse together; the experiment cannot identify their individual effects.','',
    '## Independent-session timing','','Negative B/A changes mean lower cost. Conditional 95% intervals use quartet log-ratios within each session. Retained pages and a shared browser do not establish independence. All predeclared samples are retained.','',
    '| Session | Phase | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval |','|---|---|---:|---|---:|---:|---:|']
for name in ('ab','ba'):
    for phase,label in [('preflight','A/A'),('measurements','A/B')]:
        for metric,s in analyses[name]['statistics']['phases'][phase]['ratios'].items():
            lines.append(f"| {'cba0 · ab/a' if name=='ab' else 'cbb0 · ba/b'} | {label} | {s['n']} | {metric} | {s['geometricMean']:.5f} | {pct(s['changePercent'])} | {ci(s)} |")
lines += ['', 'The session-level calculation below uses each session’s geometric ratio once (n=2, df=1). Its interval is conditional on approximately normal, independent session log-ratios. Two sequential sessions on one host provide very limited evidence for those assumptions, even though their browser processes are independent. No eight-quartet pooled confidence interval is presented as independent replication.','',
    '| Phase | Metric | Sessions | Geometric B/A | Change | Conditional session-level 95% change interval |','|---|---|---:|---:|---:|---:|']
for phase,label in [('preflight','A/A'),('measurements','A/B')]:
    for metric,s in session_stats[phase].items():
        lines.append(f"| {label} | {metric} | 2 | {s['geometricMean']:.5f} | {pct(s['changePercent'])} | {ci(s)} |")
lines.append('')
for metric,s in session_stats['measurements'].items():
    low,high=s['changePercentInterval95']
    points=[analyses[name]['statistics']['phases']['measurements']['ratios'][metric]['changePercent'] for name in ('ab','ba')]
    if low<=0<=high:
        conclusion='The session-level interval includes zero; these runs do not establish a directional overall performance change for this metric.'
    elif high<0:
        conclusion='The conditional session-level interval is below zero. Interpret it with only two sessions and the same-build/order controls; it does not establish a general or hardware performance improvement.'
    else:
        conclusion='The conditional session-level interval indicates higher cost under these fixed conditions, subject to the very small session count and control/order limitations.'
    if min(points)<0<max(points):conclusion+=' The point estimate changes sign between the reversed sessions.'
    lines.append(f"`{metric}`: session estimates {pct(points[0])} and {pct(points[1])}; combined session estimate {pct(s['changePercent'])}, conditional 95% interval {ci(s)}. {conclusion}")
lines += ['', '## Order-specific results','','Within-session A/A has one quartet per order and no order-specific interval. Within-session A/B has two quartets per order; its log-t intervals are particularly unstable. BAAB/ABBA compares order-group geometric ratios descriptively and is not an independently randomized effect estimate.','',
    '| Session | Phase | Order | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval |','|---|---|---|---:|---|---:|---:|---:|']
for name in ('ab','ba'):
    for phase,label in [('preflight','A/A'),('measurements','A/B')]:
        for order,summary in analyses[name]['statistics']['phases'][phase]['byOrder'].items():
            for metric,s in summary.items():
                lines.append(f"| {'cba0' if name=='ab' else 'cbb0'} | {label} | {order} | {s['n']} | {metric} | {s['geometricMean']:.5f} | {pct(s['changePercent'])} | {ci(s)} |")
lines += ['', '| Session | Phase | Metric | BAAB / ABBA | Descriptive change |','|---|---|---|---:|---:|']
for name in ('ab','ba'):
    for phase,label in [('preflight','A/A'),('measurements','A/B')]:
        for metric,s in order_sensitivity[name][phase].items():
            lines.append(f"| {'cba0' if name=='ab' else 'cbb0'} | {label} | {metric} | {s['baabOverAbba']:.5f} | {pct(100*(s['baabOverAbba']-1))} |")
lines += ['', 'A/A timing is assessed separately from exact state parity. Same-build asymmetry, order sensitivity and between-session variation limit causal interpretation. No numerical noise acceptance threshold was predeclared, and no noise-corrected A/B effect is asserted. The earlier cf0 control was noisy; its 900-frame timings and the 30-frame smoke are not pooled into these 300-frame results.','',
    '## All measured quartets','','| Session | Phase | Round | Order | Frame A/B ms | Frame change | Thread A/B ms/tick | Thread change |','|---|---|---:|---|---:|---:|---:|---:|']
for name in ('ab','ba'):
    for phase,label in [('preflight','A/A'),('measurements','A/B')]:
        for q in analyses[name]['statistics']['phases'][phase]['quartets']:
            f=q['metrics']['frameMeanMs'];t=q['metrics']['rendererThreadMsPerTick']
            lines.append(f"| {'cba0' if name=='ab' else 'cbb0'} | {label} | {q['round']} | {q['order']} | {f['a']:.3f}/{f['b']:.3f} | {pct(f['changePercent'])} | {t['a']:.3f}/{t['b']:.3f} | {pct(t['changePercent'])} |")
lines += ['', '## Heap and cgroup observations','','Every window is retained, including all throttled windows. Heap deltas are after minus before; snapshots do not identify individual GC events, allocation counts or timing causality. Cgroup counters cover all processes and software-GPU work in the cgroup, not just the active game.','',
    '| Session | Phase · side | Heap used before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows / periods / ms |',
    '|---|---|---:|---:|---:|---:|']
for name in ('ab','ba'):
    for phase,label in [('preflight','A/A'),('measurements','A/B')]:
        for side,s in analyses[name]['statistics']['phases'][phase]['sides'].items():
            h=s['heapUsedBytesDelta'];c=s['cgroupDeltaTotals']
            lines.append(f"| {'cba0' if name=='ab' else 'cbb0'} | {label} · {side.upper()} | {s['heapUsedBytesBefore']['mean']/2**20:.2f}→{s['heapUsedBytesAfter']['mean']/2**20:.2f} | {h['mean']/2**20:.2f} [{h['min']/2**20:.2f},{h['max']/2**20:.2f}] | {s['heapUsedNegativeDeltaWindows']} | {s['throttledWindows']} / {c['nr_throttled']} / {c['throttled_usec']/1000:.3f} |")
lines += ['', 'The second session’s A/B cgroup interval totals 21 throttled periods and 1,288.107 ms of throttled time, compared with 11 periods and 18.429 ms in the first session. These observations reinforce the host-interference limitation; they do not by themselves identify the cause of the performance differences. No throttling-based exclusion or correction was applied.']
lines += ['', '## Evidence and validation','',
    '- `../cbsm0/report.md`: actual 30-frame smoke, every window and pair, including both ABBA and BAAB.',
    '- `../cba0/report.md` and `../cbb0/report.md`: every full-run warmup/window, exact score/paint/BVH pair, per-window and order-specific timing, heap and cgroup summaries.',
    '- Each directory retains `result.json`, `analysis.json`, `run.log`, `process.json`, `exit.json`, fixed harness copies and byte receipts. `plan.json` fixes inputs, hashes, schedules and interpretation limits before execution.','']
for name,a in analyses.items():
    lines.append(f"- {name}: result SHA-256 `{a['resultSha256']}`; {a['counts']['totalWindows']} windows, {a['counts']['parityPairs']} exact pairs.")
lines += ['', 'All private source-bound Git LFS SHA-256/size records, public/private HTTP receipts, nine frozen harness hashes, full actor/source-character admission, all observed before/after thread affinities, constant GPU PID per session, state/gameplay digests, final paint counts, existing live-HUD cache/transport, draw/resource/scene/budget/pose counters, exact BVH work, zero page errors and zero context loss passed saved-file verification. Private assets admitted on disk but not requested by HTTP are listed in each report. No BVH reduction or failed-sample removal was allowed.','',
    '## Interpretation limits','','This is a fixed-step host experiment with native geometry and software GPU paint work, with scene submissions excluded. It is not device FPS, presented FPS, full-rendering performance, a hardware GPU measurement or a Splatoon 3 hardware comparison. Per-frame wall excludes later observers; renderer ThreadTime includes digest/counter/CDP observer work. GPU drain and endpoint score observation occur outside both timing metrics, although small observer allocations can affect later heap history. Exact recorded endpoint/cache parity does not prove all intermediate HUD values, all pixels/audio/private state, finish/judge/winner behavior, or external-device behavior. Heap snapshots do not identify GC events, leak absence or timing causality. Fixed run sequence, small sample size, persistent page effects and host drift remain material limitations.', '']
(P/'report.md').write_text('\n'.join(lines))
assert len(json.loads((P/'analysis.json').read_text())['sessions'])==2
print(json.dumps(dict(counts=out['counts'],independentSessionStatistics=session_stats),indent=2))
