# Kit owner connections recovered during source acceptance

Base: PR868 ac1a87c0, exact local source /tmp/inkwave-ci-wave2. Fixed scope: the ten existing Kit test files requested for acceptance. No new Kit values, gameplay coefficients, full build or all-source run.

## Runtime connections

- Main projectile fidelity initialization previously assigned descriptor.id (undefined) over a special's wid. Actual Trizooka volleys therefore lost identity before native flight and authority helpers. Special descriptors now retain their own movement/collision/identity owner.
- Current projectile packet validation admitted only WEAPONS ids. Registered SPECIALS projectile descriptors now admit the same non-Roller unit sentinel -1; unknown ids remain rejected. The existing descriptor registry restores Ink Vac ghosts before main initialization, retaining charge-scaled radius and visual-only authority.
- Pool cleanup runs while the outgoing projectile is still identifiable, before native _new and the generic wrapper erase wid/descriptor. The existing clearer still owns fields and damage cleanup. The Boss entry applies the same existing volley authority predicate as player hits, so a visual lobe cannot write the Boss ledger.
- A defense contact must run its existing onHit callback rather than enter a terrain wall-drop. The finite Charger flight now considers the same defense candidate alongside terrain, Boss and actor entry; terrain ties win, earlier partial actor hits suppress farther defense, full beams preserve earlier actor hits, and ghosts retain their callback's visual/authority rules.
- Suction's stuck state and Curling's rolling state retain their own fuse clock. They no longer inherit Splat Bomb's requirement to rediscover floor support on every frame. The existing native countdown remains the only decrement. Unattached and generic Splat Bomb paths retain their previous contact rule.

## Fixture synchronization

Lightweight Kit fixtures explicitly install canonical projectile fidelity and sub/special fidelity. Packet/render fixtures use the production adapter chain. Tests retain existing numbers and geometry bounds, including far Roller dome HP9097, native radius growth and collision normals, forged-owner rejection, and ghost paint/damage checks. The charge preparation fixture now waits the existing SubReady minimum rather than treating a one-frame tap as an immediate throw.

Modern packet tests address Kit fields27/28 and keep the trailing simulation tick/sequence. Legacy input is an actual27-field packet rather than a truncated modern record. Remote playback fixtures bind the proxy to its sender and advance the existing remote simulation clock. Transport rejects an adopted local actor; the direct ghost-spawn test separately checks intrinsic scope. Zero-area addTurf delegation is distinguished from actual credit, and still asserts area0. Deferred lethal tests observe the existing one-frame decision.

The Bubbler recoil/refill test observes the actual tank transition rather than a special:refill event that no production module emits. The controlled straight-drop test explicitly fixes flight forces after current main initialization so it measures barrier falloff rather than gravity/terrain interception.

Twelve missing Kit metadata assertions are backed by a new exact field snapshot of Leanny/splat3 commit7280ff9cde8bb1c5dcef46c700c326471584d2e6, data/mush/1130/WeaponInfoMain.json rows73/133/219. Source was re-read; extracted values are unchanged. Kit cost is tested after actual profile-plus-Kit composition rather than expecting a redundant profile field.

## Evidence

- Fixed ten Kit files:214/214 passed, skip0.
- Adjacent Splat Bomb contact-fuse contract:11/11 passed, including old-unconditional-fuse negative, owner/ghost30/60/120Hz, ledge loss and resume.
- Earlier diagnostics captured missing wid, pool damage220 reuse, visual-lobe Boss ledger pollution, absent defense interception, and stuck-fuse freeze. They were not converted into relaxed expectations.
- No build/browser claim. The patch is a private candidate for the central integration owner; source branches and main were not changed.
