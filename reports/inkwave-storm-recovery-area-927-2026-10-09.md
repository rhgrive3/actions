# Ink Storm recovery-area alignment (#927 residual)

Base: PR #1182 integration `909a7014d49613e376878f3d49739bf4abac77e5`.
Comparison scope: Splatoon 3 Ver. 11.3.0, friendly Ink Storm, damaged non-submerged
player, after the existing recovery delay, without special gear changes.

Nintendo's [Ver. 6.1.0 update notes](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/)
confirm faster damage recovery within friendly Ink Storm's area, including when
not submerged. This correction establishes consistent eligibility inside
INKWAVE's existing rain area. It does not establish the Nintendo recovery
multiplier, exact radius growth/fade curve, world-unit conversion or rain reach.

## Actual residual

The current composed Actor already uses the submerged recovery rate for allied
rain. However, `storm-effects.mjs::cloudCoversActor` retained a full-size fixed
radius, unlimited downward extent, and an early `dur - 0.3` cutoff. The real
projectile rain uses a growth/fade-scaled radius, a finite 12-unit ground trace
with the existing actor-height offset, and continues through its final tick.

A real Actor plus production-adapter fixture reproduces a standing ally outside
the first growth envelope or below the rain trace recovering 1.6666667 HP per
60 Hz tick instead of its ordinary 0.2083333. An enemy cloud with that same old
eligibility can suppress recovery outside the actual rain. Inside the final
0.3 seconds, the old recovery query instead loses a still-active friendly rain.
Those numbers are existing INKWAVE profile outputs, not new Nintendo values.

## Correction

The existing native rain scale and finite spatial test now have shared helpers.
Native projectile damage reuses its already-computed scale, while the Actor
recovery query computes the same envelope from the cloud's current age. Both
retain their existing cover line-of-sight checks. Recovery remains eligible
until cloud expiry rather than stopping 0.3 seconds early; an expired/removed
cloud is never a recovery source. All existing profile values and motion,
paint, damage, recovery rates/delay, online authority and cloud clocks remain.
The upstream mirror is unchanged. #469's HUD gauge work is a separate function
scope and is not implemented by this correction.

## Bounded verification

The initial three new native regression cases failed 2 / passed 1 before the
change. Four cases after the fix cover growth/full/fade inside and outside
boundaries, matching native enemy-contact admission, finite vertical bounds,
cover, expiry, non-stacking overlapping clouds, local recovery under a ghost
cloud, and identical fixed-step traces at 30/60/120 Hz rendering.

Focused source validation includes these cases plus existing Storm effects,
paint-radius/finite-height, Super Jump HP recovery and network Storm authority
ordering tests: 54/54 passed, zero skipped. Staged whitespace validation also
passed. These are Node production-composition and transport-fixture
checks, not browser/GPU/device or retail measurements. No full CI wait or new
retail timing/geometry calibration is part of this lane.
