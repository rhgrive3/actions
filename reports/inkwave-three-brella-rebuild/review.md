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

## Browser evidence gate

Dedicated `INKWAVE three Brella model review` CI builds exact main/candidate production
compositions on the same runner, renders closed and open weapons from six angles with
fixed identical before/after cameras, then drives real Actors through idle, walking,
open, fold and launch. It records hand error, finite poses, hidden launched canopy,
render triangles/draw calls and CPU+GPU-completion p50/p95 timings.
A separate same-runner ABBA pass measures eight Actors holding the three models in
game and far LOD, including animation, CPU submission, GPU-completion, unique visible
geometry memory and actual near/far weapon selection.

Status: corrective-pass browser evidence pending. The local socket/browser restriction is not a passed
browser test. This remains a Draft review candidate until the actual images have been
inspected and the CI lifecycle/cost results checked. No retail-camera alignment, IoU,
full device performance, exact scale or official-animation parity is claimed.
