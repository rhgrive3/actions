# Brush rolling transform and downhill contact: text evidence

Base: `4ce9768e6177b19f11f17e28f086a4da36f35fcd`.
Code: `ea8213beba44e96cc674bbc1d1df6d3884d1346e`.
Remote destination: `rhgrive3/actions`, branch
`fix/brush-rolling-presentation-20261027`. This handoff contains code and text
only. Screenshots, raw browser receipts, compressed artifacts and original-game
media are not included. The image-bearing local evidence commit
`a059174600c138e363901bc5527f8ba003da9f7d` is not an ancestor of this handoff.
Its original local evidence remains preserved.

## Implemented defect

The real loaded Brush receives runner/animation rolling state and wRoll
correctly. Its floor correction reused the last drawn weapon matrix during
multiple fixed gameplay ticks, feeding a stale error into each correction.
Synchronizing the existing weapon world matrices before reading them removes
that oscillation. The tip target now follows the standing surface plane at the
tip rather than the actor's foot height. Only
`patches/splatoon3/runtime/weapon-models/brushes.mjs` changes production code.
Geometry, character models/rigs, local bone values, movement, paint/contact,
payment and collision rules are not changed. Correction gain, bounds and the
existing virtual tip calibration are retained.

## Executed checks

The new regression passes against production-composed source and optimized
emitted runtime. The same test fails against the old emitted build: settled
displayed-head span **0.501029 m**. Fixed spans are **0.007096 m** with six
updates per draw and **0.007458 m** with a draw each tick. Movement, payment and
shot-admission traces are exactly equal between the cadences. A real
14.036-degree Physics ramp follows the standing plane. The existing five
Roller/three Brush held/jump/landing check passes at 30/60/120 Hz.

See [source](source-test.txt), [emitted](emitted-test.txt),
[old negative control](old-emitted-negative.txt), [compatibility](held-compat.txt)
and [build](build.txt) logs. [build-identity.json](build-identity.json) binds
1,490 inputs and 2,194 emitted artifacts to the code commit with zero mismatches.
Content hash:
`ca0d3c6c480a30af6bfa9cfea5eedd2dae8f2d26ac2d877cab92d87955bb2a5f`.

Chromium 154's normal-input run uses real title/menu/loadout controls, normal
Resume to acquire pointer lock, held left mouse, normal R paint reset, and W
to descend. CPU paint cells and turf are zero before descent. Turf increases
**0 → 2.992923 → 9.662021**, occupied cells **0 → 48 → 159**, and all five
sampled ramp points change from empty to own ink. The actor stays grounded and
rolling at both downhill checkpoints with no flight projectiles. This is
fresh continuous contact painting, not prepainted ground or a flick.

At the same saved mid-slope position, the old head's bounding box is wholly
at least **0.539069 m** above the plane; the fixed closest actual vertex is
**0.011402 m** above it. Bounds and actual vertices are different measurements.
The saved rear camera partly occludes the head; geometry values are read
around the unfrozen captures and are not pixel measurements. No character
comparison is made. Both browser/server pairs closed and their ports refused
connections (111). There were no page errors or HTTP errors; the fixed run
retains one unrelated aborted bomb-audio request. Initial pointer-lock error
events and later normal successful lock remain in the preserved local receipt.

Compact non-image measurements are in
[validation-summary.json](validation-summary.json). No new tests or browser
runs were performed for this text-only publication.

## Remaining entry lag and penetration: evidence and attribution

The candidate's slope-entry vertex clearance is **+0.145739 m** at game time
18.166433. At 19.166433 it is **+0.011402 m**: a 13.4337 cm reduction in one
gameplay second. The actor also finishes a small coast before stopping at
18.416433. Sparse measurements cannot establish an exact threshold-crossing
time, peak clearance or duration of a visibly open gap. The normal changes
between the saved 17.916433 and 18.166433 samples; no per-tick weapon series
was captured in this browser run. Wall time is not gameplay time in software
Chromium. Do not present 1 s as an exact measured settling duration.

At the floor exit, actual candidate head vertices penetrate **6.0285 cm** at
20.916433 and **4.0480 cm** at 21.966433. The deterministic settled fixture
also has real vertex penetration: flat 3.63–4.37 cm, slope 3.29–3.79 cm.
These candidate measurements are definite. The old browser only recorded
bounding boxes, whose negative lower bounds do not prove actual vertex
penetration. Therefore the earlier local report's unqualified wording
"existing penetration" is too strong: the virtual contact-point calibration
is unchanged in code, but the exact penetration delta from baseline is not
established by those captures.

The incremental error-feedback mechanism and its dt gain predate this fix:
`corr += err / cfg.tip * min(1, dt * 12)`, clamped to [-0.7, 0.5]. The new
surface-plane target responds to a changing slope through that existing
feedback, so it can produce a target-step transient. The old version was
already floating by at least 68.1 cm at the corresponding entry snapshot.
That does not identify how much of the candidate's 14.6 cm transient is newly
introduced; old/new actual-vertex time series would be needed to isolate it.

The feedback samples a virtual point based on muzzle X, cfg.tip and cfg.thick;
the displayed head flex is subsequently animated with speed and swing state.
That virtual point is not the actual deformed head's supporting vertex, which
supports a weapon-only geometric-contact investigation. It does **not** support
an arbitrary fixed upward offset or a gain increase as a proven fix: those
could trade penetration for floating or restore oscillation. A bounded
head-contact proxy and slope-transition response would need focused before/
after tests for all three existing heads before implementation. No further
production/calibration changes are included; the current candidate is kept
intact for review.

## Reproduction and limits

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
INKWAVE_BUILT_SITE=/absolute/built-site node --experimental-vm-modules --test patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
node --experimental-vm-modules --test --test-name-pattern='all five Rollers and three Brushes' patches/splatoon3/tests/roller-brush-held-motion.test.mjs
node reports/brush-downhill-contact-20261027/audit-build.mjs /absolute/built-site /tmp/brush-build-identity.json
```

This browser acceptance uses ordinary range Level, `nativeTriangles=false`.
No native triangle browser coverage, hardware performance improvement or
original-game geometry/frame agreement is claimed. The qualitative original
reference is Nintendo's
[Splatoon fashion page](https://www.nintendo.com/jp/character/splatoon/fashion/index.html)
for dragging the Brush head on the ground while painting; no original media
is included. No pose, time, paint, painting flag or input-state injection was
used in the browser. No PR or manual CI launch is part of this handoff.
