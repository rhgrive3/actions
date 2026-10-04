# Heavy Splatling: player collider and charge walking (#403 / #470)

## Scope and evidence

Public target: `inkwave-public/` through the active build adapters. No native-source or upstream-lock change. Reference: Splatoon 3 Ver.11.3.0; pinned Leanny extraction `7280ff9cde8bb1c5dcef46c700c326471584d2e6`.

- [Heavy Splatling parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json): `CollisionParam.InitRadiusForPlayer = EndRadiusForPlayer = .225`; `WeaponParam.MoveSpeed_Charge = .062`, firing `.07`, charge stages48/72F.
- [Splattershot parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json): player radius `.285`.
- Complete primary bytes and the new source bindings verified using the repository verifier:11 files,128 extracted fields,14 unknown entries retained.

## Behavioral comparison

#403: before, Shooter and Heavy Splatling both used visual `p.size=.15` for player collision. Candidate preserves Shooter's existing `.15` world-unit collider as a common local scale anchor, and gives Heavy Splatling `.15 × .225/.285 = .11842105263157895`. Their ratio is the sourced `.7894736842105263`. Both are snapshotted on real `_push`; later visual resizing, gear/weapon change, or charge state cannot mutate flight collision. Pool reuse clears the snapshot. Ghost reconstruction does not gain a new authoritative collider. Blaster, Dualies, Slosher and Roller fallback behavior is untouched.

This is deliberately a **relative** correction. The new profile calibration anchor is labelled as calibration in numeric-status. It is not a newly asserted global S3-to-world distance scale. #463 Blaster absolute-radius work was released before implementation; it is not covered by this change. Field sweeps, visual blob size, paint size, gravity, flight and damage are unchanged.

#470: before, active Heavy Splatling charging selected `lerp(runSpeed*.75, moveSpeedCharging, min(1,charge*2.5))`, starting near4.32 and reaching3.72 only near29F. Candidate selects the already sourced3.72 world/s target for every active charge percentage. Stream target remains4.2; existing gear/Flow modifiers apply once afterward. Existing `lockT` priority remains. Actor acceleration is unchanged; this does not snap physical velocity or change first-input admission order.

## Reproduction and checks

- Fixed mid-body segment/capsule grazing line: the interval between `.38*.95+.118421...` and `.38*.95+.15` hits Shooter and misses Heavy Splatling. Actual native `Projectiles._step` and `Physics.segmentCapsuleDist` are used.
- Charge samples1/12/24/48/60/72F use3.72 once charging is active. Actual48/72F stages, prepaid ink,4F stream spacing, Run Speed Up/Flow and30/60/120 render cadences are checked.
- Focused native source tests:10/10 pass.
- Actual public esbuild output loaded as modules:10/10 pass. This is minified-code behavior, not a browser/GPU or Switch certification.
- Negative baseline:8/10 assertions fail against unchanged main code, including both actual faulty behaviors. The two generic schedule/profile checks continue to pass as expected.
- Source compatibility, numeric status/bindings, and `git diff --check` pass.
- Existing local quality tests8/8 and workflow/motion-verifier gates10/10 pass.
- Public build succeeds. Aggregate serial patch/reliability suite and remote CI are recorded separately; no pending run is represented as passed.

## Composition requirements

Reviewed actual PR64 head `33db80691e65ea5e620cfff4abaa17be9eefc7ae`. Its collision chronology/growing-Roller logic must remain authoritative. A disposable actual-code composition passes all10 focused checks after two explicit adapter/interface resolutions:

1. PR64's source radius hook consumes the candidate's `playerCollisionRadius(p)` expression instead of seeking the old `p.size` anchor.
2. `fidelityPlayerCollisionRadius()` retains growing-Roller priority and falls back to `p.s3PlayerRadius ?? p.size`, rather than dropping the snapshot in the early broad phase.

PR318 already uses `p.s3PlayerRadius` for Dualies. Preserve that mode-specific producer; this candidate assigns only Shooter/Splatling. The two adapters should converge on one player-radius expression, not stack duplicate source replacements. This report does not claim that independent branches merge automatically or that the complete future integration has passed browser acceptance.

No merge/deployment or settings change is included. Switch absolute geometry, real-device input/rendering, and unrelated charge admission/airborne behavior remain separate.
