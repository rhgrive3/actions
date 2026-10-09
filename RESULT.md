# RESULT — INKWAVE #93 (cl7, composed main)

Issue: https://github.com/rhgrive3/actions/issues/93
Title: [INKWAVE][Systems] Respawn uses a fixed spawn-pad slot instead of player-selected Squid Spawn landing
Base: 590410494a3e041a403398e191b7d95183912ea2 (origin/main, verified live; HEAD matched before edits)
Branch: inkwave/c-93-cl7-currentmain-20261009
Commit: 72f4ac927a09ef9d4892a1903bb42152e15f2a04
Status: COMPLETED — scoped source committed and pushed, no force.

## Changed files (scoped, 3 files)
- patches/splatoon3/runtime/respawn-lifecycle.mjs — landing completion only.
- patches/splatoon3/tests/respawn-lifecycle.test.mjs — focused landing regression.
- reports/inkwave-splatoon3-behavior-2026-10-02.md — behavior delta appendix.
- inkwave-public/ untouched (frozen); adapters only, no prototype Game.

## Source / overlap proof
- Live issue #93 is OPEN, assignees [], one OWNER comment (2026-10-08 JST batch declaration, no active fix claim).
- Live open PRs 1148/1168/1169/1170/1171/1172/1173/1174 (+401) contain no #93 fix; grep for #93/Squid Spawn/landing-selection is empty except an unrelated landing guard.
- Native `inkwave-public/src/game/actor.js::respawn()` still uses the fixed slot formula; native tree has zero `squidSpawn` references — the composed Squid Spawn lives in the adapter layer only.
- Composed main already had Turf-only aim/flight (human FIRE edge, bot/remote auto-launch, Range excluded). The gap finished here was landing only: direct pos.set + armor-at-launch, no _resolve/_surface/land lifecycle/paint.
- Claim: /mnt/workspace/inkwave-issue-claims/93/claim.json (owner=C, 2026-10-09T14:01Z).
- Duty comment: https://github.com/rhgrive3/actions/issues/93#issuecomment-6075294167
- No other issue/agent/PR/merge touched.

## What changed
- `launch()` no longer starts the finite armor clock; flight keeps native invuln (flightDuration + epsilon), `squidSpawn.phase='flight'`.
- Landing (`u>=1`) reuses the native route when available: `_resolve(false, prevY, false)` for walls/feet, then `_surface`/`_probeGround`; minimal fixtures without `collideBody` settle via the native ground probe. Then land timers/trigger, `invuln=0`, finite spawn armor `{hp:30, remaining:3.9166s (235F), break:null}` starts at touchdown, splash paint r=1.4 + burst FX, single `squidspawn:land`.
- Preserved: respawn lifecycle (special preservation, rearm KEYS, reset/spawnAt/splat wrappers), ground/collision owners, owner authority (local simulates; remote proxies mirror via existing NetMatch snapshot + SPAWN_ARMOR_FLAG), input routes (PlayerController → intent.fire edge; bots/remotes auto; Range excluded).
- Nintendo refs: issue refs are https://splatoon.nintendo.com/en/gameplay/ and https://splatoonwiki.org/wiki/Spawner_drone; direct fetch failed (cert/timeout), so no frame/distance/invuln values taken from them. Reference stays Ver.11.3.0 + Leanny/splat3 7280ff9c; flight 60F / steer 4.5 / min 2.5 / max 12 / arc 2.2 / paint 1.4 remain existing calibration, not Nintendo measurements.

## Tests (focused, meaningful)
- `node --experimental-vm-modules --test patches/splatoon3/tests/respawn-lifecycle.test.mjs` → 14/14 pass (includes new #93 landing regression: 30/60/120Hz same landing, single emit, armor-at-touchdown, bot auto-launch).
- Guards: `protection-adoption.test.mjs` (4/4) + `issue-999-roller-spawn-armor.test.mjs` (4/4) + Range `isolation.test.mjs` (7/7) → combined 15/15 pass.
- No broad local suite (per scope).

## Unfinished acceptance (not counted as solved beyond this scope)
- Browser real-action and Switch实机 comparison: UNCONFIRMED (logic-only measurement).
- Exact S3 flight timing/steer/range/arc/paint values: UNVERIFIED calibration.
- Physical-device captures, retail network equivalence: UNVERIFIED.
