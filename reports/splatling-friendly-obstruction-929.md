# Issue929: Heavy Splatling friendly obstruction

Base: accepted integration c633befcf9c6c17d667f6d050a97f90ad5b13332. This is a separate local candidate, not a change to that accepted head.

The installed collision record already preserves FriendThroughFrameForPlayer, but setCollision only copied it to the shared solver for Shooter, Slosher and Roller. Heavy Splatling was excluded. Add only Heavy to that family selection. The existing continuous capsule solver, contact-age test, terrain/Boss ordering and friendly no-damage return remain the owners; no radius, timing, damage, ink, velocity or packet values are changed.

Primary reference inspected: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json . CollisionParam has FriendThroughFrameForPlayer=0, Player radius0.225, Field radius0.2. This connects an existing extracted field; it makes no new unit-conversion or physical-device claim.

Ownership audit: Issue929 had no comment/assignee; direct PR929 search returned0. Relevant PR765/792/822 document other-family windows and explicitly leave Heavy unchanged. Current c633 retains that exclusion. Claim: https://github.com/rhgrive3/actions/issues/929#issuecomment-6027718558 . Candidates933 and931 were excluded because current finite-flight is already pos-only and current Splatling emits lastFire=0 for each actual round.

Before: four of the initial six Heavy tests failed, including same-sweep and muzzle-adjacent friendly obstruction; an enemy behind an ally took damage. After: final seven Heavy cases pass, including no hit-event/splat credit, owner exclusion, enemy-first order, first-tick ghost retirement, terrain-before-ally/grate traversal and30/60/120Hz fixed-clock equivalence. Existing Shooter and Slosher neighbors20 cases also pass; Slosher2F and unrelated Blaster/Dualies policies remain unchanged. The old generic test asserting Heavy transparency is replaced by this dedicated sourced behavior, not silently deleted.

Evidence is source/VM native collision execution. Ghost test covers the local visual simulation flag, not a new online transport test. No new build, browser run or main merge was performed. Whole-candidate emitted/browser acceptance belongs to the later integration batch.
