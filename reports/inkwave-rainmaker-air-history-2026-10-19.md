# Rainmaker source-air contact and source-history isolation

## Scope and provenance

This is a follow-up to [PR1627 at 62cd3a08fcc43fce60fba77392beae418ce2258c](https://github.com/rhgrive3/actions/pull/1627), not a change to Nintendo animation timing. The first native capture [run 39204093958](https://github.com/rhgrive3/actions/actions/runs/39204093958) saved 88/120 PNGs and failed the source-Shooter left-contact assertion at 0.01057013985801478 world units. This was an assertion failure, not a timeout. No image was saved at the failing jump; the last successful ordinary screenshot was the returned side view. The failure canvas after disposal is not visual evidence of the pose.

A CPU replay of the exact browser inputs and production-composed Actor, Character and loaded Player00 source bank reproduced 0.010570139858014999 world units. The failure was during `sourceMotion.state === 'air'`, fully visible human scale 1, before the subsequent squid transition. The separately preserved source-dive upper-body guard does not repair this air failure. This patch does not include that guard or modify gameplay, geometry, hair, physics, projectile origins or charge/release timing.

## Correction and history ownership

The former one-pass support solve is retained first. Only a sourced-air Rainmaker support whose final shoulder-to-target distance exceeds the solved shoulder-to-hand distance receives a display correction:

1. Save the legacy solved left clavicle/upper-arm/forearm/hand quaternions in per-character reusable storage.
2. Rotate the existing clavicle about its unchanged pivot until shoulder-to-target distance equals the solved arm's actual endpoint distance, subject to the bounded angle.
3. Rotate the already solved arm chain about that shoulder toward the target; retain the requested hand orientation.
4. Restore the legacy solved quaternions before the next source-history update, before an immediate ordinary bomb pose sampler, or when cleared/hidden/re-equipped/disposed.

The arm's local segment positions, scales and elbow angle are unchanged. There is still exactly one native left-arm solve. The first affected frame allocates a four-quaternion cache; subsequent affected frames reuse it. Unaffected frames do not allocate this cache. The existing bomb `_updateStates` owner supplies one pending-boolean hook rather than an additional all-character update wrapper. Two event-only hooks cover clear and release sampling. Handoff retains state ownership and exposes a leaf restore method, so the existing handoff-to-bomb import does not become cyclic.

The angle cap of 0.2 radians is an INKWAVE rig calibration, not a Nintendo value. In the exact original browser sequence the largest displayed clavicle correction was 0.13427641863247122 radians. The cap is not an assurance that all possible inputs are reachable; capped residuals remain visible to the gate.

An earlier rejected approach rotated the shoulder before the sole solve. It repaired contact but fed changed left-arm history into a later ordinary bomb, moving the actual emitted bomb by about 0.004/0.0074 world units (Shooter/Dualies). Saving the pose before that solve made the discrepancy larger because it discarded the legacy solved support. Neither rejected implementation is used here. No muzzle freezing or projectile-position compensation is used.

## Measurements and regressions

- Exact original browser sequence: 12 source/native × Shooter/Roller/Dualies × team cases, 4,980 complete-frame comparisons. Actor state, root, human-form transform and primary muzzle are identical. Native branches and all inactive final bone TRS values are identical. Only six holding frames change left clavicle/upper-arm/hand quaternions; forearm local quaternion, all bone local positions and scales remain identical.
- Source air final contact is at floating-point precision. The largest world contact residual across the full replay is 0.00028231975978458004, an unchanged native small-form-scale case.
- Geometric unit gates verify threshold continuity, the 0.2-radian cap, residual failure beyond the cap, repeated-frame non-accumulation, and restore/re-equipment/disposal.
- Loaded-source actual Actor regressions cover three weapon families and four boundaries: two-frame own-ink dive/return, immediate real bomb release in the drop frame, hidden clear, and source disable. All 12 real `Projectiles.throwBomb` births preserve position and velocity exactly. Actor/native pose, springs, ink, health and primary muzzle agree with the legacy-solve control after drop. The control omits only the new post-solve correction; the actual original solve and source/body processing still run.
- Joint Clam helper verification: 19 ordinary-bomb tests and four Clam boundaries pass, including eight exact ordinary-bomb births after Clam histories.
- This covers the three named original browser weapon families. It is not a claim about all weapons, all continuous camera histories, or retail hardware.

Commands (source, or `INKWAVE_BUILT_SITE=_site` for the two air tests):

```
node --experimental-vm-modules --test \
  patches/splatoon3/tests/ranked-rainmaker-air-support.test.mjs \
  patches/splatoon3/tests/ranked-rainmaker-air-history.test.mjs \
  tools/rainmaker-production-qa/grip-metrics.test.mjs
```

The source air-support unit test reads the emitted handoff text when the built-site switch is present and prints its SHA-256. The source-loaded Actor fixture and Rainmaker rule also honor the built-site root. CPU results are not a substitute for the pending native render acceptance.

## Reach units and final owner

The old browser gate mixed raw `ikErr` in human-local coordinates with a world-unit threshold. The helper now transforms the actual target and actual hand through their full world matrices, including nonuniform scale. The final-owner world residual keeps the existing strict 0.001 threshold. Raw local solver error and solver-immediate world error remain separately reported diagnostics, because the bounded display rotations occur after the single legacy solve.

Four unit controls include a genuine 0.01 world-unit miss at scale 1, which still fails; tiny visible form scale with the raw local error retained; nonuniform human scale; and a rotated/nonuniform parent hierarchy. No constant scale multiplier or widened tolerance is used.

## CPU sample

Eight real source-loaded characters were measured at 30/60/120 update rates with the same joint Clam helper on both sides. Each case uses two simulated seconds of warmup and three two-second samples. Duplicated carrier IDs intentionally stress eight simultaneous presentation owners; this is not a legal full-match or GPU benchmark. Median process CPU milliseconds per eight-character frame:

| Rate | Nonholder before / after | Holder before / after | Holder delta |
| --- | --- | --- | --- |
| 30 | 8.8456 / 8.5172 | 6.9560 / 7.0255 | +0.0695 ms |
| 60 | 6.1241 / 6.1062 | 5.9360 / 5.9594 | +0.0234 ms |
| 120 | 5.6605 / 5.6494 | 5.6887 / 5.6014 | -0.0873 ms |

Pose and native left-solve counts are equal. Corrected character-frames were 36/60/136 across the three holder workloads. Shared-worker scheduling, JIT and GC noise remain; the short sample does not prove zero cost or browser frame rate.

## Explicit remaining limits and native capture

A separate expanded input sequence applies three isolated up/down camera cycles to Dualies, although the original browser only does those extra camera cycles for Shooter. It reaches the angle cap: original contact residual 0.030895411220784538 becomes 0.01102530227604086 world units at fully visible scale 1. Bomb history still agrees exactly. This extra condition remains unresolved; it was not waived or represented as passing the 0.001 contact gate. No further angle expansion was made. Its visible impact needs the separate native review.

The next original capture contract is 128 PNGs: the original 120 plus jump before/after × source/native × rear/side for Shooter team 0. These are the same camera and input timeline with no extra simulation ticks. The separate source-dive guard's interrupted-return capture remains separate. The new air/history candidate and the optional guard combination have not yet passed native image acceptance at their exact new head.
