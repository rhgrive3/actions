# Weapon issue resolution evidence, 2026-10-22

Baseline: `rhgrive3/actions@26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`. Comparison target: Splatoon 3 Ver.11.3.0, pinned Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Read all six issues and their comments through the connected GitHub tools. No issue is closed by this work.

The SHA identifies the starting HEAD. Tests ran in the shared parallel-work workspace, where other authorized agents were editing separate performance/network paths; they are local working-tree receipts, not a pristine-main CI result.

## Added acceptance for #1812

The existing down-45° emitter test covered six weapons, omitted Octobrush, and directly drove the WeaponRunner. Three tests now extend `patches/splatoon3/tests/catalog-source-launch-1130.test.mjs`, which is already included in the main-weapon numerical workflow.

- **330 conditions:** seven weapons, eleven attack modes (four Rollers in horizontal and accepted-jump vertical modes, three Brushes), five pitches (-70/-45/0/+40/+70°), stale-horizontal/close-ground reticles, and 30/60/120 Hz render schedules. Each runs the production FixedClock and actual Actor.update → WeaponRunner → Projectiles admission, with 120 fixed simulation ticks. Both Brush hands are admitted through real release/repress input.
- Check complete source volley counts, every unit/pellet velocity against the pinned source fields, zero-delay true birth, unchanged five-slot network identity, and identical birth times/positions/velocities across reticle and render schedules.
- **22 near-wall conditions:** actual Physics and a solid OBB at -45/+40° check actor-side, finite projectile births while retaining camera pitch and source velocities.
- **Two negative controls:** test-only restoration of the former Roller/Brush reticle-convergence path must fail the unchanged velocity assertions, including Octobrush.

No runtime defect was reproduced; no gameplay/runtime/source-data changes were needed. This is meaningful additional regression coverage, not completion of #1812.

## Verification

Node **24.19.0**, serial test execution, **384 MiB heap per child**, owned invocation with **90-second timeout**.

| Phase | Result | Duration |
|---|---|---|
| Baseline damage-source + source-launch + #1431 pose-birth | 13/13 pass | 52.51 s |
| Initial added test run | 8 pass / 1 fail | 4.46 s |
| Final source-launch suite, including the three new tests | **9/9 pass** | **5.38 s** |
| `git diff --check` | pass | — |

The initial added-test failure was an incorrect expectation: the muzzle safety margin is 0.02 along an oblique anchor ray, not 0.02 projected onto Z. The corrected assertion requires births to remain outside the actual OBB actor-facing surface. It did not require a runtime change. The baseline #1431 test emitted an optional source-motion dynamic-import callback warning; those passes do not establish loaded reference animation/native image equivalence.

Test-file SHA-256: `77fe7111525324b9bc50e04baa0d8c06b9c3031c674a88762cc7c378035484ed`. Exact commands, counts, and limits are in [weapons.json](weapons.json).

## Individual issues

| Issue | Existing implementation and evidence | Still needed |
|---|---|---|
| [#1814](https://github.com/rhgrive3/actions/issues/1814) | #1818/#1819/#1822/#1825 already merged; 8 of 10 source-omission tickets closed. Latest comment explicitly retains the tracker and asks to avoid duplicate broad PR/CI. | Current-main CI and the #1812/#1813 engine/hardware checks. |
| [#1812](https://github.com/rhgrive3/actions/issues/1812) | #1819 already connects admitted camera aimDir. Added the acceptance matrix above; no new launcher regression found. | Rendered stage camera/muzzle/aimReady comparisons and retail comparison. |
| [#1813](https://github.com/rhgrive3/actions/issues/1813) | #1818 already treats Dynamo UnitDamageRate=0 as zero hit authority. Existing damage tests pass. | Independent Nintendo semantics and isolated unit1 retail hit comparison. |
| [#1431](https://github.com/rhgrive3/actions/issues/1431) | Current main already has display-only `catalog-pose-birth.mjs`; its four logic tests pass. Existing comparison record begins at `reports/inkwave-splatoon3-behavior-2026-10-02.md:5542`. | Native images, completed #1277 aperture/socket calibration, and physical first/steady/left-hand aim-origin assessment. |
| [#1789](https://github.com/rhgrive3/actions/issues/1789) | #1772/#1785 already fix separate source-informed bubble momentum/sweep behavior. | Original 11.3.0 slope/floor rebound formula, speed-cap dispatch and sparse defaults; controlled four-bubble capture. |
| [#1823](https://github.com/rhgrive3/actions/issues/1823) | Draft #1821 and stacked #1827 correct separate onset/charge-keep click routing. | Distinct persistent/rising charging audio source, proven S3 event/parameter graph, objective comparison and device/local/remote playback checks. |

## Evidence limits

The source fixture intentionally stubs Character pose and movement integration. The matrix checks real input/weapon admission and actual Physics OBB muzzle constraints, with deterministic midpoint RNG. It does not establish statistical spread, a whole ballistic trajectory, rendered sockets or aimReady, a native stage, browser/GPU behavior, iPad Safari performance, Nintendo hardware parity, or the native Splat Roller comparison. None of those missing measurements is treated as complete.
