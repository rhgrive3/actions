# Native Sprinkler Sub Power connection (11.3.0)

## Confirmed gap
The native kit retained PeriodFirst=480 and PeriodSecond=900 at all AP. Actual standard-kit Actors reproduce unchanged periods at AP10/57 before this candidate. The generic throw resolver multiplies by Sub Power, but the installed registry already inherits constant Sprinkler throw tiers from the catalogue. An independent baseline measurement found modifier1 and actual throw velocity67.2 at AP0/10/57. There is no confirmed standard-kit throw-distance defect; the candidate explicitly preserves that existing constraint while connecting the missing period curves.

## Primary evidence
https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSprinkler.game__GameParameterTable.json

Exact raw file: patches/splatoon3/reference/sprinkler-1130.json, SHA-256 d3b945ddf9691b93cfc5c236d456462637fa36ba5eab3b1761e995e8f74e49f8. Low/mid/high PeriodFirst is 480/630/780; PeriodSecond is 900/960/1020; SpawnSpeedZSpecUp is 1.12/1.12/1.12. Existing gearCurve converts AP; fractional thresholds remain fractional so the 60 Hz simulation reaches the next frame naturally.

Independent community testing also describes duration extension without throw-distance growth: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプリンクラー#abilitypower . It reports AP10's first threshold as 571 frames; the source curve gives 570.9 frames, reached at frame 571. This is supporting documentation, not a new retail capture.

## Changes
Resolve the two source curves once at native throw admission into a separate device spec. Freeze the source throw speed. Keep ink-saving computation, native owner/ghost authority, droplets, paint shape, damage, deployment delay, and AP0 phase interpretation unchanged. The explicit native constant throw tiers make this already-correct installed constraint self-contained; they are not reported as a newly corrected standard-kit speed.

## Verification and limits
Actual Actor/AP0/10/57 admission, two owners in the same frame, equipment changes after birth, source hashes, and 30/60/120 Hz native phase/paint counts are tested. Broader source/built/network and real-browser gates are pending. Native deployment delay and droplets remain existing calibration; the meaning of phase durations is preserved from the current native implementation, not inferred anew from the retired catalogue path. No claim of complete retail Sprinkler fidelity is made.

## Completed local gates and remaining boundary uncertainty
Frozen 1f1e9d0 on main d1ad48 completed full source: 4,820 tests, 4,801 pass, 19 optional skips, zero failures (1,778.9 seconds). Full network:448/448. Related source and production-built tests:62/62 each, plus the exact browser-probe extraction1/1 in both modes. The new main675731 direct-resistance change is being composed and rechecked separately before publication.

The AP10 second-period source curve is936.36F, reached on simulation frame937; the community table lists936F. AP30 first-period values also require retail confirmation. Integerization and the precise community-table calculation are not established here, so this candidate retains the existing continuous gearCurve and native phase interpretation instead of inventing a rounding rule. AP0 and AP57 endpoint values match the pinned fields. Actual retail per-frame capture remains outstanding.

Latest-main composition: official main675731132cc419bd2026db0692f918828d60393f (adopted direct-sub resistance) was merged separately. Production-built combined regressions93/93 passed, preserving direct damage/browser checks, native device damage, source periods, per-owner isolation and powered JSON paint authority. This strengthens the local integration evidence; published exact-head CI and real-browser results remain pending.

## Adopted model/motion main integration

Old head `773a06617d320c8d2c45ff8ac945327ad5cfaf4b` completed Validate38175897338, numerical38175897383 and reopened38175897344 successfully. Chromium/WebKit each passed the three AP0/10/57 native period-connection checks; these do not resolve the noted AP10 second-phase integerization.

After new main `062c4a81f5a989406d3d65f5803ee074bd9cc0d4` (PR1246 models/motion), merged production build `5ea06d5c28bfa5167270e8b7930737ec9853ab9309c6d769223a637a042b8d5a` passed 54/54 actual-built Sprinkler/native-object/direct-resistance/model-registry checks, including all65 model geometry and real Actor/Runner/Character carry/attack. All63 changed textual main blobs were fixed-SHA fetched and verified. Local validation omits267 report-only PNG/JPG blobs; publication retains their official remote SHAs. New-head hosted CI is still required. Mark1255 remains a separate candidate.
