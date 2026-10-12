# Tri / LACT shape pass 2

The user's 2026-10-12 follow-up rejected the two non-green bows as finished. This candidate changes only Tri-Stringer and REEF-LUX/LACT geometry; it does not inherit visual acceptance from PR1271. The green Wellstring and all motion code remain byte-identical. PR1273's index experiment is separate and is not included.

Baseline: PR1271 head `bac165e44ff97657639e57c85bcecf20590e13df`. Inspected references are the two original 3D PNGs and both twelve-view sheets in PR1246. Projection is unknown, so the following ratios are directional image comparisons, not official physical dimensions.

## Residual diagnosis and construction

| Feature | Previous candidate | Visible reference estimate | New candidate |
|---|---|---|---|
| Tri centerline sag / root-tip chord | 3.2% | about 7–9% in visible upper/lower arcs | 8.31%, continuous cubic |
| Tri wood tip/root broad width | 0.49 | roughly 0.25–0.35 excluding end fitting | 0.30 |
| Tri tip span / central diameter | 6.35 | projected roughly 7.5–8 | 7.27 |
| REEF centerline sag / chord | 24.4% | projected roughly 23–26% | original arc controls retained and smoothed |
| REEF span / black cast diameter | 5.17 | projected roughly 3.4–3.9 | 3.80 |
| REEF distal normal thickness | nominal .021 became about .0086 due to fixed-Z section | a substantial neck remains through the hook | .028 model units, tangent-normal section |

The old ribbon face ordering was inward. The new eight-vertex bevelled sections have outward winding on both mirrored limbs. Closed end caps and positive signed volume are tested. The section follows the local tangent instead of shrinking as the arm turns toward Z.

Tri uses a longer continuous bow-out, tapered layered wood, a socket that follows the limb, and splayed outer cartridges rather than three parallel tubes. The cylinder retains length but is slimmer relative to the long span; the rear cage and mechanical bridges are continuous structures. Existing string endpoints and all hand/muzzle anchors are retained.

REEF uses a thick cast arm from its flared root into a fuller end boss, with a narrow inset-looking channel inside the mass. Its central housing is shorter/fatter in proportion, with a shaped black saddle into the pale grip. The reference turntable's coloured threaded front is represented by the team-ink channel. The groove is an opaque procedural approximation, not a scanned casting or optical recess measurement.

## Checks and cost

- Source shape checks: mirrored outward winding, non-pinched distal section, actual curve controls, tip taper, unchanged green builder/motion: 3/3 pass.
- Existing six-model sockets/cache/void/bow animation contracts: 3/3 pass.
- Current whole-weapon triangles: Tri 7,308→7,500; REEF 7,864→9,452. Those increases are acknowledged; a triangle cap alone is not a performance result.
- Production build succeeds, content hash prefix `f0e32a952f70`.
- Actual emitted Actor contracts, same-camera original/before/after views and eight-Actor near/far ABBA are required in the dedicated workflow. The new candidate remains unaccepted until the generated images are inspected.

## Still unverified

Reference camera/scale, exact Nintendo casting section, groove depth, cartridge tilt and grip dimensions are not calibrated. The candidate's curvature and solid section are measurable in its own coordinates, while the source ratios remain estimates. No retail gameplay/animation parity, hardware GPU timing, mobile FPS or full-match performance claim is made. The common pose, firing clocks, hit/paint/network logic, registry and shared kit are unchanged.
