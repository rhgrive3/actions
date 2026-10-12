# Circled Brella rebuild: review candidate

Scope: `s3-shelter-normal`, `s3-shelter-wide`, `s3-shelter-focus`, only.
Baseline: main `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`.
Reference: Splatoon 3 Ver. 11.3.0. Static model renders and rotating model sheets in
[`../inkwave-weapon-model-workspace/refs/`](../inkwave-weapon-model-workspace/refs/) and
[`../inkwave-weapon-model-workspace/rotsheets/`](../inkwave-weapon-model-workspace/rotsheets/).
These images were inspected before implementation. The Heavy Splatling rebuilt in PR #1246
is the procedural construction reference. No Blender, retail mesh, external texture,
new shader, registry, shared Pieces/kit or gameplay changes are included.

## Construction

- Splat Brella: eight separately sampled curved cloth gores with pale alternating hems,
  dark/red inlaid marks and striped badges, edge seams, radial metal stays and small
  ink tips; blue open trigger guard, banded shaft and stepped hollow-looking muzzle.
- Tenta Brella: tensioned rectangular tent cloth with curved hems, separate window
  appliqués on both faces, red bowed crossing poles standing clear of the cloth,
  clamps, ferrules, stays and a mechanical crossing plate. This replaces the four
  flat triangles and plain crossing tubes.
- Recycled Brella: 24 separate paper gores, ink-coloured paper, pale registration ring,
  dark outer hem, full radial bamboo ribs and conical stretcher cage, lacquered bent
  handle, ferrules, stepped red/black hub and green lamp. This replaces the plain
  grey dome and sparse inner bracing.

The original nozzle sockets, support-hand sockets, canopy pivot, fold scale and all
open/fold response rates are unchanged. The existing visual scale animation remains
an approximation of a physically folded umbrella; this change does not claim a
retail folding simulation. The game still uses the unchanged capsule shield collision,
not the render triangles. The uncircled Undercover function is unchanged, and its
merged model SHA-256 is byte-identical to the baseline.

## Local checks

- Production build passed: `6e33ab46592f` (candidate before browser review).
- `weapon-models-all.test.mjs`, four Brellas: 3/3 passed, including live Actor/Runner/Character hold.
- `weapon-models-brella-rebuild.test.mjs`: 5/5 passed including the corrective guard regression. Includes unchanged Undercover geometry,
  sockets/channels/budgets, read-only finite open/fold/launch/break/reappear at 30/60/120 Hz,
  real shot emission and hostile-projectile shield blocking/launch at 30/60/120 Hz.
- Existing main-weapon catalogue, adapter and base reference-model tests: 32/32 passed.
- Local checkout is a text mirror; modified `brellas.mjs` baseline blob SHA was checked
  against main: `5a4d43899b6204b274a6b970811e9323a6f73ebe`. Publication is composed directly
  on the complete main tree through the GitHub connector.

| Model | Before triangles | Candidate triangles | Before rest bytes | Candidate rest bytes |
|---|---:|---:|---:|---:|
| Splat | 4,028 | 5,952 | 107,368 | 174,992 |
| Tenta | 2,276 | 7,192 | 59,576 | 200,352 |
| Recycled | 5,351 | 7,602 | 141,266 | 234,012 |

All parts remain merged by material channel, with no material groups. All three retain their existing near/far draw counts. Recycled reuses the native
otherwise-empty ink draw for paper, applying the same canopy-pivot transform to that
mesh; its far-LOD merged mesh remains a folded umbrella. Geometry is cached at definition
creation, and the per-frame canopy animation is unchanged.

## First browser review and corrective pass

Initial `f18df754` visual and eight-Actor ABBA jobs both passed in run
[38205572107](https://github.com/rhgrive3/actions/actions/runs/38205572107).
Actual images were inspected. Shape changes are visible from front, underside, side,
and in-hand; open/fold/launch visibility and native hand contacts worked. The review
also found and corrected issues rather than treating the first passing render as final:

- The Tenta shield was aimed at the ground once its single-shot firing pose expired.
  This also existed in the baseline. The three selected models now have a narrowly
  scoped sustained-guard pose, reading the existing live shield centre/direction.
  It yields to firing/recoil, sub-weapon preparation, specials, squid form and dance;
  it folds away after release/launch. The shared Character/motion code is untouched.
  Native `wAim` / `aimReady()` are deliberately not overwritten, since projectile
  origin blending reads them. This is a visual holding layer, not a collision change.
- Splat's white hem overlay was hidden by team cloth on the underside. Its fixed pale
  cloth is now cut out of the ink area, and the fixed markings are mapped to both sides.
  Concave marks are triangulated and lightly subdivided to follow the curved cloth.
- Recycled paper was too inflated. The 24 panels now have shallow paper tension and
  a subtler hem inset, keeping the dark edge, pale ring and full spoke/stretcher cage.
- Invisible fine seam tubes, excessive spoke sections and window/pole subdivisions
  were reduced. The table above reflects the corrective pass, not the first image.

Colour allocation was checked against the rotating references: Splat's main fabric
is team-coloured with distinct pale hem panels and fixed dark/red markings; Recycled's
paper is purple in the reference turntable while its pale ring, dark outer rim, bamboo
frame and red/black hub stay fixed. The grey static render is not used to justify
making every surface grey. The browser output additionally includes neutral-ink
front/back views so these boundaries can be compared independently of team orange.

A new real-Actor regression covers 30/60/120 Hz, left/right yaw, strafing and pitch.
After 0.20 s of settling, native sway remains bounded at under 6 degrees / 5 cm from
the unchanged shield plane, and the support hand stays within 8 mm. This is not a claim
that the existing broad capsule collision exactly follows the cloth outline.

The first ABBA pass measured a real cost: game LOD 110→112 draws,
288,350→317,676 triangles and 2,078,566→2,424,394 visible geometry bytes; render-complete
p50 2.1/2.3→2.5/2.5 ms and p95 4.2/4.2→5.4/7.9 ms. Far LOD retained 56 draws, with
80,290→82,639 triangles and 588,024→595,034 bytes. Timing is a headless software-renderer
comparison, not device FPS. Final corrected code must be remeasured before adoption.

## Corrected crowd cost (same runtime as the final framing pass)

The corrective model pass completed its strict 8-Actor ABBA gate in
[run 38207681732](https://github.com/rhgrive3/actions/actions/runs/38207681732),
[artifact 11729050049](https://github.com/rhgrive3/actions/actions/runs/38207681732/artifacts/11729050049).
Game draws remain 110 and far draws remain 56. Game triangles are
288,350→313,372 (+8.68%) and unique visible geometry is
2,078,566→2,379,712 bytes (+14.49%). Far is 80,290→82,052 triangles (+2.19%) and
588,024→593,954 bytes (+1.01%). All eight actors select the expected near/far weapon path.

Game ABBA render-complete p50 is 2.8/2.5 ms before versus 3.1/2.1 ms after;
p95 is 6.9/6.9 versus 6.6/3.1 ms. Animation p50 is 5.9/5.7 versus 6.0/5.5 ms;
p95 is 12.7/12.7 versus 15.6/8.2 ms. Far completion p50 is 2.6/1.9 versus
2.0/2.7 ms, and p95 is 5.4/2.8 versus 4.9/4.9 ms. These interleaved software-renderer
samples overlap, including their variability; they do not prove a device FPS gain
or zero cost. The deterministic geometry/memory increases remain explicit adoption
tradeoffs. The original draw increase was removed by using the existing Recycled ink
channel, not by changing the gate.

## Browser evidence gate

Dedicated `INKWAVE three Brella model review` CI builds exact main/candidate production
compositions on the same runner, renders closed and open weapons from six angles with
fixed identical before/after cameras, then drives real Actors through idle, walking,
open, fold and launch. It records hand error, finite poses, hidden launched canopy,
render triangles/draw calls and CPU+GPU-completion p50/p95 timings.
A separate same-runner ABBA pass measures eight Actors holding the three models in
game and far LOD, including animation, CPU submission, GPU-completion, unique visible
geometry memory and actual near/far weapon selection.

Corrective pass `d0e39ce4` completed all images and live states in
[run 38207681732](https://github.com/rhgrive3/actions/actions/runs/38207681732).
Its visual summary failed the strict draw-count equality: Tenta open changed from
9 to 8 scene draws as the corrected shield entered a different camera region. The
telemetry also exposed an uncontrolled body LOD (closed ~36k scene triangles versus
open ~111k) and the fixed bench camera did not follow the actor's walked position.
The raw failing artifact is retained as
[11727369555](https://github.com/rhgrive3/actions/actions/runs/38207681732/artifacts/11727369555).

The next harness revision keeps the strict equality assertion. It locks actual
Character LOD to game, records/asserts game/near selection, follows actor position
with the same fixed camera offset and expands the identical before/after field of
view to include the entire held shield. These are measurement-condition corrections;
no model geometry is changed to hide a draw-count difference.

## Historical model-only reverse-facing failure

An independent real-Actor review added reverse input (±0.05 horizontal, -1 forward,
1.4 m/s) at 30/60/120 Hz. When the firing pose expires, native `Actor._face` turns the
body toward travel while the live shield still follows aim. Tenta can then lose left
hand contact by about 4.47 cm; Normal/Recycled can reach about 8.7° / 7.9 cm of shield
misalignment during the reverse turn. The existing stationary/strafe checks did not
cover this case. The browser harness now emits a separately labelled reverse diagnostic,
without disguising this known failure as a passed movement gate.

Removing the visual ±90° torso clamp can cure Tenta's wrist gap numerically, but would
spread a 180° twist across the torso and does not resolve the other models' transient
sway. That workaround was rejected. A separately reviewed, narrowly scoped live-guard
facing contract was required. This model-only failure is preserved here rather than
reclassified as a pass; the separately reviewed resolution is described below.

## Integrated guard-facing review

The model-only fixed-framing/fixed-LOD pass `317e4230` passed all four workflows,
including visual and ABBA crowd in [run 38209331238](https://github.com/rhgrive3/actions/actions/runs/38209331238).
Its actual front/rear/side, neutral-material and held images were inspected. Main
remains `b078c379` at integration preparation; the before composition stays pinned to
that exact main head.

The narrowly scoped resolution from Draft #1275 uses the existing successful paid-shot
preparation and open/unlaunched state to admit only the three selected Brellas to
native Actor aim-facing. It retains native facing spring, roller/special priority,
remote replicated yaw and shot/movement/collision owners. It changes neither upstream
actor.js nor the shared movement-physics adapter. Undercover remains excluded and
never receives the preparing flag. See [facing-candidate.md](facing-candidate.md) for
the rejected alternatives, 65-weapon equality traces, 243 live holds, remote/wire
proof and exact browser evidence. Parent review accepted the candidate anatomy after
viewing its reverse images; no unnatural torso twist is used.

The integrated PR workflow reruns source contracts, actual emitted-runtime guard and
NetMatch/wire tests, full-angle/lifecycle/reverse browser checks and the same main-vs-
candidate eight-Actor ABBA cost test on its new head. Previous green commits are
historical evidence only. Integrated-head CI and measurements are reported on the PR
when complete. Until then this remains Draft and is not declared ready to merge.
The existing #857 emitted-test harness limitation is documented in the scoped report;
its supported source fixture and a new direct real-NetMatch built test both run.
No retail-camera alignment, IoU, full device performance, exact scale or official-
animation parity is claimed.
