# Toxic Mist movement resistance, 11.3.0

## Scope and limits

This candidate connects the victim's Sub Resistance Up coefficient to the existing calibrated Mist movement reduction, and connects grounded squid movement to the same current cloud volume as human movement. The existing base speed multiplier 0.72, lifetime 6 seconds, drain 6 units/second and world scale remain calibrations. Squid airborne momentum is deliberately unchanged: no primary evidence establishes an exact air velocity cap, so this candidate does not invent one. Human air control still uses the existing acceleration and minimum-speed policy, with the same Mist reduction applied to its target speed.

No claim of complete retail Mist fidelity is made. Retail staged slowdown/drain, ink-drain resistance, exact air physics, jump height and physical-console comparison remain unverified.

## Evidence

- Pinned Leanny commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, 11.3.0 misc/params.json, `MoveDownRt_PoisonMist` high/mid/low `[0.5,0.75,1]`.
- Existing byte fixture `gear-params-1130.json`, SHA256 `7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e`.
- https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ポイズンミスト#abilitypower labels the coefficient as movement-speed reduction ratio times the base value, reporting 100%, 84.85% and 50% at AP0/10/57. This supports scaling the reduction difference, not multiplying the remaining speed by the resistance coefficient.
- Formula: `1 - (1 - calibratedBaseScale) * gearCurve(AP, 1, .75, .5)`. At AP57 the existing .72 becomes .86, not .36.

## Reproduction and implementation

Actual admitted Actor sub throw and native Projectiles deployment on real Physics produced the baseline discrepancy: human speed 4.1472 at both AP0/57, squid speed 11.52 at both AP0/57. The candidate gives human 4.1472/4.9536 and grounded squid 8.2944/9.9072 for AP0/57 with the same base calibration.

The bounded live sub-object list is queried for current deployed hostile Mist volumes, distance/line of sight and expiry. Leaving the volume, cloud retirement, match clear or death removes the effect immediately, rather than allowing a short wire lease to keep slowing/draining outside the cloud. Overlapping clouds use the strongest single reduction, not a product. Current local equipment is consulted at movement time; existing received AP or multiplier fields are never trusted. A remote status message requires a matching deployed cloud and target life/current membership; it cannot manufacture an effect by itself.

Replayed ghost clouds are sampled by their local victim's authority. Remote Actors are not mutated. The wire format is unchanged. The helper adds a bounded allocation-free scan of the existing at-most-96 sub objects; browser CPU cost is not yet measured.

## Verification so far

- Source 13/13 and actual production-built 13/13: primary hash/curve, AP0/10/57, forms, immediate exit/re-entry, overlap, equipment changes, death/new life, friendly/remote exclusion, expiry/clear, human air and unchanged squid air at 30/60/120 Hz, existing hard-landing/enemy-ink combination, raw JSON replay and invalid leases.
- Existing all-subs 14/14 in the first combined run. The new JSON test initially used a non-integer seed .5 and correctly failed birth admission; the fixture was corrected to the valid integer seed 5. No guard was weakened.
- Source 15/15 including actual NetMatch sender/catalogue/JSON/receiver, AP0/57 local victim, raw owner multiplier ignored and ink-drain exit. Exact hosted-browser probe (six AP/form conditions) also passes in the source fixture; actual browser remains pending.
- Before the two additional native death/jump cases, main59300 full source passed 4866 total / 4847 pass / 19 optional skips / 0 fail; prior network passed 448/448. The two added cases pass in the source runtime, giving current targeted 17/17 plus the six-condition browser-block fixture. Final current-head full source passed 4868 total / 4849 pass / 19 optional skips / 0 fail; actual-built Mist/lifecycle/browser-block/acceleration regressions passed 34/34. Hosted browser remains pending. No PR has been published for this candidate.

## Adopted Fast acceleration integration

Integrated main59300d47875235f07b74684fbbc9aec9ba4b48a7 (PR1257), preserving groundAcceleration and all eight hosted acceleration probes. Actual production-built 21/21 Mist/Fast regressions passed. Manifest f4250a32919e28e192c5eb9e5f21b0a44b0ca33f9bdb2b2c5309c9c17f82be77. The new base retains the 267 official report-image blob SHAs; local tests still omit report-only images.

Native lifecycle follow-up: real splat/respawn clears outside-cloud effects, then current membership and equipment apply on re-entry. Native jump admission and landing have equal vertical trajectories inside/outside Mist. A scratch probe initially pressed jump on the reset/respawn transition tick; waiting the normal tick and re-pressing the native input admits it. No gameplay admission rule was changed.
