# Six-lane special VFX provisional integration

Base: frozen PR1844 354536b365ae54bac71c9ce2970a5c5f322c1304. Local candidate only. No remote write, browser, Work, denied-artifact retry, gameplay change, shared material change or character/hair work.

## Exact production scope

Only runtime/special-vfx.mjs and new runtime/area-special-vfx-clock.mjs differ. All six patches were applied as owned hunks, not replacement files. The new helper is imported only by Tenta Missiles exhaust and Killer Wail charge. Other owned changes: marker/strike/Ink Vac retained callbacks, Crab Tank and Zipcaster termination, Booyah charge orb, Wave target-disc rotation, Bubbler/Cooler emission remainder retention. Unchanged lane specials remain explicitly deferred, not claimed improved. Original tests/assertions are retained. Standalone Zipcaster test now resolves repository paths and an optional esbuild environment path rather than another worker's checkout; absent baseline override it removes only its own hook for the same eight expected negative-control failures.

Individual evidence and retail limitations are in the five lane reports and existing behavior record. A historical Crab TAP included by that lane is a lane receipt, not the combined acceptance result.

## Verification

Node22.23.3, esbuild0.28.2. Combined six-lane tests:29/29 TAP cases, including Zipcaster file's internal seven candidate assertions in each source/emitted mode and four expected baseline failures in each mode. Support optional transformed method tests:6/6. Projectile and Booyah optional transformed method tests:10/10. Existing catalogue integration/session-tick/tick-admission and local-quality zero-drag/ribbon tests:20/20. All original assertions remain; transform options add coverage rather than relaxing checks. Source/method and stubbed full-module lifecycle tests are not rendered output.

Both changed production modules pass the actual adaptBuildSource → esbuild options → compactModuleStrings pipeline without warnings. Both are unchanged by composition. This is a bounded module emission, not a complete site build. Emitted special-vfx grows63849→64462 bytes (gzip20816→21030); the helper adds222 bytes (gzip176). Total raw emitted addition835 bytes; per-file gzip sum grows390 bytes. Final startup-budget/module graph/precache acceptance remains unrun and cannot be inferred from these sizes.

Upstream checkCompatibility passes, and upstream-lock.json is unchanged. Exact runtime/UI source admission accepts the frozen1392-leaf production inventory and rejects this1393-leaf candidate, as it should: special-vfx changes and the helper is new. No source-admission fixture, hash, guard, compatibility pin or input lock was changed. The existing public-head admission receipt must NOT be reused for this candidate. A separately reviewed exact candidate admission is required before publication.

## Unverified gates

Retail native FPS/version/frame indices, aligned action/camera footage, candidate browser/GPU frames, full site build, startup budget, hosted CI and visual acceptance remain unverified. No new retail speed, duration or particle probability was invented. These changes preserve authored60Hz presentation calibration or independently demonstrated resource cleanup, not measured Nintendo fidelity.

## Sparse tree integrity

The candidate uses a private copy of the authenticated sparse checkout. All5767 original tree leaves are preserved, including unmaterialized paths. Only enumerated owned files are staged; git write-tree --missing-ok preserves unchanged referenced blobs without pretending missing blob bodies were materialized. Missing original changed blobs are inserted into the private object database only after matching their original Git object IDs. The exact full tree comparison and local commit receipt are retained outside the repository. No deletions or remote publication.
