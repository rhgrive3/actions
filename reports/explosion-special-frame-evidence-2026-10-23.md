# Booyah Bomb, Triple Splashdown, Super Chump animation evidence

Frozen source: PR #1844, `354536b365ae54bac71c9ce2970a5c5f322c1304`.

## Independent, source-verified candidate

`patches/splatoon3/runtime/special-vfx.mjs`, DIRECTORS.booyahBomb.frame retained charge-orb callback: replace per-update angle increment 0.05 with retained elapsed seconds times 3. The previous behavior rotates 1.5 radians/second at 30Hz, 3 at 60Hz, and 6 at 120Hz. Candidate preserves the existing 60Hz presentation calibration and yields the same angle at equal elapsed time at 30/60/120/144Hz, irregular steps, and repeated zero-time callbacks. This is not a newly measured Nintendo angular speed.

Reproduction: activate Booyah Bomb, hold charge, compare orb angle at the same elapsed second across render/update rates. Expected play impact: stable visual rotation only; no charge duration, armor, physics, damage, paint, event, or player pose changes. Source callbacks, not rendered pixels, have been observed.

Only this callback was changed. Shared shell/disc helpers, primitive geometry, materials and character-model/motion work were not edited. Candidate files are copy-before-edit; frozen source remains unchanged. Tests execute the production director and retained-shell callback extracted from source. 6/6 pass, including a negative control restoring the old expression. `node --check` passes. No browser or GPU visual acceptance is asserted.

## Retail comparison remains unverified

Existing source cites Zephiel810, “Splatoon 3 - All Special Weapons (DLC Included)”, https://youtu.be/PLxqXn_E898, explicitly described as a sparse storyboard. Source comments mention Booyah charge at 13.8/15.8 seconds and Super Chump aiming at 142.3 seconds. These are historical comments, not frames inspected in this task. Native recording FPS, exact frame indices, version, capture conditions and camera/action alignment are unavailable. The referenced `patches/splatoon3/reference/special-vfx.md` is not materialized and its blob is not available in this sparse Git database.

Missing evidence: decoded retail frames for charge/throw/impact, Splashdown rise/fist formation/descent/impact, and Chump aiming/launch/flight/landing/inflation/burst; candidate rendered sequences at matched camera/action origin and elapsed frames. Existing local media scan found synthetic decoder fixtures only, not footage suitable for these specials. Browser launch and Library artifact routes previously denied were not retried.

Therefore no frame-level retail equivalence or visual quality improvement is claimed. Triple Splashdown and Super Chump retain their current animations pending actual aligned footage. Their inspected owners are catalogue.mjs (Splashdown fist positioning/rotation/impact) and special-presentation.mjs plus special-vfx.mjs (Chump launcher recoil and target/event effects). Character pose and shared materials remain out of scope.

## Regression outcome

Production-composed `catalogue-integration.test.mjs` passed 15/15 under Node 22 with experimental VM modules. This includes distinct Splashdown activation, fist damage/paint, super-jump variant, replay, and Booyah controls. It is a composed-source VM check with fixture stubs, not emitted-site, browser, GPU or frame comparison acceptance. Emitted-site testing was not run in this lane; parent integration must carry that gate. Patch syntax check passed. Normal Git diff/commit is blocked by unavailable sparse Git blob `02e99beeb80a956c0ca894a169c7a0e36ca100f7`; the delivered unified patch is generated directly against preserved frozen source.
