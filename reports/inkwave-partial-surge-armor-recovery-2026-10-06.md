# Recover the missing partial-charge Surge armor condition (#473)

Source PR751e5640caa09d84560d1fdf792a74511b806384081; current base868327651d26bfbd63d2f867e1205b14aa88e339948.

Only the original eligibility condition is missing: charge>=1 becomes charge>0 at an admitted burst. Current independent state.armor already preserves post-burst armor and current splat/reset/action owners already retire it. The source adapter's legacy armor phase and duplicate splat wrapper are therefore not reintroduced. Current .75s/30HP/100 damage-threshold values, charge-scaled motion, native landing policy and the Set-based single countdown remain unchanged. Original source comments claiming8F/100HP do not describe this later armor model and are not adopted as current facts.

Seven source boundary cases pass: old eligibility negative, partial/full charge with unchanged speed, post-burst retention/expiry, no-input/cancellation and30/60/120Hz fixed-tick scheduling. The final two fixture corrections use current HP saturation and real special/SuperJump methods; runtime remained the one condition. No full build, browser, new timing measurement or the pending #846 continuation is included. The existing state-owner semantics supersede the source's old representation; this does not claim exact reproduction of the old canceled-on-landing implementation.
