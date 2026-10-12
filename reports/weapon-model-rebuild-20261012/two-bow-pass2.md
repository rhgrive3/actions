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

- Source shape checks: mirrored outward winding, non-pinched distal section, actual curve controls, tip taper, unchanged green builder/motion: 5/5 pass.
- Existing six-model sockets/cache/void/bow animation contracts: 3/3 pass.
- Current whole-weapon triangles: Tri 7,308→7,500; REEF 7,864→9,688. Those increases are acknowledged; a triangle cap alone is not a performance result.
- Production build succeeds, content hash prefix `47c6588af511`.
- Actual emitted Actor contracts, same-camera original/before/after views and eight-Actor near/far ABBA are required in the dedicated workflow. The new candidate remains unaccepted until the generated images are inspected.

## Still unverified

Reference camera/scale, exact Nintendo casting section, groove depth, cartridge tilt and grip dimensions are not calibrated. The candidate's curvature and solid section are measurable in its own coordinates, while the source ratios remain estimates. No retail gameplay/animation parity, hardware GPU timing, mobile FPS or full-match performance claim is made. The common pose, firing clocks, hit/paint/network logic, registry and shared kit are unchanged.

## First image inspection and correction

The first exact-head Chromium sheet visibly improved the continuous Tri sweep and REEF cast thickness/proportion. It also exposed an upper/lower Tri laminate-face inversion: the lower tangent normal selected the opposite Z face. This is corrected with an explicit mirrored-face rule and a symmetry test. The original 640px views are retained as first-pass evidence, not final acceptance.

The REEF rear pale C-shaped pull-yoke visible in the reference was still missing. It is now geometry of the existing nock channel, with its original pivot unchanged. A test verifies the complete casting moves back exactly .17 model units at full draw and returns to the same anchor; no new motion or instance node is added. This is an image-guided attachment interpretation, not confirmed source animation parity.

The threaded front coupler appears pink throughout the supplied turntable while the static PNG uses neutral grey. Only the corresponding external coupler is assigned team ink; the narrow silver metal ribs and black outlet remain fixed. The complete new images and eight-Actor measurements remain required before acceptance.

## LACT-only cast-structure rework after renewed review

The user's 06:40 request concerned the lower LACT shown in the first pass2 sheet, before the rear-yoke correction was delivered. The yoke was already present in bb284899; this rework does not report it as still missing. That head passed all general CI, but LACT acceptance and the planned PR1271 integration remain on hold.

Actual corrected 640px views and the original turntable still expose three problems beyond overall ratios: the smaller rear cylinder and larger front/root collar read as one swollen barrel; the root seats and lower saddle lack distinct rounded mass; the rear yoke is a flat-sided strap with an overly thin dark shaft. The limb channel was a grey strip, not geometric relief.

This new candidate changes only LACT. It separates a narrower straight rear receiver from a stepped front collar, seats the pale roots into rounded black cuffs on that collar, and gives the lower saddle volume. The curved pale limbs use a connected cast cross-section with raised rounded rims and a physically recessed web. The painted groove strips are removed. The rear yoke has a smoothly varying oval section and tapered ends, and a pale 19mm-diameter model-space shaft connects it visibly to the rear receiver. That diameter is an authored approximation, not an official measurement. Existing nock/arrow pivots and draw laws remain unchanged.

Reference turntable views 1/1, 1/4 and 2/1 support the root/collar registration, but do not establish an exact Z coordinate or groove depth. The new arm shape must be checked in side and reverse-oblique images rather than accepted from source or a single span ratio. Tri and Wellstring builds and all motion remain unchanged. Latest exact-head screenshots and cost measurements are required; earlier green checks do not validate this rework.

### Full-resolution pass3 corrections

The new actual images confirmed the stepped receiver, forward root registration, rounded yoke/pale shaft and geometric groove. They also exposed two introduced fit errors: charge rings intersected the enlarged collar, and the guide pegs retained their old rear endpoints after the arm moved forward. Ring radius/axial span now clear the constant-radius collar; the guides start within the relocated arm and project forward only. The recessed section now blends into a solid pale root cuff before reaching the black seat, with the bolt moved onto that cuff. This last change adds no vertices. A geometry test checks ring clearance and the full root web. These bounded corrections require new images; pass3's prior pixels are preserved as evidence.

### User-requested central-body reduction

At 07:04 the user judged the pass3 center too large. The previous projected span/diameter estimate did not establish an acceptable assembled proportion. This candidate retains the white limbs/yoke and their thickness, but reduces the main front collar diameter .160→.132 (17.5%), rear barrel diameter .118→.102, and rearward receiver extent .118→.096. The main shoulder also ends earlier, with a small neck reaching the unchanged muzzle assembly. The front threaded coupler shrinks .104→.088 and the lower saddle is reduced to match. The geometry is not globally scaled: hand/muzzle/nock anchors stay fixed. Ring clearance, root cuffs and guide seating are adjusted in the same candidate.

The next fixed-camera comparison uses the user-reviewed pass3 head28332388 as baseline. It must also show actual Actor-held scale relative to the hands/head, not just an isolated silhouette. No adoption is claimed until that image, new performance measurements and exact-head CI are reviewed.
