# Current open issue ledger — 2026-10-29 13:58 UTC

26 open issues, excluding #401. Original human issue bodies govern acceptance. Physical-device validation is waived; unknown source semantics are not assumed. This is a historical snapshot, not a closure or a main merge.

Previously reviewed published heads: #1908 `88f8d25d13a309ee47c59831116b1742740df517`, #1910 `f9a0ed1986320dd4b95c6e422fab9ebc92b91eb5`, #1909 `1035835081fdaba1a957f27aec7fe93b1abdde8d`, #1907 `76c11325bd482c47e0c4dc12830422eafdc3452d`, #1911 `7efdabe38f13bc11a64008777a925ad01e8af816`, #1912 `7e8601d233e2a56ee175f0c459ed304621e870b5`. Evidence links and PR mappings below refer to those immutable historical heads. GitHub now reports all seven formerly open PRs #1907–#1913 closed and merged between 13:38 and 13:42 UTC; none were open at this census. The original 21-PR snapshot plus #1912/#1913 remains a stable union of 23. The rolling 48-hour union is 18 recently updated closed PRs.

GitHub main is `fecc40a9de1652a1f6e27ae6840439ff989e8fdc`, with parents `7e8601d233e2a56ee175f0c459ed304621e870b5` and `972e26cdc117f7fec6a3636d2fd1545481a5eaba`. Its tree `23bdba55e03f611dae84aecc447d810e71767f6f` matches the pre-existing local integration tree `db7ea1dc63db02e15f2025a4f1c2839ff97ec57a`. This is a read-only observation; no conclusion about who initiated the merge is drawn. The merge message contains `[skip ci]`.

#79 and #725 closed completed at 10:42:34Z and 10:42:37Z; #1767 closed completed on 2026-10-28 at 22:05:22Z and was already absent from the earlier 28-issue audit. #642 and #1431 are software completion candidates awaiting the required exact-head CI; the other 24 have specific remaining criteria.

The merged main tree has known failures in the current software checks: four of ten selected FX composition-order tests fail, all five incoming Wave semantic controls reproduce failures, and an exported posture API stale-state case is reproduced. Fixes are being validated locally and are not yet published at this snapshot. The earlier #1908 `validate` failure and its recovery attempt are historical evidence, not a final main pass; a cancelled account annotation is not a pass. No successful final main CI is asserted. Overlapping test groups must not be summed.

## Original criteria, evidence and remaining work

### [#226](https://github.com/rhgrive3/actions/issues/226) [INKWAVE][Paint][要検証] アメフラシRainNum=72と公開版172回の塗り呼出の対応を校正する

**Original criterion:** Identify the sourced meaning of RainNum and compare generation, reuse, ground contact, paint writes, area, distribution and timing.

**Observed:** Existing deterministic public-source and composed accounting separates 172/172/171 calls from 178 candidate rays; it does not map either count to Nintendo particles.

**Remaining:** Find an applicable lifecycle source and compare like quantities; make a gameplay change only if an actual discrepancy is established.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/inkwave-storm-rain-calibration-2026-10-09.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#287](https://github.com/rhgrive3/actions/issues/287) [INKWAVE][Aim] Controller sensitivity uses 0.2×–3.0× instead of Splatoon 3's −5…+5 right-stick scale

**Original criterion:** Calibrate independent right-stick 0/end anchors and intermediate mapping while preserving profiles, gyro and dead zones.

**Observed:** Legacy-gain migration and overlapping upper-yaw settings were repaired; the current curve is provisional.

**Remaining:** Establish the requested reference anchors and intermediate mapping; do not present provisional tuning as source-confirmed.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/input-followup.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#532](https://github.com/rhgrive3/actions/issues/532) [INKWAVE][Motion] Verify Splat Dualies 4+1 WU dodge scale, easing and glide calibration

**Original criterion:** Verify the Dualies roll 4+1 distance, timing, glide/easing, dive/default rules and independent coordinate mapping.

**Observed:** Existing 4+1 movement/timing controls cover the implemented model.

**Remaining:** Obtain or verify the independent anchors and semantics needed to compare the model; no arbitrary replacement.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#642](https://github.com/rhgrive3/actions/issues/642) [INKWAVE][Perf] Mobile post stack permanently pins two full-resolution RGBA16F composer buffers

**Original criterion:** Reduce mobile persistent color allocation in idle and normal battle; preserve output, resize cleanup, desktop HDR and context stability.

**Observed:** Guarded packed/HDR resources and cleanup have source, emitted and browser fixture evidence with explicit pixel tolerances.

**Remaining:** Software completion candidate: final required exact-head CI and the documented acceptance scope remain outstanding; do not infer hardware memory or FPS.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#735](https://github.com/rhgrive3/actions/issues/735) [INKWAVE][Systems] Ink Storm can damage enemies arbitrarily far below the cloud because no vertical cutoff is enforced

**Original criterion:** Bound vertical storm damage using a validated rain volume and cutoff, preserving DPS, cover and ownership at 30/60/120 Hz.

**Observed:** An internal finite lower boundary and cover/owner tests address the unbounded-damage defect; its cutoff is not a verified S3 measurement.

**Remaining:** Establish the reference volume, lower cutoff and coordinate convention, then validate boundary, cover and owner behavior.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/final-batch/public-source-inventory.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#845](https://github.com/rhgrive3/actions/issues/845) [INKWAVE][Perf] Frustum-culled actors keep Character pose, foot-IK raycasts and hair simulation running every tick

**Original criterion:** Remove simulation-cadence offscreen ground work, materially reduce Character visual CPU, preserve authoritative state and correct first-visible reentry at 30/60/120 Hz.

**Observed:** Ground rectangle inference and synchronous Actor-bus memo invalidation were corrected; an earlier native-source fixture still sampled ground on 600/600 budgeted ticks.

**Remaining:** Demonstrate safe reduced ground-query cadence and comparable visual CPU in a camera-away scene, preserving support, muzzle, history and first draw; these correctness fixes increase work and do not complete the performance goal.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/845-ground-certificate/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/845-actor-event-ground-memo/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 3](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#890](https://github.com/rhgrive3/actions/issues/890) [INKWAVE][Movement] Normal jumps ignore B hold duration so small and high jumps collapse to one arc

**Original criterion:** Verify a sourced current-S3 hold cutoff and progression while preserving input buffering, coyote and distinct jump paths.

**Observed:** Tap and hold produce distinct trajectories; existing 5F/0.7 tuning is explicitly provisional.

**Remaining:** Validate the original cutoff/curve against relevant source semantics rather than inventing coefficients.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#952](https://github.com/rhgrive3/actions/issues/952) [INKWAVE][Motion] Heavy Splatling charge entry ignores S3 dedicated ground-deceleration curve-delay

**Original criterion:** Implement or validate Splatling charge-entry ground deceleration with source parameters and frame trace, preserving steering and cancellation.

**Observed:** The current solver no longer incorrectly cancels existing reversal/orthogonal deceleration.

**Remaining:** Establish the relevant current-S3 delay/curve semantics and validate the requested frame trace.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#956](https://github.com/rhgrive3/actions/issues/956) [INKWAVE][Physics] Splat Charger muzzle height ignores footwear, removing S3 shoe-dependent shot origin

**Original criterion:** Verify footwear-dependent authoritative Charger muzzle height with two sourced distinct soles and cover/guide/shot parity.

**Observed:** Available catalog metadata describes abilities/materials but did not establish sole transforms in the bounded audit.

**Remaining:** Find suitable source-model or other independent sole/transform evidence and test two distinct shoes before tuning.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#992](https://github.com/rhgrive3/actions/issues/992) [INKWAVE][Dualies] Verify native paint phases, droplet dynamics and height/default rules (S3 11.3.0)

**Original criterion:** Verify native Dualies phase/feet selection, droplets, height composition and sparse default/world mapping.

**Observed:** Existing native paint and turf controls cover current behavior.

**Remaining:** Resolve the specific phase permutation, nearest-foot, droplet and height/default semantics against suitable source evidence.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#997](https://github.com/rhgrive3/actions/issues/997) [INKWAVE][Motion] Ordinary weak diagonal walking gait does not match Splatoon 3

**Original criterion:** Match weak diagonal walk cadence, stride, foot contact and direction/velocity continuity to the current-S3 reference.

**Observed:** Current source-bank cadence and existing motion controls are implemented.

**Remaining:** Establish and compare the S3 weak-input selector and progression; preserve the Character QA scope hold.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/character-local.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1097](https://github.com/rhgrive3/actions/issues/1097) [INKWAVE][Motion] Hit reactions use one weapon-agnostic flinch instead of Splatoon 3's weapon-class damage poses

**Original criterion:** Verify class-appropriate damage/idle/moving selection, directional timing, attachment and remote/gameplay behavior.

**Observed:** The current source-bank generic Damage and native upper-body class layer are distinct; provisional visual behavior has tests.

**Remaining:** Find the relevant S3 class selector/joint timing evidence and validate it without turning provisional curves into source claims.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1116](https://github.com/rhgrive3/actions/issues/1116) [INKWAVE][Motion] Non-shooter jumps reuse generic airborne pose despite Splatoon 3 weapon-class jump animations

**Original criterion:** Verify S3 class-specific jump choice when distinct and preserve start/air/land/fire priority and attachments across rates.

**Observed:** Existing jump/source-bank and attachment behavior has software tests.

**Remaining:** Establish which S3 clips and selector are actually applicable, then compare timing and ownership.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1431](https://github.com/rhgrive3/actions/issues/1431) [INKWAVE][Weapons] Quad and Explosher projectile birth/origin alignment gap

**Original criterion:** Resolve Quad and Explosher first/steady birth-to-visible-muzzle alignment across aim, cadence, OBB, LOS and authority.

**Observed:** Source and emitted tests plus retained actual draw evidence cover both owners, including intentional blocked/predicted fallback.

**Remaining:** Software completion candidate: required exact-head CI and recorded fixture/visual limits remain; do not invent a retail aperture condition.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/issue1431-current2b/README.md) (PRs #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons-1431.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1434](https://github.com/rhgrive3/actions/issues/1434) [INKWAVE][Perf] Complete calibrated whole-game crowd A/B benchmark

**Original criterion:** Calibrate a repeatable equivalent whole-game software A/B with matched workload/readback, ABBA/BAAB and frame statistics.

**Observed:** A native/native software comparison has failed its strict identity gate; isolated operation-level savings are recorded separately.

**Remaining:** Produce a calibrated matching baseline and complete the requested paired measurements before claiming a speedup.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/current-pair-methodology/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1565](https://github.com/rhgrive3/actions/issues/1565) [INKWAVE][Plan] 軽量Pose Search・歩行品質・インク視認性の性能非劣化実装計画

**Original criterion:** Complete the plan’s G0/G2 quality and non-regression measurements; use later pose/distance techniques only if their stated conditions are met.

**Observed:** Existing source and controlled visual CPU work has partial evidence.

**Remaining:** Establish comparable workload and quality/non-regression results; G3/G4 are conditional, not mandatory speculative features.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/continuation-20261029.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1607](https://github.com/rhgrive3/actions/issues/1607) [INKWAVE][Specials/Investigate] Zipcaster failed-hook retry uses 45F versus 11.3.0 ShotFailedIntervalFrm=20

**Original criterion:** Separate failed-hook 20F source field from observed 45F retry phases and verify miss, near-floor, near-wall, input and cost behavior.

**Observed:** A separately supported successful-hook 20F minimum was fixed; the current 44/45/46F miss controls retain the 45F behavior.

**Remaining:** Resolve the source meaning of the failed-hook timing phases or document a supported no-change outcome; do not simply replace 45F with 20F.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons-1607.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1665](https://github.com/rhgrive3/actions/issues/1665) [INKWAVE][P1/Net] Authentic actor owner can forge lethal hit packets without firing or proving collision

**Original criterion:** Require trusted weapon action, resource, timeline and geometry evidence before accepting PvP hit damage, including legitimate lag/migration behavior.

**Observed:** Malformed births no longer mint executable projectile proof. In the 3054 emitted diagnostic presentation-only attacks cause zero damage, but valid-shaped forged projectile events still cause 36 HP without sender launch or receiver contact.

**Remaining:** Connect production-required trusted action/contact authority with genuine positive, no-fire/forgery, lag and migration controls; component replay alone is not that authority.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/authority-remaining.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/native-birth-admission/README.md) (PRs #1911, #1912); [evidence 3](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/pr1912-reconciled-runtime/README.md) (PRs #1912)

### [#1666](https://github.com/rhgrive3/actions/issues/1666) [INKWAVE][P1/Boss] Authenticated guests can invent valid Boss-hit claims without weapon fire or collision

**Original criterion:** Require trusted action/contact and weak-state evidence for Boss/crablet hits, with correct proof consumption, migration and legitimate attack controls.

**Observed:** Existing proof ordering and malformed-birth fixes reject several false claims. The 3054 emitted valid-shaped forged projectile diagnostic still inflicts 36 HP on Boss and crablet without actual launch/contact.

**Remaining:** Connect trusted Boss/crablet action and contact authority in the mandatory production path; retain valid weak-state and replay/migration behavior.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/authority-remaining.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/pr1912-reconciled-runtime/README.md) (PRs #1912)

### [#1671](https://github.com/rhgrive3/actions/issues/1671) [INKWAVE][P0/Perf] iPad Safari native Turf falls to 5 FPS / sim 174.9ms at 60% resolution

**Original criterion:** Identify the dominant native gameplay CPU path and demonstrate material improvement in a comparable full workload without changing simulation, paint, collision or AI.

**Observed:** Controlled 8-actor/7-bot/300-tick traces and selected query reductions retain state; whole-workload timings varied and did not establish material recovery.

**Remaining:** Profile and fix the demonstrated dominant path, then compare equivalent workloads and output; device FPS is waived.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/native-cpu-rejected/README.md) (PRs #1911, #1912)

### [#1708](https://github.com/rhgrive3/actions/issues/1708) [INKWAVE][Audio/Provenance] Obtain and verify native 11.3.0 sound cues for 11 post-2022 main weapons

**Original criterion:** Source and verify the eleven named weapons’ own S3 11.3 audio cues, event mappings, hashes and permitted usage.

**Observed:** Existing audio controls and candidate-source reviews do not establish version, provenance or rights for all named cues.

**Remaining:** Identify and verify the required cue/event sources and usage rights before adopting or publishing assets.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/audio-followup.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1757](https://github.com/rhgrive3/actions/issues/1757) [INKWAVE][P1/Perf] Turf stages still run poorly on iPad mini 6 after A+ integration

**Original criterion:** Profile multiple stage and practice conditions, reduce the demonstrated resource/CPU bottleneck and compare p50/p95 with gameplay and resource parity.

**Observed:** Focused native and rendering optimizations retain selected state; comparable whole-scene recovery is not yet established.

**Remaining:** Complete equivalent multistage/practice profiling and parity-backed repair; device tracing is waived.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-performance/README.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1789](https://github.com/rhgrive3/actions/issues/1789) [INKWAVE][Bloblobber][Parity] Recover S3 11.3.0 native floor/slope rebound and speed-limit semantics

**Original criterion:** Verify Bloblobber floor/slope dispatch and restitution sequence, speed-limit interpretation and sparse large-bubble defaults.

**Observed:** Existing bounce and source-row diagnostics identify plausible semantics but not the exact rules.

**Remaining:** Resolve the slope, speed-limit and default semantics with reliable relevant evidence before changing behavior.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1813](https://github.com/rhgrive3/actions/issues/1813) [INKWAVE][Dynamo] Horizontal secondary unit has source UnitDamageRate=0 but catalog ignores it

**Original criterion:** Isolate Dynamo secondary-unit damage, collision, object hit and paint, and determine whether UnitDamageRate=0 is a multiplier or sentinel.

**Observed:** The source field omission is known and actual unit/authority controls exist; zero’s native meaning is not established by the value alone.

**Remaining:** Compare an isolated unit-1 path against a reliable current-S3 semantic source; preserve paint and crossfire.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/1814-current-owner-audit/README.md) (PRs #1911, #1912); [evidence 2](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/remaining-weapons.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

### [#1814](https://github.com/rhgrive3/actions/issues/1814) [INKWAVE] S3 11.3.0 65-main-weapon behavioral parity audit and 10-gap remediation tracker

**Original criterion:** Reconcile the ten named #1804–#1813 tracker items and requested real-path matrix for eleven affected weapons.

**Observed:** The owner audit identifies completed rows and retained #1813 semantic uncertainty; related #1789/#1431 are not additional tracker prerequisites.

**Remaining:** Close the actual tracker rows and requested weapon matrix with their evidence; do not impose a new 65-weapon retail-proof condition.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261029/1814-current-owner-audit/README.md) (PRs #1911, #1912)

### [#1823](https://github.com/rhgrive3/actions/issues/1823) [INKWAVE][Audio][Charger] 本家の持続チャージ上昇音が未実装、HoldNoise誤ループとは別イベント

**Original criterion:** Obtain the actual S3 Charger rise cue and trigger/curve provenance and validate click/rise/ready/keep lifecycle.

**Observed:** Existing legacy phrase/lifecycle repairs are tested but are not the sourced S3 cue.

**Remaining:** Find and verify the correct cue and event mapping, then perform the specified software lifecycle and audio checks.

[evidence 1](https://github.com/rhgrive3/actions/blob/7e8601d233e2a56ee175f0c459ed304621e870b5/reports/issue-resolution-20261028/audio-followup.md) (PRs #1908, #1910, #1909, #1907, #1911, #1912)

The [machine-readable ledger](ledger.json) records exact paths, report-presence mapping and head identities. A bounded search that did not establish a source is not proof that no source exists. The MOV-08b and isolated Character QA holds remain.

## Current evidence addendum — 2026-10-29 16:17 UTC

This addendum is separate from the 13:58 UTC snapshot above. A fresh paginated GitHub issue query returned the same 26 open issue numbers, excluding #401. The previously verified closures remain #79, #725 and #1767. At this observation, public PR [#1914](https://github.com/rhgrive3/actions/pull/1914) was open and non-draft at `331fdaadb061d192e83e0f82d37fbb5c3291da0a`, based on `085dc852fbed282204b84b63a47ee56a7d95a7f1`. The separate local integration commit `7290b01f329f7de3b7ccf830b50604c9585061ef` was not the published PR head. No Issue was closed by this addendum. The user's physical-device waiver applies; the remaining conditions below are software/evidence conditions.

- **#1431:** The unchanged actual-Actor/Runner/Projectiles browser probe was rerun at source `550b5a3f49f40cf8ab913ea1687b7074af11e3e9`, emitted content `6013fcd90a3ed04ac0d3f5cec30a7088168c4ee9e9506d1e1b4be1c3cfdbea79` and input `4a3ec6606981d5a6afdf82d7ec57901d424191a65eab1458980fa7203b5cfbc5`: 36 distinct 30/60/120 Hz, pitch and open/wall conditions, 288 births, 75 first/steady/prediction images, 147 draws and no page/request/accepted-draw GL errors. These are controlled Chromium/SwiftShader images and fixed simulation samples, not retail animation or device proof. They supplement, rather than relabel, the retained 2b image set and the distinct 6013 emitted hit-pose/serialization controls. See the [published evidence report](https://github.com/rhgrive3/actions/blob/331fdaadb061d192e83e0f82d37fbb5c3291da0a/reports/issue-resolution-20261029/pr1914-ci-reconciliation/README.md). Required exact-head hosted CI and the stated software acceptance remain pending.
- **#642:** The same 6013 application was sampled in actual local Turf with emulated-touch LOW/MEDIUM/HIGH. Each profile observed two HDR color targets during active ScreenFX and a packed-plus-HDR pair after it became inactive. At the same truncated target dimensions, the packed pair's **estimated color bytes** were 25% lower than two HDR targets. The menu's lazy target accessors were null in the observed snapshots; this is not a measured VRAM value. Observations can repeat rendered frame IDs and do not establish all-battle or time-weighted savings, total GPU memory, FPS or device behavior. The HIGH run retained two audio `ERR_ABORTED` events; none occurred in the other two samples. [Published report and retained raw receipt](https://github.com/rhgrive3/actions/blob/331fdaadb061d192e83e0f82d37fbb5c3291da0a/reports/issue-resolution-20261029/pr1914-ci-reconciliation/README.md) preserve these limits. Original output/resize/recovery and desktop-HDR criteria plus current required CI still need their exact-scope evidence.
- **#1814:** An eight-group Node 22 controlled-source matrix at local commit `a1805ae79f0d02de387d50ab86adcb142ddd7476`, included in local `7290b01f329f7de3b7ccf830b50604c9585061ef`, passed 8/8 with zero skips. The [test source](../../../patches/splatoon3/tests/issue-1814-native-weapon-matrix-20261029.test.mjs) exercises the eleven named Actor/Runner/projectile owners, controlled deployed-object and terrain contacts, paint-only/zero-rate, ghost and boundary negatives, with independently sealed object-rate fixture bytes. Character pose and movement integration are fixture stubs and target placement is controlled; this is not retail or full-match equivalence. Raw local receipt `/workspace/scratch/pr1915-1814-portable-node22.tap` SHA-256 `e8317b5c69deb15a9a9626a28e45498966391d5dc8b9085361843d519042d28e`. It does not resolve #1813's unknown retail zero-rate semantics or establish complete #1814 closure.
- **#1434:** The specific prior 135-versus-134 ring-version result came from a distinct common C versus optimized B pair, not a same-build native/native self-control: C `4f5f7acc15e43016985d8b782bf3ba83551a9443`, B `7525bd5cc275c46f308fda2ee06912478d48b5d5`. Its strict rejection and all data remain unchanged. The locally retained source/harness attribution is `/workspace/scratch/agent3-ring-gpu-reentry-20261029-v3/whole-game-control-mode-proof.json`, SHA-256 `99b271d7263eaea0b4f1df32667fd4289a26d9316ef2782034e5e914d2e42168`. A separate isolated actual-WebGL ring diagnostic completed 99 observations in 33 groups, with exact RGBA and live VBO/source bytes, but strict state comparison remained false due to version/range, shader and some unused-tail VBO differences; it does not prove the cause of the full-game result or a speedup. The new current/current whole-game self-control has source/build preflight only at this snapshot; its browser calibration remains pending. The separately retained earlier same-native calibration is not relabelled as the 135/134 pair.

Current native Chromium audio request failures and required hosted CI remain unresolved. Minimap clock and sub-mark questions are under separate investigation; no result is assumed here. Existing MOV-08b and isolated Character QA holds remain in force. No whole-match performance or global completion claim follows these receipts.
