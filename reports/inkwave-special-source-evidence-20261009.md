# Special evidence follow-through (2026-10-09)

Baseline: PR #1182 remote `12be2542f4e858221267c6c4afe894da15f4db58`, local identical-tree `c275cd75f6e5fa643f30450e4019164bea5dc2d0`. Target is composed `inkwave-public/`. This lane does not change frozen upstream files, other PRs, or their issue ownership.

## #1149: one previously unused, explicit value now changes gameplay

Reference is Splatoon 3 11.3.0, Splat Charger Ink Vac against hostile Splat Dualies, clear existing intake/LOS. [Pinned WeaponSpBlower extraction](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpBlower.game__GameParameterTable.json), `GameParameters.InhaleParam.PoisonMistForPlayer.SideStepInkConsumeRate = 3.5`, explicitly supplies the dodge ink-cost multiplier. `SpecialWeapon = true` identifies the special suppression; it is not a sub-resistance reduction. The referenced public GitHub file was read directly through the GitHub connector; its blob SHA is `302a975d3593c957ac934c2dcfd69b90849677f1`.

Before: the live hostile vortex drains and slows an actor but `WeaponRunner.tryDodge` still checks and debits the ordinary equipped `rollInk` cost. A tank with less than the multiplied cost can escape through a dodge.

After: `installKitInkVac` supplies a current-contact cost query; the native composed dodge admission samples it once, then uses the same effective amount for both affordability and debit. Gear-adjusted base cost remains untouched. Overlapping cones do not multiply the factor again. Released/blocked/allied cones and remote victim replicas do not add the surcharge. No persistent poison flag or duplicated debit is introduced.

Reproduction: activate Ink Vac, place opposing Dualies at `(0,0,5)` ahead of the owner, with `ink = rollInk * 3.5 - 0.01`, and request a normal native dodge. A control that removes only the cost query accepts; the corrected path rejects with ink/roll count unchanged. Exactly `rollInk * 3.5` admits and leaves zero.

Validation: 8 new complete-bootstrap cases, including a negative control, exact/subthreshold balance, gear cost, remote cone/local victim authority, overlap, LOS/team/exit/release, and 30/60/120 Hz fixed-step scheduling. Existing Ink Vac contact/kit/network/defense tests: 69/69 pass. Quick patch compatibility, runtime syntax, and diff checks pass. The Actor/WeaponRunner/projectile/installer code is real; character, scene, surface and LOS are controlled test sinks. No renderer, live two-client transport, or Switch comparison was run here.

Remaining: ordinary drain at 12% tank/s and movement cap at 60% remain engineering calibration. The extraction omits their inherited defaults. `EffectFrame = 5` and a partial three-level table do not prove those omitted values or their engine interpretation. No values were inferred from Splatoon 1 code. Actor geometry and progressive/linger behavior remain unverified. This is a concrete partial fix, not full closure of #1149.

## #927: recovery-law uncertainty resolved by a retrieved reference

[Nintendo 6.1.0 update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/) establishes the friendly-rain acceleration. The [S3 verification Wiki's Ink Storm specification](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A2%E3%83%A1%E3%83%95%E3%83%A9%E3%82%B7#ab7922ee) explicitly specifies the relationship: humanoid recovery becomes ordinary submerged recovery; submerged recovery itself receives no additional increase; the 60F post-damage wait remains unchanged. This is now source-supported community verification, rather than an invented numeric recovery multiplier. It is not our own retail measurement.

The existing `resources.mjs::updateHealthRecovery` already implements this relationship. No rate is changed. Six new complete-bootstrap tests establish the 59F/60F boundary, humanoid-in-rain vs ordinary-swim equality, no extra swim boost, overlap, exit, expiry, hostile rain, renewed damage, and the 30/60/120 Hz schedule. All six pass. The finite 12-unit rain geometry, growth/fade and engine-to-retail distance equivalence remain independent calibration gaps; these tests do not close those.

## #469 / #647 / #869: bounded evidence, no speculative retiming

The Ink Storm verification page separately lists the base gauge lock as 480F and explicitly says Special Power duration increases also extend the recharge lock. This supports the existing lock semantics; it does not reveal the exact retail gauge animation curve. The current #469 authoritative lock and HUD projection are kept.

For #647, the pinned [WeaponSpPogo table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpPogo.game__GameParameterTable.json) exposes `SpecialTotalFrame=60` and `Rise_NoDamageStartFrame=50`, but neither proves a linear through-landing gauge curve, a 1/23 gameplay remainder, or the post-landing end boundary. Changing those from these unrelated fields would be unjustified. Existing #647/#648 action-owned gauge and pending-landing admission are retained; #1181 independently owns impact/fist corrections.

For #869, the current installed hold/explicit sub press-release workflow is already implemented and has full-composition tests. The Wiki lists 13F throw startup, but this table alone does not resolve the relationship among input press, release, animation frame zero and projectile birth. This lane does not turn that ambiguity into a new timer. Holding visuals, the exact throw origin and retail timing remain open.

The public S3 extraction does not supply the omitted poison defaults or the exact HUD/throw frame ownership. A first-generation engine is not valid evidence for the missing S3 behavior. No new gameplay constants were fabricated to declare all five issues closed.

## Emitted-build verification

Built this two-commit candidate as `f23d7365aece` using the repository build script. All 14 new tests also pass against the actual emitted/minified module tree with all production bootstrap installers. This checks build composition, not browser rendering or live transport. Public-source rechecking also found the same sparse fields in [Splatalyzer’s InkVac model](https://github.com/cengelbart39/Splatalyzer/blob/58568413df7c8bbd3b8d73d377e56ae29785ba18/Sources/Splatalyzer/Models/Game%20Parameters/Specials/InkVac.swift); it adds no drain/speed defaults.
