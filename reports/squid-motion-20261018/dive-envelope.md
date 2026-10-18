# Human → squid visual curve

Baseline: fbaf105eb310daf10ef7bd72675805ccf3f5a8bc. User explicitly requested the incoming curve on 2026-10-18.

## Measured existing behavior

Actual loaded ToSquid has 10 human frames; Sqd_ToSquid has 13 squid frames. Source exchange duration is 10/60 seconds. It already used cubic smoothstep and human pose crossfade. Retain this duration and both authored clip rates. Replace the visibility curve with quintic smoothstep for zero first/second endpoint derivatives.

Fallback previously kept the human fully sized until 70 ms, removed it over 30 ms, and separately grew the squid during 45–80 ms. Replace these staggered scalar windows with complementary quintic exchange across the same existing 100 ms completion time. Existing squash/lift/secondary motion remains intact.

Official Nintendo ikahito_pc.mp4, https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 , reviewed at 30 fps around 8.33–8.47 seconds: the visible standing-to-ink collapse is short and continuous, approximately 130–170 ms with uncertain exact input onset. This supports retaining the authored source duration, not imposing equal timing in both directions. Ink effects obscure precise silhouette landmarks; no exact original-game reproduction claim.

The prior outgoing 150 ms envelope, source pose/pivot reversal capture, human ToHuman admission and anti-bowing remain unchanged. No gameplay, collision, aim, human geometry or hair code changed. No new per-frame objects.

## Verification

Actual composed Actor source/fallback tests at 30/60/120 Hz cover complementary monotonic scales, retained authored duration/frame rate, both-direction zero-time reversal/double reversal and source rendered squid vertex continuity. The previous outgoing tests remain enabled. Native 10-second timeline preserves the earlier eight seconds exactly and adds complete diving plus rapid reversal. Uniform 30 fps samples are offline trajectory evidence, not achieved runtime FPS.

## Final-pose continuity defect and correction

A stricter zero-time boundary test reproduced a roughly 5 cm pelvis shift and large arm matrix changes when ToSquid relinquished planted-foot/balance and arm-retarget ownership. Source-pose crossfade alone did not preserve the final rendered host pose. The candidate retains a preallocated snapshot of final local bone transforms and blends from it during the existing dive envelope; interrupted reversals also start from the displayed pose. Ordinary uninterrupted squid-to-human behavior remains unchanged. Final matrices are checked at initial dive and both zero-time reversal boundaries, rather than testing scale alone. No bones, geometry, materials or draw calls are added; snapshot vectors/quaternions are allocated once with source-bank initialization.

Current-main integration retains upstream lazy rendered-pose copying. The transition captures actual displayed bones at a form change and applies its blend immediately after final accessory ownership through a dedicated method. It does not replace upstream applyAccessories or reintroduce permanent per-frame pose copying. Older composition compatibility synchronizes cached rendered poses only during this short transition.
