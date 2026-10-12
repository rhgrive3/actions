# Mini Splatling and Nautilus 47 reconstruction

Baseline: main `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`. Target IDs: `s3-spinner-quick` and `s3-spinner-serein`. Runtime: `inkwave-public` composed with `patches/splatoon3`, not the separate `game/` prototype. Procedural JavaScript geometry, using the established Pieces/lathe/box/tube construction. No Blender or retail mesh import.

## Evidence and design

The 400px rendered images and 12-frame rotation sheets from PR1246 were opened and inspected before implementation:
- `reports/inkwave-weapon-model-workspace/refs/s3-spinner-quick.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-spinner-quick.rot.jpg`
- `reports/inkwave-weapon-model-workspace/refs/s3-spinner-serein.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-spinner-serein.rot.jpg`

These are image references for Splatoon 3 Ver.11.3.0, not measured dimensions. Mini's PNG has a purple/yellow body and white reservoir; the turntable uses dark teal/white hardware and ink-colored reservoir. The candidate keeps the PNG's hardware colors and existing team-ink reservoir convention. Nautilus uses the dark metal and gold-edged shell visible in the rotation sheet. Exact retail materials and physical dimensions remain unverified.

Mini is reconstructed around an open purple saddle, black motor, raised carry handle, rear pump lever, offset low egg-shaped ink tank with broad support straps, six exposed barrels with midpoint clamp, and thick stepped muzzle plate with six open blue outlets. Nautilus is reconstructed around a deep asymmetric dished shell, opposite-side raised concentric hub, exposed ribbed neck, angular metal shroud, front bearing gap, hemispherical rotor and three open metal outlets. These replace the prior simplified boxes, bulb, lens-shaped disc and narrow tube.

## Preserved contracts

- Firing origins stay `[0,.07,.334]` and `[0,.07,.298]`; right/left grips and native trigger/barrel pivots are unchanged.
- Native charge/stream/recovery animation and all damage, ink, movement, shot timing and projectile logic are unchanged. The existing native charge tell remains.
- The four unrequested splatlings, especially the approved Heavy Splatling, are byte-identical across every geometry attribute and index buffer, including moving channels. Tests pin their baseline SHA-256 digests.
- No common kit, registry, character animation, upstream source, network or paint change.
- Components remain combined into existing body/ink/trigger/barrels channels, without extra draw groups.

## Validation status

- Source target contracts: 3/3 passed. Includes actual Actor/Runner/Character at 30, 60 and 120 Hz and support-hand error below .008m.
- All-model registry/finite geometry/Actor checks narrowed to Heavy plus the two targets: 3/3 passed.
- Mini full definition triangles 4,584 → 6,624. Nautilus 4,124 → 6,652. The increase is explicit; geometry limits alone are not a performance acceptance test.
- Full regression, emitted production tests, exact-head before/after screenshots and eight-Actor game/far ABBA measurements are pending at initial draft publication.
- Visual acceptance is pending inspection of those exact-head CI images. No retail in-game animation measurement or hardware/mobile GPU benchmark has been performed.

The dedicated workflow uses the same immutable baseline and fixed cameras for before/after. It includes five model angles, actual Actor idle/walk/charge/fire/recovery angles and eight mixed target Actors at forced game/far LOD. Timing is same-runner software rendering with a gl.finish boundary, not GPU-only time or a full match benchmark. No merge or deployment is requested.

## Initial-image corrections

The first exact-head CI gallery was inspected at 640px. Mini's open saddle, pump and tank straps are visible; Nautilus's shell depth and stepped back hub are established, but the first metallic material made the shroud read as a black box in the game shader. The shroud is now a rounded twelve-sided cast sleeve with silver faces; the dark shell uses the established satin surface so its curvature remains legible. This is restricted to Nautilus, without shared material changes. Mini's dark nozzle floors now sit in front of the plate, recessed behind each blue lip; a triangle-ray test prevents yellow plate caps.

The inherited gallery used charge-frame images under a firing label. The dedicated harness now records charge at frame110, verified real projectile emission while streaming at215, rear streaming at260, and settled recovery at430. It fails if these actual states are absent. Eight-Actor timing starts after full recovery for every weapon.

Initial full source aggregate completed with 4865 passes, 4 failures and 19 skips. All four failures came from deliberately sparse-checkout omissions (three server-import tests and a report-hash test). Restoring those existing baseline inputs yields 29/29 server tests and 1/1 report test passing. This is not reported as a clean single aggregate run; remote full CI remains the final whole-checkout gate.
