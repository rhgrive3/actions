# Splat Bomb contact-owned fuse (#723)

Baseline: main `671e3dedcf7993d75460ac2fbb2687217195bda3`.
Claim: https://github.com/rhgrive3/actions/issues/723#issuecomment-6006726705

## Evidence and bounded scope

The [Splat Bomb verification page](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプラッシュボム), read 2026-10-06, explicitly describes interruption of the fuse after rolling off a ledge and resumption on renewed contact. Its specification table labels the fuse as60F of contact time. This is community verification evidence, not a new physical-device measurement or direct extraction of contact logic from Nintendo code. The existing profile already supplies1second; it is not retuned here.

The current installed native path reproduced the defect with fuse0.4, no world contacts and30 fixed ticks: the bomb exploded once in midair. The negative control in the regression executes the same composed method with only the new contact gate removed and reproduces that explosion with actual empty-space Physics.

Only the Splat Bomb countdown connection changes. On a world collision the bomb remembers its contact normal. Between center-line sweeps, a ray along that normal checks the same0.21 offset that the native collision resolver places between bomb center and surface. This retains resting contact without counting the empty interval after leaving a ledge. The extra1e-8 is floating-point endpoint tolerance, not a sourced gameplay distance. The remembered normal belongs only to the transient bomb object, contains no Actor reference and disappears with its existing release lifecycle.

Fuse and beep interval progress only during world contact; renewed contact resumes the remaining value. Initial floor/wall arming, contact response, gravity, throw velocity, damage, ink cost and water removal retain their existing owners. Body/spin travel still advances while the fuse is paused. Storm canister behavior and special-object immediate detonation semantics are not redefined. This does not introduce a general rigid-body contact solver or recalibrate bomb geometry.

## Verification

-11 focused source cases plus15 adjacent Sub/Special and owner-clock cases:26/26.
- Actual emitted native/runtime modules:11/11. The explicit negative control intentionally uses composed source with the new gate removed.
- Real Physics floor and ledge; floor consumes exactly60 supported fixed ticks; owner and ghost30/60/120Hz render schedules preserve remaining fuse across30 airborne ticks.
- First floor/wall contact arms once; renewed contact does not reset the remaining fuse; water release remains single and nonexplosive.
- Ghost catch-up at recipient dt1/30,1/60,1/120 spends only owner simulation contact ticks. Repeated frozen peer updates advance neither position nor age/fuse. No new packet fields or authority changes.
- Build `181dc8e2cc6b806bb4f91c14b288a5180571e7dbfe5ecfd9df4f38455b49e372`.

Full CI/browser acceptance is pending publication. Controlled Node geometry and peer clocks do not establish real-device or original-game exact-pixel equivalence. Existing physics collision tolerances and world geometry remain assumptions of this bounded correction.
