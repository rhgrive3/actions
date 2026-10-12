# Piece-local ancillary ownership traversal

## Scope and invariant

Independent candidate from adopted main `a5b7d86e67ed25e3cc711534e1240df2bd20a4ce`
(tree `d9b23a8a995fd6b68102d374a3b64a7e9101d6d3`). It does not include the
unadopted wall-drop feature, coefficient-cache candidates, or codec changes.
This is a redundant-work reduction, not new proof of original-game fidelity.

The current loop enumerates each ancillary piece's conservative cell box, then
checks each unvisited cell against **all** pieces and all five sample points.
The candidate tests only the piece whose box produced that cell. A failed
piece test leaves the cell available to later overlapping pieces. A successful
hit, an already-owned cell, or a stale order marks the cell visited. Thus the
union of successful piece/sample tests is unchanged. Native face-space stretch
is normalized before constructing entries; the existing conservative bounds,
shape equations, margin, samples, hash seeds and global clipping remain intact.

No new retained cache, array or geometry is added. Shader code, GPU quads,
network events, ownership ordering, time progression, floor-only scoring and
special credit are unchanged. Cell visitation order within one synchronous
stamp can change; claim totals and final ownership must remain identical.

## Verification

- SHA-pinned pre-optimization module is the immutable oracle.
- 2,700 staged mask comparisons cover native shapes, alternate satellites and
  spatter, floor/wall, radius, stretch, growth, enemy overwrite and stale order.
- 1,680 additional seeded boundary steps cover edge clipping, anisotropic cell
  sizes, dead-cell scoring and ownership rollback prevention.
- Installed production PaintSystem is checked against the oracle at every
  growth step, including grid, owner IDs, floor counts and credit.
- Source and explicit production-built focused ownership/hash/hidden/pool suite:
  55/55 each. Built contentHash:
  `f8e6d5ec676fd9c977c050570b590be25dc3933ea8de0031b99eb3baaf901870`.
- Required CI includes the installed-built oracle test and the existing actual
  WebGL mask/ownership browser gates. Those remote results are pending.

## Performance evidence and limits

Instrumented Node-only ownership function comparison uses 120 alternating-team
stamps, 30 growth steps per stamp and six AB/BA repetitions. Existing grid,
credit and counts match. Shape-piece predicate visits fall from 3,342,031 to
495,478 for floor shots; 17,603,869 to 1,657,107 for wall shots; and 166,084,670
to 8,546,961 for large wall blasts. This diagnostic counts primitive visits;
it is not whole-game frame time, GPU time or an original-game comparison.

A same-runner production-browser A/B against adopted main is required before
adoption. Include cold and steady paint CPU, atlas submission/drain, retained
heap plus backing buffers, grid/image equality and unchanged wire payload.
The retained wall-drop feature remains independently blocked by its previously
measured CPU/network cost until a complete composed comparison is available.
