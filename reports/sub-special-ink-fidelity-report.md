# INKWAVE Sub / Special / Ink Distribution Fidelity — review integration

## Provenance

- Source workstream package: `inkwave-astra-subspecial-fidelity-3fd91fa.zip`
- Source workstream baseline: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`
- Integration base: `0859bf4fab08edc74c25fcb790e662a748a91ec9`
- Splatoon reference: 11.3.0
- Pinned datamine: `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`

The integration was reviewed independently rather than copied verbatim from the artifact.

## Independent source review

Two raw files are hash-pinned and downloaded in CI:

- Splat Bomb blob `12894ad1f7152b9fd79b351e7d01e49219463bb4`
- Ink Storm blob `b6e86041ad2a559c6f967055c69ee2aff9769f9e`

The CI verifier checks **25 explicit JSON fields**. These cover fuse/gravity/launch components, player-velocity inheritance, Bomb paint count/radius/offset, Bomb 180/30 damage bands, Storm radius/RainNum/duration and Storm throw inheritance.

These are community datamine values, not Nintendo-official internal documentation.

## Review hardening

The supplied workstream temporarily replaced `G.physics.segment` while `_updateBombs` ran in order to start the fuse on wall contact. Although the baseline loop happened to issue one segment query per bomb, that design coupled correctness to bomb iteration and reentrancy.

This integration removes that runtime monkeypatch completely.

Instead, `sub-special-adapter.mjs` fail-closes on the one upstream arm condition and changes only:

`hit.normal.y > 0.6 && b.fuse < 0` -> `b.fuse < 0`

The native collision query, bounce, boss interaction and update ordering remain owned by the original engine.

The hardened local artifact test suite remained **10/10 passing** after this change.

## Gameplay changes

### Splat Bomb

- Existing 70% ink cost retained.
- Existing 180 / 30 damage bands retained.
- 60F fuse starts on first world-surface collision, including a vertical wall.
- Throw transform uses the pinned local Y/Z basis instead of the previous arbitrary +0.28 rad pitch offset.
- XZ player velocity inheritance: 1.6x.
- Positive Y inheritance: 4x, capped at 0.32 raw units/frame.
- Gravity remains 57.6 INKWAVE units/s² from the pinned 0.016/frame² conversion.
- Gameplay paint changes from center + 5 random children to center + 15 children with pinned secondary radius 1.064.
- Native damage/LOS/FX/audio semantics are preserved.

The replacement paint uses a local deterministic RNG while the six native calls still consume their original global RNG expressions. Regression tests lock the global draw count at **21**, preventing this workstream from silently perturbing unrelated simulation randomness.

Remote ghost Bombs do not add authoritative replacement paint.

### Ink Storm

- Duration: 8s.
- Radius: 10.
- Damage rate: **24 HP/s** instead of the old 34 HP/s.
- Throw uses the same extracted local Y/Z basis as Bomb, with Storm's smaller positive-Y inheritance cap of 0.16 raw units/frame.
- `RainNum=72` is stored as reference metadata only. It is **not** falsely interpreted as 72 gameplay paint splats.
- Existing cloud drift remains unchanged because a reliable world-unit mapping was not established.

### Special activation

Special activation refills the ink tank to `PLAYER.inkMax` before native startup. Each special's native startup/state machine otherwise remains in control.

### Tidal Slam

Tidal Slam is INKWAVE-specific. No Triple Splashdown parameter substitution is invented.

## Deterministic measurement

The included measurement harness covers nine pitch/movement throw cases plus a 5cm paint grid.

At neutral pitch / standing:

- old modeled flight: 0.75s, ~48.44 WU horizontal
- candidate modeled flight: ~0.567s, 38.08 WU horizontal

The value is a deterministic INKWAVE harness result, **not** a Nintendo range-meter claim.

Fixed-seed paint-grid measurement:

- old model: 10,457 painted cells, max radius ~3.666 WU
- candidate: 12,136 painted cells, max radius ~3.729 WU

Paint morphology is still an engine approximation; only count/radius/offset fields with source evidence are treated as pinned.

## Ownership / integration

This workstream intentionally does not modify:

- main-weapon ballistics
- Character animation
- movement physics
- input admission
- PWA/lifecycle
- network protocol

PR #63 can compose with this work. Preserve #63's existing Bomb gravity, release-origin and fuse-boundary fixes while retaining this PR's throw-vector mapping, any-surface arming condition, paint distribution, Storm 24 DPS and special ink refill.

PR #64 remains the owner for main-weapon ballistics.

## Remaining limitations

- exact Bomb bounce/friction equation mapping is still unknown
- exact original Bomb visual-particle count/lifetime is not reconstructed
- Ink Storm cloud drift is not source-calibrated in INKWAVE world units
- `RainNum` is not assumed to equal gameplay paint-call count
- physical Switch side-by-side and mobile device acceptance remain pending
