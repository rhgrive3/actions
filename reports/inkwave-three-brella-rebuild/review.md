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
- `weapon-models-brella-rebuild.test.mjs`: 4/4 passed. Includes unchanged Undercover geometry,
  sockets/channels/budgets, read-only finite open/fold/launch/break/reappear at 30/60/120 Hz,
  real shot emission and hostile-projectile shield blocking/launch at 30/60/120 Hz.
- Existing main-weapon catalogue, adapter and base reference-model tests: 32/32 passed.
- Local checkout is a text mirror; modified `brellas.mjs` baseline blob SHA was checked
  against main: `5a4d43899b6204b274a6b970811e9323a6f73ebe`. Publication is composed directly
  on the complete main tree through the GitHub connector.

| Model | Before triangles | Candidate triangles | Before rest bytes | Candidate rest bytes |
|---|---:|---:|---:|---:|
| Splat | 4,028 | 5,490 | 107,368 | 156,460 |
| Tenta | 2,276 | 8,224 | 59,576 | 228,784 |
| Recycled | 5,351 | 8,899 | 141,266 | 268,794 |

All parts remain merged by material channel, with no material groups. Splat/Tenta
retain the existing draw channels. Recycled adds one team-ink cloth draw channel;
this is an explicit cost, not a free visual change. Geometry is cached at definition
creation, and the per-frame canopy animation is unchanged.

## Browser evidence gate

Dedicated `INKWAVE three Brella model review` CI builds exact main/candidate production
compositions on the same runner, renders closed and open weapons from six angles with
fixed identical before/after cameras, then drives real Actors through idle, walking,
open, fold and launch. It records hand error, finite poses, hidden launched canopy,
render triangles/draw calls and CPU+GPU-completion p50/p95 timings.
A separate same-runner ABBA pass measures eight Actors holding the three models in
game and far LOD, including animation, CPU submission, GPU-completion, unique visible
geometry memory and actual near/far weapon selection.

Status: browser evidence pending. The local socket/browser restriction is not a passed
browser test. This remains a Draft review candidate until the actual images have been
inspected and the CI lifecycle/cost results checked. No retail-camera alignment, IoU,
full device performance, exact scale or official-animation parity is claimed.
