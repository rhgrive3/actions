# Kid landing comparison, 2026-10-03

Scope: ordinary normal/hard kid `_poseLand` compression, knee/ankle recovery, grounded transition and aimed landing. Takeoff, spawn, Super Jump, actor collision, hard-landing speed penalties and other motion layers are outside this patch. Public native source is `inkwave-public/src/game/character.js`, foundation `5cdc815c923e2e6e0a9860bcfec6a4734a089657`; `game/` is not the implementation under test.

## Fresh Nintendo primary evidence

Nintendo's [Splatoon Base weapon page](https://www.nintendo.com/jp/character/splatoon/fashion/index.html), retrieved again on 2026-10-03, identifies shooter demonstration 1 as media `y7Zl26Zl12n`. The retained, hash-verified prior [official embed](https://media-assets.apps-jp.nintendo.com/contents/embed/y7Zl26Zl12n?controls=false&muted=true&playsinline=true&loop=true) resolves to the [official shooter master](https://media-assets.apps-jp.nintendo.com/media/splatoonbase/0000855_a2868da3ca53c4932216c02d46ac688a.m3u8). A fresh embed request returned HTTP 403; no bypass was attempted. The public master, variant and both 1080p segments were fetched again and concatenated. The resulting SHA-256 is `6fd20313b229072b55aca46805afc943cc22c3358620b37ed7dceee674ee76b7`, matching the verified prior bytes. The receipt distinguishes fresh retrievals from verified earlier embed bytes and retains the page → media ID → embed → master → variant → segment chain, byte counts, hashes and UTC retrieval times.

Target configuration is Splatoon 3 **11.3.0**; its [official update page](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) was freshly read and retained. The video does not disclose its game version, gear AP, controller inputs or slow/edited playback history. It therefore supports visible pose ordering, not measured 11.3.0 joint curves or frame values. Visually this is a Splattershot-like shooter, kid form, own yellow ink on a platform, repeated ordinary jumping while firing. No spawn/Super Jump footage is used as ordinary landing proof.

Zero-based decoded frames **224–232** show descent toward the platform with the gun raised; **236–248** show shoe contact and bent knees while the gun stays presented; **252–268** retain the low aimed stance and a visible shot stream. Relative playback is approximately **3.733–4.467 s**. Exact source PTS for every selected frame is in `primary-frame-observations.json`. Contact and recovery sheets were visually inspected. The character's stance remains low while firing, so these frames do not establish an idle neutral recovery duration or the absence of hand contact on every other fall.

All source receipts and original/calibration evidence are under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-landing/`. Source footage, native-source rig measurements and CPU geometry projections are separate evidence classes; GPU/browser and Switch controller comparisons remain parent/integration work.

## Divergence and correction

Native `trigger('land', speed)` derives `landAmp` and kicks the existing pelvis/squash/head/weapon/hair springs. Native `_buildPose` calls `_poseLand` for grounded kids with amplitude above `.3`, except recent spawn. Native `_poseLand` then adds a chest/spine/hip fold independent of aiming, flings the free arm outward, and introduces a hand-to-deck target on large drops. It can also be layered over sub aiming and transient weapon/action poses. Its knee channels are solver pole directions, not authored knee angles.

`runtime/landing-motion.mjs` replaces this one landing layer. It lowers the pelvis over the native shoe contacts and provides mild knee-pole steering; the native two-bone leg IK supplies the actual knee and ankle bend. A smooth absorb and release returns control to the native grounded stance/walk layer. The chest fold is reduced as aim weight rises, and landing does not write arm, hand, grip, weapon-anchor, head, face or squash channels. Native weapon recoil and impact springs still run. No hard-fall hand gesture is synthesized from unsupported footage.

The hard-impact extension is **engine visual calibration**, extrapolating the observed absorb vocabulary. There is no primary hard ordinary fall with known input/weapon/gear in this receipt, so it is not asserted as original hard-landing parity. All newly authored time/depth/angle values are explicitly `LANDING_MOTION_CALIBRATION`; none is an unpublished Nintendo joint or speed measurement.

| Condition / reproduction | Native difference / play impact | Patch behavior / implementation | Verification status |
| --- | --- | --- | --- |
| Kid ordinary land at speed 8.5, stand / hold fire | Landing fold is layered after weapon hold; aiming does not reduce torso contribution | `_poseLand` gives impact-weighted pelvis absorb and aim-weighted torso flex; native foot/leg solver remains authoritative | Native-source bones, ankle contact, IK and actual indexed geometry tested; official film supports aimed absorb order, exact curves unknown |
| Kid large ordinary drop at speed 15.5 | Long squat/chest fold plus free-hand deck target; changes hand-action channels | Same smooth absorb with greater calibrated depth/time; no additional hand deck pose | Native-source before/after and recovery tested; original hard-fall gesture/time unknown |
| Land while shooter / dualies / charger / splatling aims | Generic landing arm layer shares channels with weapon hold | Arm/weapon channels are untouched; real native grips/IK continue | Native production composition tested; original weapon-specific landing curves unknown |
| Land then aim sub / throw / flick / slosh / dodge / leap / slam / spawn / jump | Generic land can remain active beneath a new action | Landing cancels locally; native action, event, timers and poses are delegated without changes | Native-source interruptions tested; no new original action priority claimed |
| Reset / splat / form change / weapon swap / special / Super Jump takeover | Old native `T_LAND` may still be inside its visual window | Local landing participation cancels and requires a fresh landing; `T_LAND`, springs and gameplay state remain untouched | Production Actor/Character lifecycle tested |
| Hidden character and resume | Native skips pose but advances state/timers | State hook clears diagnostics each update; expired landing does not replay | Native hidden path tested |
| Grounded return and ordinary walk | Native feet and reach solver carry world contact | Patch never writes foot targets, foot clocks, root/world position or actor movement | Foot contact and native IK tested; original slope/step/footfall transition timing unmeasured |

## Integration and verification

Export: `installLandingMotion(api, profile)`. Install after the existing motion installers; API already supplies `Character`, optional `Actor`, `CHARACTER_CHANNELS`, and `CHARACTER_TIMERS`. No adapter/channel export changes or profile edits are needed. Both Character and Actor prototypes use `Symbol.for` guards, including duplicate installation from another module realm. `landingMotionSnapshot(ch)` is nullable before state creation and after disposal; it reports only the landing contribution. `s3LandingMotionEnabled = false` is a per-character comparison opt-out, delegating the captured native landing implementation.

The focused test loads the real production `install.mjs` once in one VM realm, then installs the additive module. It measures before/after pose arrays, bone world transforms, native limb errors, weapon world transform/grips and visible indexed vertices using THREE's real native skinning. Complete trace captures also retain native rigid weapon triangles in their actual world transforms. Isolated pose fixtures stub world/projectile collision. A separate actual native `Physics` floor case exercises `collideBody`, `groundProbe`, Actor fall/contact/`_onLand`, and recovery, comparing enabled/disabled gameplay trajectories exactly. Paint and projectile services remain fixture stubs. Generated CPU projections use actual posed triangle vertices, not proxy boxes or a substitute rig; shader surface detail and GPU/browser comparison remain unverified.

One engine calibration example: at `.05 s` after native `land(15.5)` with aiming active, the left/right native knee flex changes from approximately `2.032/2.070 rad` to `1.897/1.938 rad`; at `.40 s`, it changes from `1.422/1.452 rad` to `0.974/1.014 rad`, with the new landing contribution finished. Native leg IK errors are zero for these captured samples. These are INKWAVE bone measurements, not values measured from Splatoon 3. The original rig remains bent during its longer generic landing layer; the patch returns to the native aimed stance sooner as a stated visual calibration.

Run `node --experimental-vm-modules --test patches/splatoon3/tests/landing-motion.test.mjs`. Rendering at 30/60/120 Hz through the existing 60 Hz gameplay clock is compared at every tick. Zero-dt/pause, nullable preview, duplicate install, reset/death/form/sub/weapon/action interruption and disposal are covered. Direct variable-dt original joint-curve equivalence is not claimed. Broad gates, browser capture, build artifacts and exact-SHA CI belong to the parent. The parent must update `reports/inkwave-splatoon3-behavior-2026-10-02.md` when installing this lane; that shared file is outside this lane's allowlist.

## Remaining original measurements

Capture known 11.3.0 input/gear/weapon conditions with synchronized front and side views: normal and high falls, stationary and running land, aimed/charged land, slopes/steps and rapid form/action transitions. Measure contact, minimum pelvis height, knee/ankle landmarks, weapon direction and return to normal stance after accounting for camera and playback. Unknown exact timing, angles, joint trajectories, hard-fall hand-contact behavior and original action overlap remain unknown. The patch is a separate usable calibration improvement; it does not close those parity questions.


## Independent complete-installation review — 2026-10-03

Reviewed the frozen complete production candidate `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`. All fourteen new
motion installers are present in `runtime/install.mjs`; the tests load that
installer once in one VM realm. Repeated owned installer calls test idempotence
only. Earlier author receipts and measurements above describe their earlier
foundation composition and are historical evidence, not proof of this candidate.

Current primary pages and retained primary bytes were checked again before
correction. `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/primary-source-review.json` records
current lookup URLs and verified retained byte hashes. The freshly decoded
`official-jump-reinspect.png` and `official-landing-reinspect.png` retain the
visible aimed hop, rearward bent legs and aimed knee absorption. Their source
frames and PTS are recorded in `primary-frame-reinspection.json`. Clip build,
gear abilities and controller input remain unknown; `11.3.0` is the profile
target, not a proven clip version. No numeric motion calibration changed in
this review. No original hardware, GPU shader/render, browser build or
exact-SHA Actions result is claimed by these focused CPU checks.

Current results, exact source/test hashes, commands and outstanding shared
work are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/done.json`, `findings.json` and
`integration-handoff.json`. The parent owns the aggregate behavior report,
shared-file integration, complete build and browser/Actions verification.

Brief root/ancestor hiding now cancels landing before it can replay on return.
The earlier hidden test waited out the whole landing window and missed that
bug. Cancellation also observes the actual `special_leap`, `special_slam` and
`movement_cancel` event names. Fresh landing after a cancelled mapped special
uses the shared public lifetime hook instead of its orphaned leap/slam timers.

Native ordinary floor contact, actual indexed geometry and IK remain tested.
After a mapped special ends, native `_updateFeet` and Walk still use their old
timer conjunctions in this candidate. The owned landing absorb can resume,
but the parent must wire `specialMotionAllowsFootPlant` at those two sites and
verify actual heel/toe contact before declaring post-special contact fixed.
This limitation is explicitly recorded in the shared handoff.
