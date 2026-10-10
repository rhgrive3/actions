# Fist stamp height: regression in PR #1202 follow-up

Reviewed source: `3174350f19f388d8cbed1b9c67baf103405a2590`,
`patches/splatoon3/runtime/triple-slam-fists.mjs`.

## Reproduction and narrow repair

The new 19-stamp-per-fist network footprint queried ground height separately at
every horizontal offset. With both fist centers at floor height 0 and a shelf
at x > 6, y = 8, six peripheral stamps moved up to y = 8.12 although their parent
impact remained at y = 0.12. The former single impact's paint-face back-side
rejection would not paint that shelf. The same operation also moved peripheral
stamps down a ledge, or up a small step, independently of the admitted impact.
The original center-to-fist LOS test cannot justify those new vertical origins.

The repair changes only the peripheral stamps' Y coordinate to the quantized
parent impact Y. Horizontal centers, stamp radius 3.74, seeds and wire rounding,
19-stamp layout, personal turf accounting, damage, fist delay, and the existing
center LOS admission are retained. Per-offset `groundHeight` queries disappear.

This is an INKWAVE regression repair. No new retail surface-climbing rule is
inferred. The 19-stamp cluster remains the prior implementation's approximate
replacement for one radius-10 splat; it does not recover the original outline,
vertical reach or cell mask. In particular its 3.74 radius still has less
vertical reach than the former radius 10. This patch prevents relocating ink to
another plane, rather than claiming exact reproduction of all cliff paint.
The primary retail source for radius 10 and full slope/fist paths remains
unverified here; existing source comments are not promoted to fresh evidence.

## Tests

`fist-paint-height-anchor.test.mjs` runs the production fist action with actual
Physics LOS, actual PaintSystem CPU grids, actual NetMatch recSplat and _play,
and synthetic two-level stage geometry. It checks:

- 8-unit upper shelf: no moved origins or upper-surface ink
- 1-unit step: no invented elevated impact plane
- 8-unit drop: no downward-reprojected ink origins
- Flat floor: all 38 stamps remain valid and claim neighboring floor
- Solid wall: one fist is blocked by actual LOS; the other sends 19 stamps
- Every case: receiver grid and counts equal sender; ordinary radius ceiling
  remains intact and no special radius exception is added

Unmodified 3174350 fist module: 4 failures / 1 flat-ground pass.
Fixed module: all 5 pass, zero skips. The existing 3174350 fist behavior suite
also passes 10 tests. Renderer/audio and stage construction remain test fixtures;
this is CPU geometry/network replay verification, not browser/GPU, live relay or
physical Switch evidence. Full new-head integration remains the parent branch's
verification responsibility.
