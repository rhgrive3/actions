# Deployed Splash Wall plane alignment

Base mainaca88a4899e1f497f9aa3d6514ae3934979eed75. This candidate changes the deployed Splash Wall display rotation only.

## Reproduction

Real Actor throw → native Physics ground contact → deployed object, followed by one second of actual Projectiles updates: collision yaw stayed0 while rendered group yaw became2.4rad. The group inherited generic decorative `object.age*2` rotation even though its barrier geometry uses fixed `object.yaw`. The deployed rectangular mesh therefore visibly departed from the actual bullet-blocking plane.

The fix retains the object's authoritative yaw for Splash Wall. Other existing sub decorative rotations, flight/roll behavior, collision shape and damage remain unchanged. JSON spawn/deploy replay uses the same deployed yaw.

## Verification

Source10/10: actual ground deployment, yaw0/60degrees, owner/ghost,30/120Hz, rendered world normal equal to collision normal at every frame, central barrier ray hits and outside-width ray misses. Two additional JSON spawn/deploy replay cases keep the ghost's authoritative angle. An exact browser-block fixture also passes with actual Level/Physics, native throw and two angles. Current-main full source4907 total/4888 pass/19 optional skips/0 fail; network448/448; actual production-built28/28 including existing subs and browser fixtures. Build contentHash69b90826e86d704291e93218ecfa907b30164dc546b841ee0f9163f0ca865531. Hosted browser and exact-head CI remain pending.

These tests prove transform and barrier-plane agreement; they are not pixel comparisons or retail model-quality validation. The wall's dimensions and material remain existing calibrations.

## Separate unresolved mechanics

The same baseline inspection found no contact damage or natural HP decay, and a7second calibrated expiry. Primary11.3.0 WeaponShield exposes DamageSpanFrame30, SHA256ac757c5d3a6a29d45031d68527e3e9e7a6f4a5b7ac72cf7189250532db8c9648; it does not directly provide the contact30HP value in that row. The measured community page describes30contact damage every0.5seconds and natural HP decay. Those mechanics and knockback are not introduced by this visual-alignment patch.

https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShield.game__GameParameterTable.json
https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプラッシュシールド
