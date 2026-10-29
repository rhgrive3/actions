# #1814 current owner audit: a concrete horizontal-sector gap

Base: `2b01cd7efbca260a611165b1e3887ff48062ccd5`. Reference parameters remain
Splatoon 3 11.3.0, Leanny/splat3
`7280ff9cde8bb1c5dcef46c700c326471584d2e6`.

The original ten-row tracker contains one further demonstrable software gap in
the existing #1810 rule: horizontal catalog Roller launch follows the accepted
camera direction, but its Inside/Outside damage sector retained the actor's
body yaw. The native facing spring deliberately lets the body lag a camera
turn. A central shot could consequently receive the outside damage curve.

## Bounded correction and actual contact proof

Only `patches/splatoon3/runtime/main-weapon-catalog.mjs` changes in production.
After choosing the central admitted launch direction, the emitter records its
XZ heading once, before all per-unit fan offsets. Every horizontal glob carries
that shared heading into the existing sector decision. Each pellet's own fan
heading must not become a new sector center. Source damage values, per-unit
rotations/speeds, muzzle constraints, ink payment and recorded packets remain
unchanged. Vertical modes retain their existing policy.

A real Actor press, pending windup and release create a standard Dynamo unit0
round. The camera turns on the release tick, and the actual native facing
spring continues to advance. A target four world units along the selected
central projectile's path receives 180 damage with aligned camera/body and
with the corrected +90-degree camera turn. Restoring only the old sector owner
gives 102.58956702780895 damage. The accepted yaw is 1.5707963267948966; body yaw
at capture is 0.10555555555555556. Birth, velocity, complete native projectile
records and ink payment are identical between that fixed/old-policy pair.

The focused tests cover all four added Rollers at camera yaw 0 and ±90 degrees,
30/60/120 Hz render schedules over the native fixed clock, outer-fan contacts,
near-vertical directions, actual OBB birth constraints and misses. Outer fans
retain their Outside selection rather than receiving the central curve.
Full/low-ink packet comparisons and Dynamo's existing secondary-unit policy
remain unchanged. The fixture retains real Actor/WeaponRunner/projectile,
facing, collision and damage paths; movement integration and Character drawing
are controlled fixture boundaries. No browser, GPU or retail measurement is
reported.

## Original ten rows and the eleven-weapon scope

The [original issue snapshots](original-issues.json) preserve #1804–#1814 bodies,
states and the relevant author comments as retrieved on 2026-10-29. Existing
source closures are reused, not replaced with unrelated prerequisites.

| Original row | Current software disposition |
| --- | --- |
| #1804 Flingza PaintOnly | Closed source admission owner retained; existing field filtering and source unit tests pass. |
| #1805 Roller indexed pitch/yaw | Closed; current actual-launch tests retain the sourced offsets. |
| #1806 seven-owner age falloff | Closed; current damage/rejection-window tests pass. |
| #1807 depleted Roller/Brush launches | Closed; current reduced count/speed/collision tests pass, with additional actual Dynamo input/wire controls here. |
| #1808 Brush stroke yaw/nearest slots | Closed; current source-launch tests retain both strokes and source cycle checks. |
| #1809 four Slosher nearest turf | Closed shared native owner retained; no new numerical paint rule. |
| #1810 Inside/Outside bands | Closed source tables retained; this patch repairs the demonstrated camera/body sector-reference gap. |
| #1811 Tri/Dread random yaw/sweep | Closed source resolver retained; source cap/exempt-index/no-extra-RNG controls pass. |
| #1812 steep-pitch architecture/diagnostic | Closed after substantive diagnostic acceptance; see below. |
| #1813 Dynamo UnitDamageRate=0 | Open native-semantics question; existing conditional policy preserved. |

Current real-path coverage for the original eleven affected owners is scoped as
follows. This is not a claim that every Cartesian combination in the tracker
has been rerun or retail-certified.

| Owners | Current production-composed evidence reused or rerun |
| --- | --- |
| Carbon, Dynamo, Flingza, Big Swig | Indexed full volleys, horizontal/vertical camera-pitch flight/contact/OBB matrix; source depletion tests; new central/outer camera-body sector controls on all four. |
| Inkbrush, Octobrush, Painbrush | Actual accepted launch matrix includes both repress strokes, sourced yaw, terrain/expiry, 30/60/120 Hz and original-selector negative controls; reduced-source launch tests also pass. |
| Tri-Slosher | Source yaw exemption/cap and nearest specification; actual combination releases, native posed birth and 12.0-hit/12.1-miss controls across 30/60/120 Hz. |
| Sloshing Machine | Source nearest specification, actual camera-pitch launch, falling-splash free/wall/range/lifetime and ghost cutoff controls. |
| Explosher | Actual accepted camera-pitch/lift and first-flight controls, with source profile retained. |
| Dread Wringer | Source scatter/nearest checks, combination release and actual posed two-stream/delayed-birth controls at 30/60/120 Hz. |

The current source run is 51 tests in nine files, with zero failures/skips. It
includes the existing 780-condition #1812 native/catalog flight/contact test;
780 conditions are not 780 additional top-level tests. The earlier clean-base
run of five existing files is separately retained as 33/33. Raw stdout and
leaf/receipt hashes are in [summary.json](summary.json),
[base-2b-tests.txt](base-2b-tests.txt) and
[candidate-tests.txt](candidate-tests.txt).
These local source runs used Node 24.19.0 with VM modules enabled. The split
source/positive entry points also pass 8/8 on that runtime; this is separate
from the root-owned Node 22.23.4 final emitted-build check.

## #1812 substantive acceptance and #1813's explicit warning

#1812 explicitly requested a diagnostic rather than a guessed fix. Its final
body closes the original camera/reticle architecture condition after 780
actual-flight conditions and 78 source-loaded Tidewater stage cases, including
obstruction, world muzzle/FX and pre/post aimReady. The independent weapon-only
source/build receipt is retained in
[`issue-1812-acceptance.md`](../../issue-resolution-20261022/continuation/issue-1812-acceptance.md).
Those rendered receipts are historical evidence for their named source/build;
they are not relabeled as current 2b browser runs. Exact retail parity is not
added as a new prerequisite for that completed diagnostic issue.

#1813 explicitly warns that `UnitDamageRate=0` may be a multiplier or sentinel.
Its author comment confirms the current zero-authority treatment is an
INKWAVE policy while native interpretation remains undecoded. The curated 65
records contain only one occurrence: Dynamo horizontal Unit[1], value0. There
is no nonzero sibling consumer/example in that bounded inventory from which
to establish a native zero interpretation. [unit-rate-inventory.json](unit-rate-inventory.json)
records the exact path and pinned source-row hash. A numerical field and an
INKWAVE regression test do not decode Nintendo's consuming code.

The existing three Dynamo authority tests pass: unit1 does not claim player,
device, canopy or dome damage under the current policy, both secondary globs
retain real floor/CPU turf paint, and unit0/native Splat are positive controls.
This patch neither changes that policy nor claims to settle #1813. No new
engine consumer or schema interpretation was recovered. Physical-device tests
are waived for this work; undetermined field semantics remain an evidence gap.

#1814 remains open. #1789 and #1431 are related investigations; neither nor
#992 is made a prerequisite for this bounded sector correction. Character
ground/budget/adapters, MOV08b, network admission, frozen evidence and source
parameter records are outside the patch.

## Minified-build positive entry point

The source-only old-policy counterfactual stays in
`catalog-horizontal-sector-aim.test.mjs`. A separate positive-only file consumes
the selected actual source/emitted modules without any source transform:

```sh
INKWAVE_BUILT_SITE=/absolute/path/to/the/verified/site \
  node --experimental-vm-modules --test \
  patches/splatoon3/tests/catalog-horizontal-sector-emitted.test.mjs
```

That entry point covers all four central sectors at 0/±90 and 30/60/120 Hz,
outer fans, near-vertical directions and walls/misses. A source execution of
it is labeled source execution. Final combined minified-build execution is a
separate root-owned check; no emitted success is claimed by this report.
