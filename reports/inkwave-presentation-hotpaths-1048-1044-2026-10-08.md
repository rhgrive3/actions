# Presentation hot paths: #1048 and #1044

Date: 2026-10-08. Scope: offline pause redraw invalidation (#1048) and health marker LOS filtering (#1044).

## Qualified main baseline

The parent’s complete six-adapter installed-runtime qualification recorded 120 offline pause frames producing 120 settings JSON stamps and one world render. With eight full-health actors, the health marker path made eight LOS queries and returned zero markers. See `/mnt/workspace/inkwave-batch-c/evidence/additional-100/C-new-presentation-work-two-root-qualification-r341.json`.

## Changes

- `patches/local-quality/idle-resources.mjs` now compares a fixed set of settings, camera, viewport, renderer, quality, and reflection primitives. Unchanged pause frames do not serialize or enumerate the settings object. `notePausedWorldChange` is wired into the existing `_setSettings` UI writer; direct native gyro setting changes are detected through the primitive comparison. Offline pause still leaves UI ticks live, keeps online rendering live, and leaves full-frame Practice Range presentation in control.
- `patches/splatoon3/runtime/combat-info.mjs` shares one health visibility decision between the public predicate and marker builder. Dead, self, full-health, stale-damage, and concealed actors are rejected before LOS. Damaged allies need no LOS; a recently damaged enemy uses LOS only when not hidden or explicitly revealed. The health gauge, reveal exception, and row cleanup remain current.
- No movement, weapon, damage-timing, or Splatoon 3 parity claims changed. This work reduces INKWAVE presentation work; it does not infer Nintendo frame rates or unpublished game rules. The project-specific health overlay has no parity claim here.

## Validation and limits

Final focused command: `node --experimental-vm-modules --test patches/local-quality/tests/idle-attract-budget.test.mjs patches/splatoon3/tests/sub-hud.test.mjs` — 7 passed, 0 failed. It covers the 120-frame composed pause, no settings enumeration, one-shot invalidation through the real settings writer, direct settings and camera/render/reflection/viewport changes, live online pause, Practice Range full-frame isolation, eight full-health actors with zero LOS, eligible enemy LOS, damage gauge refresh, hidden/revealed rules, camera/viewport reprojection, and roster removal.

Final log: `/mnt/workspace/inkwave-batch-c/evidence/additional-100/codex2-presentation-r349-tests-final-verified.log`. `git diff --check` is clean. Earlier development runs and their correction-stage failures are retained in the same evidence directory; the final verification log is the passing run. No browser session or physical Nintendo Switch comparison was run after these source edits.
