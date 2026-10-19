# Rainmaker carrier timeout QR candidate

Publication base: main56bbf33832563f32f18662353a160d0e049d1672. The three runtime files are unchanged from the tested main1cbe baseline. Separate from PR1630: that PR's phase-floor changes in gear.mjs and natural-SP changes in ranked/network.mjs must be retained when reconciling. This copy contains only the timeout death hunks, and ranked/install.mjs is unchanged.

Reference: https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割2#quick_respawn . The S3 section describes Rainmaker barrier-contact/self-explosion deaths and subsequent no-kill enemy deaths as QR-eligible. Its general eligibility rule still requires an earlier qualifying death and zero intervening kills. The candidate uses that conservative interpretation: first timeout establishes history but is not unconditionally shortened. No official patch-specific video was recovered. Barrier contact is outside this change.

Production path: local carrier timeout→splat(null,'rainmaker-timeout'); remote timeout→authenticated rkdamage with deathReason:'rainmaker-timeout', null attacker,2000 damage→Actor.damage with explicit death cause→existing deferred-lethal flush→gear history. Other null damage and ordinary 'rainmaker' source are not promoted. The optional new tag is rejected if unknown or attached to non-null attacker/non2000 damage. Existing host/match/sequence/life gates remain.

An actual composed follower test exposed an existing undefined-attacker hit-listener failure: array.find returned undefined; roller.resolveRemoteContact compared runner?.a===attacker (undefined===undefined) and then read runner.s3PendingRollHits. Network now normalizes absent attacker to null, consistent with the damage call and local timeout path. No roller source change. Tests cover ordinary null cause/missing cause, the three allowed Rainmaker object causes, and rejected water/fall/environment wire causes without QR activation.

Semantics at57AP:
- first timeout8.5s, following no-kill enemy4.5s
- enemy→timeout:8.5→4.5s
- enemy→kill→timeout: timeout8.5s; next enemy without new kill4.5s
- ordinary self/water/fall remain non-qualifying, preserve earlier history, and cannot create fake enemy kills
- real enemy-attributed Rainmaker death remains ordinary enemy death
Absolute8.5s simulation baseline is unchanged; this is an eligibility correction, not a claim of retail total-time equivalence.

Original-runtime negative reproduces missing history, lost tag and undefined-attacker exception. Main consumer reproduction is preserved under gear-audit20261019/qr-review. Candidate tests exercise composed production methods; browser/native evidence remains required. No settings, cosmetics, physics or timing thresholds changed.

Validation before publication: dedicated composed-consumer tests 5/5; related six-file regression 74/74. Independent review reproduced 5/5 and the unchanged-runtime negative (4 failures, 1 ordinary-cause control pass). Exact-head CI and emitted/native verification are pending.

Reproduce: `node --experimental-vm-modules --test patches/splatoon3/tests/rainmaker-qr-timeout.test.mjs`. For emitted verification, set `INKWAVE_BUILT_SITE` to the verified exact-head full_site artifact; the shared fixture loads emitted modules without applying source adapters again.
