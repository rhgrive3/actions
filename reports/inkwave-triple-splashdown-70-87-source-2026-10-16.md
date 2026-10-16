# Triple Splashdown grounded fist chronology (Issue #912), 2026-10-16

## Primary data and measured community bounds
- Source revision: Splatoon 3 Ver.11.3.0 Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, Drive `Splatoon-public-sources-part-02-of-19.zip`, `WeaponSpPogo.game__GameParameterTable.json`.
- `BulletParam.MoveFrame=15` is a source **fist movement** interval. `MoveDistance=6.54`. `spl__WeaponSpPogoParam.Rise_Frame=60` and `Rise_NoDamageStartFrame=50`.
- Community PvP flat, standing activation: [Splatoon 3 Strategy & Verification Wiki Triple Splashdown](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ) reports player explosion **70F**, fist explosions **87F**. It explicitly restricts these to flat, no-jump activation.
- Historical community Salmon Run frame notes also report 70/87, but Salmon Run damage scaling is a separate rule and not transplanted to PvP.

## Existing code mismatch
The production `triple-slam-fists.mjs` delayed fists by exactly `MoveFrame=15` *from the player's landing*. At a 70F player explosion this yields **85F**, two fixed ticks earlier than the independently documented 87F fist explosions. With a dead owner before landing, the existing synthetic fallback also fired at **85F**.

## Narrow correction
Preserve the original extracted `FIST_TRAVEL=15/60` and add a separately labelled **2/60s activation / emission gap** derived from the remaining measured `87 - 70 - 15=2` fixed ticks. For a normally landed player the two fist impacts are scheduled `FIST_LANDING_DELAY=17/60` after the owner's existing actual `_slamImpact`. Pre-landing death fires surviving fists after `FIST_ORPHAN_DEADLINE=87/60`, matching community activation-to-fist time.

This is a **source + community calibrated approximation**, not proof of the private Nintendo initiation event, and does not rewrite the raw `BulletParam.MoveFrame`. No new clone/fist, extra damage/paint, RPC, collision, mortality, special points, or arm pose is introduced. The Super Jump path is still fist-free. A steep drop or unusual landing surface still uses the player's native landing plus 17F; the **absolute observed 87F is established only for ordinary flat-ground** and must not be asserted for unusual terrain, players already airborne, network desync, or Switch timing variations without captures.

## Regression controls
Updated `patches/splatoon3/tests/issue-912-triple-slam-fists.test.mjs` exercises synthetic and composed Actor/Physics/Projectiles: 16F no fists then 17F two; 30/60/120 equivalent fixed-tick timing; owner death before and after impact; remote and Super Jump remain fist-free; overlap remains 440; LOS and correct Turf/special credit preserved. The existing strict tests for #966 remain unchanged and should still establish the player's 68-72F landing tolerance. CI must pass on the exact final head before merge.

Remaining separate gaps: host->guest fist FX coordinate replication, proprietary invincibility/collision interval details, actual high terrain flight/LOS and physical Switch 11.3.0 video. **Refs #912 #966; do not close these solely on this patch.**
