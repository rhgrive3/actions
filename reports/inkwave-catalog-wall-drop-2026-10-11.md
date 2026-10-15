# Added-main wall-drop connection (23 source-backed records)

## Scope and source

This bounded change connects 13 added shooters, five added Splatlings and five added Dualies to wall-slide ownership. It does not claim all 56 added weapons with some WallDrop record now share this contract. Blasters, Chargers, nested Roller/Brush/Slosher records, Brellas, Stringers and the heavy Splatana require separate interpretation.

Source: Leanny/splat3, commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/<sourceActor>.game__GameParameterTable.json`. Each generated record retains the SHA-256 already pinned by the 65-main catalog. The extractor validates all 23 file hashes and the ten explicit numeric fields per record. CI regenerates and rejects any data diff after downloading the pinned files.

Example source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterShort.game__GameParameterTable.json

## Confirmed gap and implementation

The existing catalog generator explicitly excluded WallDropMoveParam and WallDropCollisionPaintParam. Added-main finishContact only emitted a single ordinary impact and terminated, while legacy weapons already had a bounded detached wall-slide lifecycle.

The new dedicated data module retains complete explicit move periods/speeds and shock/fall/ground radii for the 23 compatible records. Added-main terrain contact uses the existing detached lifecycle only on paintable wall faces. Player impacts, floors and unsupported families keep their original paths. Network ghosts never create a second authoritative producer. Ordinary authenticated, ordered paint rows transport the actual resulting paint, including the contacted-face hint.

A drop carries its source owner, team, seed and contacted wall face independently of projectile pool reuse. Clear/reset retires the existing detached list. High wall cells become usable wall ownership without entering floor turf; genuine floor contact uses the source ground radius and ordinary floor credit.

## Surface attribution correction

Self-review of the first candidate found that the reused helper emitted unrestricted spheres: at wall contact height 1.5, the initial wall shock credited 12 adjacent-floor cells (0.75 points), and a later wall-slide stamp added eight more before floor contact. The first final-grid test did not expose this.

The catalog-only lane now binds shock/fall stamps to the original wall face. A real floor/step collision emits the source ground stamp on the actual contacted floor face. The legacy detached lanes retain their previous behavior. Time-resolved credit, raised step and perpendicular-corner tests check both CPU ownership and atlas-entry face selection; JSON replay retains the face. This corrects attribution of this model's dedicated wall-drop primitive. It does not assert that retail wall impacts can never splash onto an adjacent floor; that distinct cross-surface splash behavior is unverified.

## Checks

- All 23 actual Actor/WeaponRunner main rounds enter exactly one wall lifecycle with the source radii. A high wall gains ownership and no floor points; every lifecycle retires.
- A low wall reaches a real floor contact. Final grid and turf agree at 30/60/120 Hz, including owner death after firing.
- Ghosts produce zero secondary wall stamps. Unpaintable wall geometry is excluded.
- Shooter, Splatling and Dualies actual NetMatch JSON paint, delayed by six simulation frames, matches the sender's complete grid. Duplicate rows do not change it; receiver replay does not award turf twice.
- Eight rapid shooters, 180 firing frames plus 60 settling frames: peak 112 simultaneous slides; peak 96 outgoing rows at a 20 Hz send cadence, below the 512-row queue capacity; 5,136 total protocol rows and 4,560 paint calls including ordinary flight paint. Reset leaves zero slides. This is a synthetic CPU fixture, not a browser frame-rate claim.
- Source initial focused checks: five passed, including pinned raw values. Additional JSON and load checks passed.
- After surface attribution correction: production-built wall/contact/legacy-Charger suite 22/22, plus the subsequently added perpendicular-corner case 1/1. Content hash `051cf8a5f24aec5a3e4e98a7dfdb8187246f6e7d3f19a9ed92398e5b8f55690b`. The existing weapons-fidelity verifier also passed 15 cases, three network modes and six wall-drop cases. Before the correction, all-65 floor paint plus existing catalog source regressions passed 23/23; existing floor paths are unchanged by the wall-only restriction.
- Browser mask fixture adds 15 real WebGL checks: the five distinct sourced shock/fall radii on wall faces, with three seeds. Actual CI result is pending; no local Chromium success is claimed.

## Limits

The finite-period, two-speed slide lifecycle and distance-based paint spacing are existing INKWAVE model choices. This change connects explicit values to that model. The optional FreeGravityType enum is retained as provenance but not interpreted as an invented post-period free-fall law. Sparse defaults, retail interpolation, precise Nintendo primitive/stencil and omitted post-period behavior remain unverified. Generic shader drips remain separate from this projectile-wall lifecycle. This is a concrete missing connection fix, not complete visual or engine equivalence.


## Current-main integration, adoption still held (2026-10-15)

Integrated current main `01aa5cc61c842a8616ab38ff5fb541b6becf1395` using a two-parent non-force merge. Shared imports retain main's current spread/freefall/rebound/projectile-shape owners while adding only the wall-drop starter and source table. The generator gate and the newer95-kit raw-reference gate both remain.

Current source9/9 and actual emitted9/9 wall-drop tests pass without skips, including all23 real main rounds, source radii, surface-only credit, death persistence,30/60/120Hz parity, replay and perpendicular corner. Production content hash `ede53c77dfcb813a0526a673034e667826b024554a731125a7caccc61044fe23`. No width, lifecycle, paint-credit or timing parameter changed in this reconciliation.

The measured feature CPU/network increase remains an adoption blocker; current-main browser cost A/B, full exact-head CI and independent review remain pending. The candidate remains Draft and is not approved for main integration.
