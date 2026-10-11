# Added-main wall-drop connection (23 source-backed records)

## Scope and source

This bounded change connects 13 added shooters, five added Splatlings and five added Dualies to wall-slide ownership. It does not claim all 56 added weapons with some WallDrop record now share this contract. Blasters, Chargers, nested Roller/Brush/Slosher records, Brellas, Stringers and the heavy Splatana require separate interpretation.

Source: Leanny/splat3, commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/<sourceActor>.game__GameParameterTable.json`. Each generated record retains the SHA-256 already pinned by the 65-main catalog. The extractor validates all 23 file hashes and the ten explicit numeric fields per record. CI regenerates and rejects any data diff after downloading the pinned files.

Example source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterShort.game__GameParameterTable.json

## Confirmed gap and implementation

The existing catalog generator explicitly excluded WallDropMoveParam and WallDropCollisionPaintParam. Added-main finishContact only emitted a single ordinary impact and terminated, while legacy weapons already had a bounded detached wall-slide lifecycle.

The new dedicated data module retains complete explicit move periods/speeds and shock/fall/ground radii for the 23 compatible records. Added-main terrain contact uses the existing detached lifecycle only on paintable wall faces. Player impacts, floors and unsupported families keep their original paths. Network ghosts never create a second authoritative producer. Ordinary authenticated, ordered paint rows transport the actual resulting paint.

A drop carries its source owner, team and seed independently of projectile pool reuse. Clear/reset retires the existing detached list. High wall cells become usable wall ownership without entering floor turf; genuine floor contact uses the source ground radius and ordinary floor credit.

## Checks

- All 23 actual Actor/WeaponRunner main rounds enter exactly one wall lifecycle with the source radii. A high wall gains ownership and no floor points; every lifecycle retires.
- A low wall reaches a real floor contact. Final grid and turf agree at 30/60/120 Hz, including owner death after firing.
- Ghosts produce zero secondary wall stamps. Unpaintable wall geometry is excluded.
- Shooter, Splatling and Dualies actual NetMatch JSON paint, delayed by six simulation frames, matches the sender's complete grid. Duplicate rows do not change it; receiver replay does not award turf twice.
- Eight rapid shooters, 180 firing frames plus 60 settling frames: peak 112 simultaneous slides; peak 96 outgoing rows at a 20 Hz send cadence, below the 512-row queue capacity; 5,136 total protocol rows and 4,560 paint calls including ordinary flight paint. Reset leaves zero slides. This is a synthetic CPU fixture, not a browser frame-rate claim.
- Source initial focused checks: five passed, including pinned raw values. Additional JSON and load checks passed.
- Production-built wall/contact/falling suite: 17 passed at content hash `edbc2ec9c1644478068af60f9eb682c75cf79ca779893f0e9aa47b458191b622`; the final wall suite, including unpaintable walls, separately passed all seven tests on that same production-built hash. All-65 floor paint plus existing catalog source regressions passed 23/23.
- Browser mask fixture adds 15 real WebGL checks: the five distinct sourced shock/fall radii on wall faces, with three seeds. Actual CI result is pending; no local Chromium success is claimed.

## Limits

The finite-period, two-speed slide lifecycle and distance-based paint spacing are existing INKWAVE model choices. This change connects explicit values to that model. The optional FreeGravityType enum is retained as provenance but not interpreted as an invented post-period free-fall law. Sparse defaults, retail interpolation, precise Nintendo primitive/stencil and omitted post-period behavior remain unverified. Generic shader drips remain separate from this projectile-wall lifecycle. This is a concrete missing connection fix, not complete visual or engine equivalence.
