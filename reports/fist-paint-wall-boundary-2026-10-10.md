# Fist split-stamp cover boundary

## Confirmed regression

Reviewed the integrated PR1202 follow-up based on e9bb7d91, including the earlier
fixed impact-height anchor. A solid thin wall at x=6..6.2 with its outward/back
paint face at x=6.2 is beyond the right fist's x=3.27 centre. The original central
radius-10 stamp rejects that face because the source lies behind the face plane.
The 19-stamp approximation moves some centres across the wall and paints its
otherwise rejected back face. Native Physics and CPU PaintSystem reproduction:
1,025 painted back-face cells for the cluster, zero for the old central stamp.

Each split centre now has to retain line of sight from its admitted fist centre.
A blocked offset is not painted or sent. Existing centre admission, stamp radius,
height anchor, timing, damage, seed quantization and ordinary receiver admission
are unchanged. With the fix the same back-face reproduction paints zero cells.
The admitted floor portion remains painted, and sender/receiver grids agree.

## Scope and evidence limits

This is an INKWAVE decomposition regression, established against its actual
Physics/CPU paint semantics, not a new Nintendo parameter claim. Source-facing
fist constants remain unchanged. The existing 19-stamp shape approximation and
incomplete slope/short-wall fist trajectory are still not retail-equivalent.
Line-of-sight filtering can remove floor coverage beyond solid cover as well;
this is a conservative admission rule rather than a claim to preserve every
cell of the old one-circle approximation. No raw extracted data is added.

## Boundary checks

- Thin solid wall: back-face painting regression at 60 Hz and 20 Hz caller steps.
- Same wall: native sender/receiver CPU-grid equality after ordinary event replay.
- Low lip below the .12 impact plane: all 38 unobstructed offsets remain admitted.
- Prior upper shelf, low step, cliff edge and center-LOS contracts are regression
  checks only, not counted as additional defects.
- Charger wall-drop contact/end phases were inspected alongside fixed-clock
  30/60/120 Hz replay. No grounded new Charger terrain defect was established;
  its source-endpoint interpolation and omitted defaults remain as documented.

New tests before fix: 2 fail / 1 pass. After fix: 3 pass.

Focused Fist boundary/runtime/replication plus Charger wall-drop suites: 28/28 pass.
