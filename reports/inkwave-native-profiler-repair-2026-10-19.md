# Native CPU diagnostic compatibility and coverage

This is a successor to PR #1670, parent `6918f70bd3a296a1cf674cd626116a45cdf35b90`.
It addresses source-composition and measurement coverage while investigating
P0 #1671. It does not establish a physical iPad frame-rate improvement.

## Compatibility

The production network adapter runs before the native-stage adapter and adds
`ownerOrder, orderState` to `_cpuSplat`. The parent's new all-dead-chart guard
searched for the earlier argument list and threw during source composition.
Two changed marker lines retain those arguments, in their original order.
No mask, cell ownership, paint growth or GPU-submission policy is changed by
this compatibility repair.

## Opt-in measurement coverage

The existing `TriangleWorld.queryCount/triangleTests` counters cover ray and
sphere-sweep paths. A real two-triangle contact solve can perform two box
queries and four capsule-distance tests while those counters remain zero.
The optional `?profileRange=1` tracer now reports method call counts and labels
the old counter coverage explicitly. The capsule-distance wrapper counts only;
it does not take a timestamp for each triangle. Per-frame fixed-clock ticks,
elapsed input and queued time distinguish a slow tick from multiple catch-up
ticks. Ordinary gameplay still does not load the profiler.

The HUD's smoothed `sim` interval also includes pre-render FX/environment,
camera and presentation work. It is not the duration of one physics tick.
Controlled 5 Hz input yields twelve 60 Hz steps per frame; this is not a claim
about the number of steps in the reported iPad screenshot.

## Source verification

- Both unchanged original-head/base composition failures were retained.
- The repaired native combat suite and tracer suite each pass 12 tests on the
  parent epoch and on main `2584f1999a20927c48eb1dac6517b3fcca69c9b9`.
- New portable tests retain exact native paint order arguments; newer/older
  and duplicate stamps preserve canonical CPU ownership. The existing actual
  NetMatch paint-authority suite passes eight tests.
- Real contact tests verify return values, ground/position, geometry hash,
  zero RNG consumption, exact wrapper restoration and twelve-step metadata.
- Negative controls fail for the original marker, omitted owner arguments,
  old counters and a forced-zero tick count.
- A separate 320-condition native control (four surfaces, two forms, five
  speeds, eight directions) preserves main steering, actor position/velocity
  and ordered paint state. With the existing all-clear cache reset equally,
  ground probes decrease from 4751 to 4023. This is a fixture query count,
  not a whole-game performance result.

Reproduction:

```sh
node --experimental-vm-modules --test patches/native-stages/tests/native-combat-support.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/range-hitch-tracer.test.mjs
node --experimental-vm-modules --test patches/network-replication/tests/issue-522-paint-authority.test.mjs
```

## Instrumentation cost and remaining evidence

A Node microfixture used twenty real contact solves per frame, six alternating
order runs, forty warm-up frames and two hundred measured frames per lane/run.
The median of run medians was 0.166415 ms without tracing, 0.181553 ms with the
parent tracer and 0.186130 ms with added counts/clock metadata. Median run p95
was 0.1896545 / 0.212805 / 0.219004 ms. The added instrumentation is not free:
the run-median difference is about 0.004577 ms for this small fixture. These
values cannot be extrapolated to Safari or a full native stage.

The issue's 5 FPS / sim 174.9 ms report comes from an unmatched physical-device
HUD sample. A matched iPad capture, per-stage CPU distributions and original
scene identity remain needed. Existing export contains a latest-240-frame
summary and twelve recent hitches, not every frame of a thirty-second trace.
Emitted/native-browser verification and actual-device improvement remain
unverified at source submission.

The existing Splatoon 3 11.3.0 reference remains unchanged. No new retail
movement or frame values are inferred. This diagnostic work changes neither
gameplay parameters nor model/hair geometry, draw quality or collision policy.
