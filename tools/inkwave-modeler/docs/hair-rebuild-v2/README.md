# INKWAVE hair -- full reconstruction (H2), 2026-09-29

Status: **H2, stopped for the visual gate.** Not merged, not exported, production master and
production GLBs untouched. This is a from-zero rebuild, not a nudge of the old mesh -- see
"Why a rebuild, not another refinement pass" below for the evidence that made that the right
call. H1 (blockout, grey clay) was shown to the user first; this pass adds the root-to-tip
colour, denser/fuller bangs, and bigger crown/scalp coverage, per their go-ahead to continue
in this direction.

### Known-broken, left for the next pass

A procedural polka-dot shader (Voronoi cell pattern, built-in nodes, no baked PNG) was built
and its node graph verified correct link-by-link, but it produced **no visible change** in
render across several very different Voronoi scales -- a real bug, not a tuning issue, that
wasn't found in the time available. It was removed rather than shipped non-functional. The
tip currently has the colour gradient and a soft emissive glow but no dots.

## Files

- Candidate: `blender/INKWAVE_HAIR_REBUILD_CANDIDATE.blend` (copy of the production master;
  never opened as a working file for anything else).
  - `HAIR_LEGACY_REFERENCE` collection: the old 22 hair/scalp objects, hidden from render,
    kept only as a before baseline.
  - `HAIR_REBUILD_V2` collection: the new geometry (25 objects, all fresh datablocks).
- Build script: `scripts/inkwave_hair_rebuild_v2.py` -- deterministic, run on a fresh copy of
  the master reproduces the same hair (`blender -b <master.blend> --python-exit-code 1
  --python scripts/inkwave_hair_rebuild_v2.py -- --out <candidate.blend>`).
- Calibration module: `scripts/inkwave_ref_calibration.py` -- the front/back/left/right
  orthographic camera constants copied from `scripts/inkwave_blender_import.py:set_camera`
  (the setup proven to match the Three.js runtime render at silhouette IoU ~0.98, see
  `blender/README.md` section 5.2), reused here as pure numpy so reference pixels can be
  converted to world coordinates before ever opening Blender.
- Anchors: `HEAD` dict in the build script, all ray-cast against `HEAD_face`/`HEAD_skin*`
  (ground truth = the head mesh, never the old hair mesh).

## Why a rebuild, not another refinement pass

`scripts/inkwave_hair_refine.py` (the v5/v6 pipeline already in the repo) works by loading
the numpy vertex array of each existing `HAIR_strand_NN` mesh and nudging it (`a = cent + d
* (1 + bulge)`, per-row pixel-calibrated `dx` corrections, etc.) -- exactly the "move the old
mesh's coordinates a little" approach this task rules out. Its own report
(`docs/hair-refinement/README.md`) says as much: the tail-outer-contour metric it optimised
improved to 0.85 px average, but "細い毛筋、根元の重なり、光沢には参照との差が残るため、髪全体
の「完全一致」は主張しない" (fine strand lines, root overlap and gloss still differ; no
whole-hair match is claimed). Rendering the untouched legacy hair from directly above
(`docs/hair-refinement/final_5views.jpg`, "top") also shows the real problem: four flat,
blade-like paddles splayed out from the head -- a silhouette match from the front bought
with near-zero volume from other angles, which is the specific failure mode this brief warns
about. That is what justified starting over on fresh Curve geometry instead of iterating the
existing mesh again.

## Reference breakdown (section 8 of the brief)

Ground truth: `blender/references/{front,back,left,persp}.jpg`, all 448x560. front/back share
one pose; left/persp are a different, more dynamic pose (confirmed by comparing e.g. tail tip
height between front.jpg and left.jpg -- they don't correspond to the same physical
configuration). Consequence for reconstruction: front+back give a reliable, consistent X/Z
silhouette; left/persp can only be used qualitatively (volume, taper, general sweep), never
pixel-triangulated against front, since that would be forcing two different real poses onto
one static shape.

- **A. Scalp/base** -- shaved sides visible above/around the ears in front.jpg and back.jpg;
  centre part faintly visible at the crown. Rebuilt as `HAIR2_scalp`: a fresh icosphere,
  trimmed, Shrinkwrapped onto `HEAD_face`/`HEAD_skin*` (built-in modifier, applied) -- not the
  old `HAIR_scalp` mesh.
- **B. Front hair** -- many thin, spiky, overlapping fringe strands (not the 6 thick locks the
  old library had), centre-parted, tips reaching about eyebrow-to-cheekbone height. Rebuilt as
  30 thin tapered curves (`HAIR2_bang_*`, 15 positions x 2 sides), root-picked off the hairline
  anchors, tips picked off `front.jpg` (x about 230-300, y 15-100).
- **C. Side hair** -- one short lock in front of each ear, one at each temple. Rebuilt as
  `HAIR2_temple_L/R`.
- **D. Rear/crown volume** -- puffed volume right where each tail leaves the head, sitting
  above the natural scalp line in both front.jpg and left.jpg. Rebuilt as `HAIR2_poof_L/R`,
  independent of the tail curves so the tail path itself could stay clean.
- **E. Large primary locks (twin tails)** -- the main silhouette feature: root near the
  occiput/ear, sweeping outward and down, flaring into a wide, rounded, blunt-tipped paddle
  (not a point) around waist/elbow height. Centreline X/Z picked from `front.jpg` (pixels
  (280,60) through (372,226), converted with `inkwave_ref_calibration.py`); depth (Y) is a
  modelled S-curve (back near the root/poof, forward past the shoulder, easing back at the
  tip) sized to give real volume in the left/perspective renders instead of the flat-paddle
  failure mode above -- see the long comment in `build_tail()` for the exact reasoning and
  its limits. Built as `HAIR2_tail_{L,R}_main` + a slimmer `_inner` companion for layering.
- **F. Secondary locks** -- represented by the `_inner` companion strand per side for H1;
  no separate fine secondary locks yet (H2 item).
- **G. Tip design** -- teal-to-lime gradient via the UV V coordinate Blender writes
  automatically when a bevelled curve is converted to mesh (`gradient_hair_material`, a
  built-in Color Ramp -- not a per-vertex-index bake), plus a soft emissive lime glow past
  ~62% of the strand length. Polka-dot markings are NOT yet built (H3 -- needs the shape
  frozen first; the old per-strand baked-dot texture approach in `inkwave_hair_refine.py`'s
  `texture()` is reusable for this once geometry is approved).
- **H. Accessories** -- the 7 `HAIR_hair*` tie/clip objects were left live and untouched
  (they are hardware, not hair shape); whether they need repositioning against the new tail
  roots is an open item for the next pass.

## What H1 actually changed vs. the old hair

Every object in `HAIR_REBUILD_V2` is a new Curve (built-in Blender bevel-by-object + per-point
Radius taper, no custom taper/bulge math) converted to mesh -- none of it touches or derives
from the 22 quarantined `HAIR_LEGACY_REFERENCE` objects' vertex data. `HEAD_face`/`HEAD_skin*`
and all other non-hair objects are unmodified (`HAIR_REBUILD_V2` only links new objects; the
`hair_quarantine.py` step that created the collections asserted non-hair mesh hashes were
unchanged before saving).

## Known gaps before this can go further than another blockout pass

1. Tip taper/cross-section, bang layering and the temple locks are first-pass proportions,
   picked by eye off the pixel grid, not yet iterated against the reference the way the tails
   were.
2. No dots, no fine strand-groove normal map, no accessory (tie/clip) repositioning.
3. No QA pass yet (`inkwave_blender_reopen_check.py`, `inkwave_roundtrip_qa.mjs`, GLB
   export/re-import, non-hair diff) -- not run because the shape isn't approved yet and QA on
   a shape that's about to change is wasted work.
4. Side/perspective volume is a modelled compromise (see section E) checked only by eye
   against left.jpg/persp.jpg's general character, not pixel-fit.

None of the above is skipped by oversight -- the brief's own process (H1 blockout -> H2
refined -> H3 final -> STOP for a human visual gate) puts a look at the actual candidate
before more time goes into dots, QA or accessory placement that a shape change would
invalidate anyway.
