# Triple Splashdown: primary source + international mechanics correction (#912, 2026-10-16)

## References
- Primary frozen numerical source: Ver.11.3.0 `WeaponSpPogo.game__GameParameterTable.json` from Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, available in the user Drive part-02 bundle. `BulletParam.MoveFrame=15`, `MoveDistance=6.54`, `spl__WeaponSpPogoParam.Rise_Frame=60`, `Rise_NoDamageStartFrame=50`.
- International mechanics: [Inkipedia, Triple Splashdown](https://splatoonwiki.org/wiki/Triple_Splashdown): the two fists **move outward for 0.25 s before rising**, not after the player's own landing; player and fists rise independently for about 1s before descending; fists scale short slopes/walls and can be stopped by tall walls.
- Independent community flat-ground frames: [Japanese technical Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ) says owner 70F and fists 87F on a standard no-jump launch. This does not automatically hold when the actor or fists start at atypical elevations.

## What was wrong in previous PR
The pre-existing main applied 15F as a post-landing timer and fired fists at 85F after a 70F human landing. The **first draft of this PR** instead added a 2F post-landing gap and placed fists at 87F flat, but it still incorrectly waited for the **human body ground callback**. It also failed the real two-peer paint-replication test because that fixture still waited 15F only.

## Updated implementation
Current implementation creates the fist state at **special activation**, independently of owner land/death, and advances it with the same fixed 60Hz time base. The fixed flat-ground impact is a **research-calibrated 87F clock**. The 15F pre-ascent travel remains a separate sourced constant (`FIST_TRAVEL`). For an ordinary owner who lands around 70F, fists impact at 87F, **without using the owner's _slamImpact to start the timer**. The owner may fall from higher up and land later; the fists will not wait for the owner. Killed owners' summoned fists continue. Super Jump never creates the extra fists.

Critical limits: this does *not* implement the fists' true 15F travel motion in the renderer, their 60F rising poses, height-adaptive fall over slopes, wall-height traversal threshold, or independently networked fist FX. The source 15F / 60F do not establish the exact 12F of inferred flat descent between 75F and 87F or all Nintendo fixed-tick order. The existing LOS/wall selection and stamped radius10 approximation are unchanged. No claim of perfect retail parity without observed/decoded fist trajectory data.

## Acceptance tests / immutable gameplay scope
`patches/splatoon3/tests/issue-912-triple-slam-fists.test.mjs` covers: activation-clock 86F no hit / 87F hit, 120Hz equivalent, player landing at70F, no-landing and late-landing independent fists, owner death before and after body landing, Super Jump and remote exclusion, blast overlap, LOS, turf and reset. `patches/network-replication/tests/issue-912-fist-paint-replication.test.mjs` replays the true 87F sender stamps through NetMatch and compares the full receiver CPU turf grid, ownership and scoreboard. Both run through the existing compiled code.

This PR is **Refs #912/#966** and leaves them OPEN if terrain/wall/VFX/online fidelity remains unverified. No HP/damage, paint, shape, special gauge, weapon value or network packet encoding is changed.
