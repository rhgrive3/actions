# Inkjet presentation cadence, 2026-10-21

Scope: a render-rate defect fix, not a retail-fidelity certification. Base main: 95c25af145418691991a1452d4d10589754a0f1c.

## Production ownership

scripts/build-inkwave.mjs applies scripts/inkwave-source-composition.mjs to source and patch runtime modules. runtime/install.mjs installs all-specials, then special-presentation and special-vfx. Inkjet flight/trail particles and exhaust spray are in special-vfx.mjs, separate from all-specials.mjs projectile physics, impact paint, exhaust damage and ownership. This change does not modify those gameplay owners, projectile body geometry, explosion recipe, materials, shared pool capacities, or shaders.

## Reproduced defect

ROUND_FX.inkjet.frame made one random emission decision per render. DIRECTORS.inkjet.frame did the same for each nozzle's glows/chunks/drops/ground splashes. A 120 Hz display therefore generated twice the 60 Hz spray; 30 Hz generated half.

Actual source recipe methods were executed with counted stub emissions and constant presentation random=.2 for two seconds:

| Hz | Before glows / puffs / drops / ground discs | Candidate |
|---|---|---|
| 30 | 120 / 360 / 300 / 15 | 240 / 720 / 600 / 15 |
| 60 | 240 / 720 / 600 / 15 | unchanged |
| 120 | 480 / 1440 / 1200 / 16 | 240 / 720 / 600 / 15 |

These deterministic test counts are not retail particle counts. Lifetime arguments remain glow .05s, drops .25/.45/.6s, and existing puff/disc values. Geometry follows every render as before; births now consume 60 Hz presentation ticks. A stall consumes at most two ticks and discards backlog. Squid form resets carry. No per-tick object allocation is added by the clock; all existing particle allocations remain at the existing 60 Hz budget. At 30 Hz this corrects the prior under-emission and increases particle work to that budget, so overall CPU/GPU percentage acceptance still requires measurement. No performance percentage is claimed.

## Verification status

Passed in the available JS runtime: extracted source recipe counts/lifetimes/RNG call-count comparison, ten-second clock conservation at 30/60/120 Hz, invalid dt, jitter, submerged carry reset and bounded stall. The same Node test is committed for repeatability.

Pending: Node production-composition fixture, existing full special-vfx suite, emitted/minified tests, exact-head CI, actual-browser before/after sequence and CPU/GPU/frame/allocation/draw comparison. Local shell launch failed before executing any command with ENOSPC while creating its sandbox mount target. No cleanup, deletion or sandbox workaround was performed.

## Retail reference limitation

The existing reference/special-vfx.md states that PLxqXn_E898 was only observed as 320x180 YouTube storyboards approximately 1.98 seconds apart. This cannot establish consecutive frames or particle lifetimes. The source comment has been corrected accordingly. Actual S3 continuous-frame comparison remains open; projectile body, flight trail shape, impact spray shape and exhaust-ground presentation must be judged separately. This cadence patch is not that visual completion.
