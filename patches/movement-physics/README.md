# Movement physics fidelity

Baseline main: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`

This directory documents and tests the authoritative root-physics changes in:

- `patches/splatoon3/movement-physics-adapter.mjs`
- `patches/splatoon3/runtime/movement-physics.mjs`

The source package that produced this draft reported 604 new tests passing, 23 existing movement/resource/collision/action/superjump tests passing before and after, and 96 scenarios across five render schedules (480 comparisons) with identical fixed-step trajectories.

The full raw measurement package remains outside the repository because it contains large generated JSON/CSV/TAP evidence. This Draft PR keeps the production change, lightweight regression gate, summarized measurements and remaining acceptance work reviewable.

## Lightweight check

```sh
node --test patches/movement-physics/tests/movement-smoke.test.mjs
```

The complete artifact-backed harness from the source package additionally requires the pinned build artifact for baseline `5e28dbd...`.

## Scope

Owned here:

- Dualies dodge distance integration after action admission
- bounded collision integration for high-speed dodge
- exact dodge/recovery floating-point boundaries
- wall-squid lateral input normalization
- roller rolling movement owner/state guard
- roller authoritative root heading while rolling
- actual `dt` propagation for air-time accounting

Explicitly not owned here:

- input buffering/admission
- animation/IK/poses
- network replication
- weapon range/damage/spread
- iOS/PWA lifecycle
- runtime/loading performance

See `reports/movement-physics-fidelity-report.md` and `remaining/movement-physics-followups.md`.
