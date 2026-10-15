# Catalogue sub damage and Burst contact candidate

Base: mainaca88a4899e1f497f9aa3d6514ae3934979eed75. Adopted marking, models and Fast acceleration are preserved. Mist and Sprinkler cadence candidates are excluded.

## Reproduced gaps

Actual native Burst collision inflicted a direct60 plus a second35 splash on the same victim: 95HP, unchanged by 57AP Sub Resistance. The blast already had a directTarget exclusion, but the flight contact never assigned it. Separately, the composed network hit validator rejected all five authentic runtime tags: burst, fizzy, torpedo, torpedo-splash and inkMine. This prevented their raw hit claims from reaching the remote victim.

The existing high-resistance curve was connected only to legacy bomb tags. DamageRt_BombL was unused. Weapon family, rather than damage amount, selects the high/low curve. Existing lethal-hit exclusion is preserved.

## Source and limits

Pinned Leanny commit7280ff9cde8bb1c5dcef46c700c326471584d2e6, data/parameter/1130/misc/params.json. The checked-in gear fixture SHA256 is 7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e. DamageRt_BombL source high/mid/low is [.6,.75,1]; DamageRt_BombH is [.5,.75,1].

https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json
https://wikiwiki.jp/splatoon3mix/検証/ギアパワー

The measured source categorizes Burst/Fizzy/Torpedo at maximum40% reduction and Mine/other listed sub sources at50%. This patch connects those families and does not reclassify ordinary main/special hits. Burst direct60 is the existing runtime calibration; this patch does not claim that value was newly extracted. Native blast distance curves, secondary splash geometry, knockback, timing and object damage remain unchanged. Splash Wall contact damage is a separate known gap, not added here.

## Implementation

- Assign directTarget only for Burst's actual positive direct Actor contact. Exclude that Actor from the same splash while preserving other victims.
- Derive a separate victim subResistanceLow modifier from the pinned BombL curve; apply one victim-side reduction for Burst/Fizzy/Torpedo and high curve for Mine. Preserve post-armor/body routing and final decimal rounding.
- Admit only the five named authentic wire causes with descriptor-derived individual ceilings60/50/60/12/45. Preserve sender/owner/life/sequence and duplicate admission. Raw damage stays on the wire; victim equipment applies once.
- These are bounded client-authority claims, not server-verified collision proofs. An authenticated malicious attacker can still lie within an allowed cause/ceiling; no stronger security claim is made.
- Existing extraction fixtures receive the actual generated ceiling constant, rather than weakening any payload assertion.

## Verification

Source new regressions45/45: curve hash and classification, AP0/10/57 actual Actors, native Burst direct and collateral at30/60/120Hz, actual Fizzy/Torpedo/Mine blast paths atAP0/57, raw JSON five-cause admission/caps/ACK/duplicate/sender, native Burst→real NetMatch→JSON, ghost no damage, Booyah/Crab armor remainder and Splash Wall Object Shredder.

The first collateral fixture double-added the bystander (make already registers Actors); removing that duplicate fixed the test without changing runtime. The first Crab fixture attacked its existing rear-core bypass; setting its actual yaw to face the attacker verified raw armor10 and body spillover30 (existing Crab .25 multiplier gives7.5). Crab's runtime was not modified.

Existing payload/extracted-hit/bomb-band regression46/46 passed. Exact hosted-browser probe eight conditions passes locally in the source fixture; actual browser remains pending. New-main actual-built135/135 passed, including adopted mark, direct sub and legacy bomb-band regressions. Full source4941 total/4922 pass/19 optional skips/0 fail. Build manifest d1d162a770f5865d3060d0bc961330567a829bfb979f75833c7cb8e7f7ced57d. Both earlier-base and current-main network448/448 passed. No PR published yet.

No performance improvement is claimed. The added work is constant-time cause membership and a descriptor-derived lookup per hit; no broad per-frame scan is introduced.
