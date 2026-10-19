# Issue 1608: fail-fast boot diagnostics (local candidate)

Historical first attempt failed because the versioned critical module audio/weapon-recipes.mjs returned HTTP 503. The startup shell explicitly displayed failure; the harness still waited 180 seconds. This is distinct from the deployment-identity ordering repair in PR1625.

Candidate baseline: PR1630 d9470025b09d99314718aaad5a64cc6f235b4f90 harness, SHA256 c9b5daabbe3f99ad642160addba3c113a764794bb9360a7e34a0bc471c713b7d. Its Rainmaker target fixture is preserved byte-for-byte. No production file changes.

Four paths: ranked browser CLI, new boot observation helper, dedicated helper/contract test, and existing ranked workflow test wiring. No reload or new retry. Same 180000 ms readiness timeout. Same input/content/revision equality checks and local artifact hashes. Existing pageerror accumulation and final zero-error assertion remain.

Observation is attached before navigation. Same-origin, application-path document/JavaScript failures reject boot, including 404 and 503. MP3/media/image and external resources do not trigger the critical detector. The existing startup shell's visible retry state reports an explicit loader failure. Successful readiness still requires game.menus, s3.installed, and mode != boot.

Each context records its first failure and bounded subsequent failures with exact URL/status, per-event timestamps, inputHash/revision and GITHUB_RUN_ATTEMPT in result.json. Failure result is written before screenshots, and original trace stop remains in finally. A later Actions rerun is a separate runAttempt; no initial distribution failure is converted into success by this helper. Existing manifest polling is untouched.

Tests: scripts/tests/ranked-boot-diagnostics.test.mjs 12/12, CLI syntax check passes. Dedicated d947 Rainmaker target setup is byte-identical (preservation.json); its existing consumer regression is run separately and logged in target-setup-regression.log. This is CPU/event-contract evidence; a genuine public 503 cannot be induced safely and has not been rerun. Target consumer regression passes 3/3. Independent review pending.

Cleanup regression: after an early network failure, delayed start completion cannot enqueue a readiness poll. If polling was already active, existing context close terminates it; its rejection is consumed by Promise.race, tested explicitly. No page remains after the unchanged harness finally block.


## Publication composition

The publication candidate is stacked on PR #1637, commit `35caa2427d7a161d2c756c95714aa119a746d1a4` (itself based on main `fbed2d4ef5a2708307036c167d0a9df0461e8597`). Its target reset, four-mode proof bodies, weapon-state receipts and dedicated target regression remain unchanged. The central behavior report preserves that base's complete 1,224,971-byte prefix and appends only the boot-diagnostics record.

Independent composition acceptance: diagnostic tests 12/12 and exact target consumer tests 7/7. These are CPU/source checks; new-head native browser and complete CI are required before integration. The historical HTTP 503 is retained as a delivery failure, without asserting that its upstream cause has been fixed.
