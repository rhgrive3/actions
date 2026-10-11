# Weapon-class follow-up: charge funding and action recovery

Baseline: `6f5b2850bd18e2d0b2ff1639e0637deaf9f35e1d`, after the first weapon-class patch. Three root causes / four reachable input cases, not five invented discrepancies. Changes are for the separate integration branch; no original PR1202 branch/main changes.

## Corrected behavior

1. **Charger: insufficient ink while airborne (#1038).** At 2.25–17.99 tank units, the previous grounded-only wrapper left the first 8 charge frames airborne at normal speed. Four active updates produced 4 charge frames airborne versus 1.333 grounded. The bootstrap installer now selects the full-shot funding threshold inside the common charge owner. Funding includes already-paid ink. The owner combines rates with `min`, never 1/3 × 1/3, and updates charge/payment/completion clocks together. Startup and held time retain real-time units. The installer still controls this feature, preserving constrained bootstrap compatibility.
2. **Heavy Splatling: charge → squid interruption (#679).** Refill previously began at the 6F form boundary. An edge-owned pending event now starts the independent 29F refill stop in the resource phase. Busy polling cannot rearm it; reset clears the pending event. The existing 6F form transition is unchanged.
3. **Heavy Splatling: charge → sub interruption (#1021).** The same missing refill stop existed through the separate R path. That post-resource path arms 29F directly. Sub preparation still starts after the established 5F interruption. An existing longer recovery stop is retained. Fired-stream recovery remains separate.
4. **Slosher: sub versus squid admission (#926).** Sub preparation was incorrectly delayed to 16F together with squid form. Its profile delay is now 15F and the inner input gate admits the final frame of the independent 16F squid lock. Full installed Actor/runner/sub-ready tests observe readiness age zero at shot+15F, not immediate throwing; the older constrained buffered-sub test is updated separately.

## Evidence and limits

- User Drive archive [part02](https://drive.google.com/file/d/17DwQhUw8MPASjNQ3TQn3k_EIB6igrfxW/view), extracted parameter JSON under `Splatoon3-resources/splat3/data/parameter/1130/weapon/`, source snapshot Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. This is extracted parameter data, not recovered C++ consumers.
- `WeaponChargerNormal`: `InkConsumeMinCharge=.0225`, `InkConsumeFullCharge=.18`; native tank ratios convert to 2.25 / 18 on this project's 0–100 tank. SHA-256 `dfe4637def507f933b0bbecbc805331f6357bb69ac165608a6e558406a4b72c1`. The raw endpoints do not establish the interpolation curve or the low-ink rate. This patch repairs composition of the already-adopted #1038 low-funding rule and #971 air rule; it does not claim new decompiled proof of those rules.
- `WeaponSpinnerStandard`: charge stages 48/72F, repeat 4F, fired-weapon `InkRecoverStop=40F`; SHA-256 `92647d586beee1764ca8984820fa37e0fd7887e2a756f7ca18e10e1aef97fd08`. Those fields do not supply charge-cancel 29F.
- `WeaponSlosherStrong`: windup 12F, repeat 29F, `InkRecoverStop=40F`; SHA-256 `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298`. These are unchanged.
- The [community 60fps front/back-lag measurements](https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙) explicitly label these tables **v10.0.1**. Heavy Splatling's charge-interruption row records sub 5F / squid 6F / refill 29F. Bucket Slosher's post-shot row records sub 15F / squid 16F. Their definition is elapsed frames from cancellation or shot to the destination becoming available. These are community measured targets, not claimed 11.3.0 extracted constants or a fresh Switch measurement. F→seconds is `/60`.
- Reviewed controls: Roller wide/vertical/roll recovery fields 43/58/20F and existing release-owned/refill tests; Slosher release already resets `lastFire`, so its earlier generic timer does not cause an early refill. No unsupported retuning added. Splatling stream-cancel final-shot ordering and charge-start deceleration shape remain unverified; no speculative fix.
- No archive/source dumps were added to the repository.

## Verification

- Charger focused/adjacent run: **210/210** passed, including prior completion-clock and full-hold recovery regressions.
- Follow-up focused run: **31/31** passed, including real installed sub-ready composition, ZL/R recovery and Slosher 30/60/120Hz admission.
- New tests were run against the fixed baseline as negative controls: airborne funding, ZL/R refill and all three Slosher render rates fail before the patch. The final baseline control is 9 failures / 2 passing controls; patched new regressions are 11/11. Reset/arming unit failures are structural controls, not additional gameplay discrepancies.
- Compatibility/numeric check: `node scripts/check-inkwave-patches.mjs --quick` passed after regenerating numeric-status for the single Slosher profile change (559 numeric fields).
- Broader Splatling/Slosher/Roller-neighbor run: **241/241** passed.
- Logic tests only; no new browser/Switch capture and no claim that this alone proves retail equivalence.

Ownership comments: #1038 `6098262214`, #679 `6098272641`, #926 `6098281078`, #1021 `6098324283`.
