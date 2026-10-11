# Large special paint on contacted terrain

## Confirmed implementation differences

Large special disks clustered all stamps at one world Y. On a tilted floor this clipped most stamps away from the surface, despite retaining the same nominal disk parameters. Separately, the shared ground projection began 24 world units above an already known contact and could retarget a separate upper floor.

The candidate first preserves a contact within a short 0.5-WU downward probe. It retains the previous broad search only when no nearby surface exists. A large disk uses the nearby floor-like contact normal to arrange its existing stamps in that surface's tangent plane. It does not cast each tile from above, which could switch floors and enlarge slope area.

The stamp radius, tile spacing/count, seed generation, credit mode and wire representation are unchanged. Upper-layer isolation here means an already contacted lower floor is not replaced by an unrelated upper floor. This is not a claim that every retail explosion's multi-surface paint law has been reconstructed.

## Measurements and validation

Fixed seed, actual PaintSystem and actual tilted OBB terrain, central 12-WU region:

- Flat: area 852.4375 before and after, zero holes.
- 15-degree slope: area 471.4375 -> 853.9375, holes 2202 -> 0.
- 30-degree slope: area 326 -> 854.4375, holes 3275 -> 0.

Area on both slopes stays within 1% of the flat case. A rejected per-tile broad-ray candidate had inflated 30-degree area to 952.75 and was not adopted.

A two-storey fixture verifies that the old broad projection paints more than 10000 upper-floor cells while the corrected already-contacted lower-floor explosion leaves the upper floor unpainted. The test initializes both atlas and CPU grids for the added face and accounts for turf on all floor layers. Minor flat-area differences caused by atlas repacking are bounded below 0.1% rather than represented as exact equality.

Source: five new cases passed, including the counterfactuals, 30/60/120-Hz final-grid parity, adjacent wall without wall turf, and actual NetMatch JSON paint replay with identical receiver ownership. Built: the same five cases and 19 all-specials regressions passed. ContentHash `5165efd6d15899145e28d4fa3688f0afecc942a38e853420ac26647f5e59bfa6`.

## Remaining work

GitHub browser/GPU CI and parent independent review are pending. This adds one bounded contact query and four temporary vectors per large disk, not a per-tile raycast. An unsuccessful nearby ground probe adds one query before the old fallback. No browser FPS or GPU performance improvement is claimed.

The large disk still overreaches its source radius by the ordinary edge tiles, and its procedural stencil remains an approximation. The earlier boundary-shrinking candidate was rejected because it worsened slope holes. Neither that candidate nor the unpublished soft queue change is included.

## Ground-probe alias safety

A real targetless Tenta launch with no ground under its aim exposed an existing alias: the caller's output and the ray origin both used rt.v3. A missed broad probe changed aim height from 1.05 to 25.05. A dedicated reusable ground-probe vector now leaves the requested point/output untouched. The actual Actor regression covers all ten generated target points. Source terrain/contact tests 6/6 and actual built terrain plus all-specials 25/25 pass, contentHash `acb5b5f2164be3280070dce8f56f3583a3007833fb7ff4b38c40c5a7bce11217`.
