# Exact22f normal-render browser checkpoint

**PASS: one bounded Chromium gameplay smoke. Full visual acceptance and merge readiness remain incomplete.**

Candidate `22f3b7534ae2093aef4c2549112a85a1da09bbf3`, tree `0d9b6632a4f872014e34d12a91856647f6f0a1ab`. The normal build was created on private `10265ced65866219c58b1ca3f43220e0a032ef27` and bound to the same complete public tree and1421 build inputs; this is not a new hosted-artifact browser run. Full identities and evidence hashes are in [checkpoint.json](checkpoint.json).

[Own-game normal follow-camera image, native tick408](normal-follow-native-tick408.png) was visually inspected. Normal RAF reached playing, native launch, supported landing at363, and KeyW movement at393 with horizontal displacement1.026. Match, local actor, controller and input owners matched. Page/console/request/HTTP errors were absent; observed GL errors and special-director errors were0, context was not lost. The endpoint alone was frozen after the functional checks for an exact tick408 PNG and readback. Characters are incidental and unedited.

Conditions: actual system Chromium154.0.8037.57, Playwright1.62.1,960×640, seed0x01a2b3c4, Tidewater/day, low quality. Existing runner GPU/browser flags,30s operation bounds and180s bootstrap bound were unchanged. No manual simulation steps, phase assignment or rendering suppression. Native1/60 simulation ticks, delivered render calls and browser wall clock are distinct; no hardware-FPS claim is made.

Original failed probes and logs are preserved with hashes in the JSON. The first walk assertion preceded supported landing. A fire assertion observed input before a subsequent native update; the last controller sample was still from the preceding tick. An instrumentation attempt also used the wrong controller property. The corrected owner/state-gated case passed without runtime changes or relaxed movement assertions.

At15:45:25 UTC, exact22f Validate39977387271 had build_site, seven_claims and resource_paint_continuation success; shards7/5 were running and remaining jobs pending/queued. Diagnostics were skipped, not passes. Projectile39977387256 automatic_capture_route was queued. **Actual comparison event base is NOT OBSERVED**: PR/run API metadata still reports726 while main ref is7e; no actual event payload/before-checkout is claimed.

Remaining: exact-head hosted CI, absent WebKit, broad final acceptance and real-device performance. This small case adds no fresh special A/B, lifecycle matrix, transport test or leak certification. Previous source/build/startup12/12/emitted24/24 and own-game A/B keep their original provenance. No additional expensive stall measurements, Nintendo media, production candidate/main/PR ref edits or CI dispatch were made. This checkpoint is stored only on the existing report-only branch.
