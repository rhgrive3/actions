# INKWAVE weapon edge cases: #354 / #356 / #357 / #361

Base: `f1f98db94af412fd584a459b11fc97346466a063`, 2026-10-04. Its only change from `404c66c858cfea14e81225fb6364febcf2c9c528` is the unrelated CXX workflow filter. Native `inkwave-public/` and its compatibility lock are unchanged. The production path is `scripts/build-inkwave.mjs` → `adaptSource` → `weapon-edgecases-adapter.mjs` → the actual native launch/contact methods and runtime installer.

## Sources and bounded conclusions

- #354: [S3 measured startup/recovery, v10.0.1 table](https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙#h761a244) measures 60fps and defines input recognition as frame 1, counting the frames before release. Dualies humanoid startup is 2F, so emission is frame 3. Use 2/60 seconds, not an extra 3/60. The source does not establish how a one-frame released tap must buffer. This implementation cancels an uncommitted tap rather than replaying a stale shot, explicitly pending physical comparison. The existing squid-emerge gate is unchanged.
- #356: [fixed 11.3.0 Spinner raw data](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json), `Stand_DegSwerve=3.3`, `PitchDegSwerve=1.6`. `PitchDegBias=.4` is a distinct field and is not silently treated as an angular cap. Retain the existing two-draw radial sampler, with a separately connected ground pitch envelope. This fixes the axis limits, not the full S3 probability distribution. Air and Action Intensify axis correlations are not inferred.
- #357: [S3 physical attack-authority experiment, 3.0.0](https://smssmooth.hatenablog.com/entry/2023/03/05/151247) explicitly distinguishes Hot Blaster air maximum70HP from terrain-impact35HP. [Current S3 Blaster table](https://wikiwiki.jp/splatoon3mix/ブキ/ホットブラスター) gives air70–50 versus impact35–25. The pinned raw weapon file does not explicitly override the damage ratio; the half-damage value is based on those measurements, not an invented omitted default. Terrain bands use current INKWAVE interpolation, normalize by PR340's player-radius ratio when present, halve HP, then floor to0.1HP. Exact S3 distance falloff and absolute WU calibration remain unverified.
- #361: [fixed 11.3.0 Roller raw units](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json), `WideSwingUnitGroupParam.Unit`: main12; near speed `.48` plus random parameter `.11`, width `.4`, angular field4, versus main speed1.05/width.8/angle18. Near `BulletNum` is omitted. Count1 is corroborated by [S3 unit research](https://macarongamemo.com/entry/splatoon3-weapon-bullets) and [S3 Roller page](https://wikiwiki.jp/splatoon3mix/ブキ/スプラローラー), not deduced from omission alone.

## Actual behavior

| Case | Baseline | Candidate |
|---|---|---|
| Stable humanoid Dualies, newly held ZR | frames1,6,11,16 | frames3,8,13,18; ink remains100 until frame3 |
| Ground Splatling vertical envelope at horizontal3.3° | 1.816400867° | 1.6° |
| PR302 scalar1.98° + candidate emitter | dependent 0.55 approximation | independent1.6° vertical |
| Blaster inner terrain / air | 70 / 70HP | 35 / 70HP |
| Full-ink horizontal Roller | 12 bullets | main12 + near1, same shared damage group, ink91.5 |
| Near/main reference base speed ratio | no near bullet | .48/1.05 = .457142857... |

Dualies wait is actor-local, cleared on release/sub/squid/special/death/reset/change of weapon. Waiting cannot accumulate negative cooldown debt. Ordinary5F and post-roll4F remain distinct. Released-tap behavior remains a stated limitation.

The near Roller unit is appended after the unchanged native12 loop, before the single fire event; all13 are captured by the existing shared-max damage wrapper. No extra attack payment or release event is created. Existing12 random draw order and vertical5 are retained. Near speed uses `flickSpeed*(.48 + uniform[-.11,.11])/1.05`. Near angle provisionally interprets4 as ±4°, without the native extra angular jitter. Width provisionally treats the main reference.8 as a full local span unless a future `flickSpawnWidth` calibration supplies it, then multiplies by.4/.8. These sampler, angle-semantic, and absolute-position mappings are expressly provisional; they do not certify S3 distribution/scale. The unit follows the real `_push`/`NetMatch.recProj` packet path after velocity is final. Remote `ghostProjectile` replays the velocity and does not rerun the launch sampler. Existing broader ghost paint/authority work remains independently owned.

## Verification

- Focused native source: **16/16 passed**. Actual Actor/WeaponRunner/Projectiles/Physics and NetMatch packet methods, with display/audio/world fixture boundaries explicitly controlled.
- Public esbuild output: **16/16 passed**, including native OBB floor/wall collisions for the near unit, signed launch-axis boundaries across aim pitch/yaw, packet rounding parity,35HP transmission, unchanged125HP direct route, cause restoration on exception/reuse, and max-per-attack aggregation.
- FixedClock30/60/120Hz produces identical Dualies tick traces. No Switch, mobile GPU, or newly filmed physical comparison is claimed.
- Pinned primary source SHA256 verification: **11 files / 132 extracted fields passed;14 unknown entries retained**. New numeric bindings point to explicit source fields; count1,2F startup,.5 damage ratio and width ratio have explanatory provenance rather than fake raw fields.
- Existing quality **8/8** and motion/workflow gates **10/10** passed. Initial full local run reached753/756; the expected old Roller12 count was corrected to13, while two storage-gate failures were caused by a temporary checkout path. A persistent-storage attempt subsequently hit shared **ENOSPC** and two test processes stopped; no full-local-suite success is claimed. GitHub CI for the final commit is the required aggregate validation and remains pending when this report is first published.
- Negative control: the same focused assertions are run against the unchanged baseline source; the four changed families reject the old behavior. Baseline rejects16/16 focused assertions; this includes missing new-state/metadata assertions as well as the direct four-family behavior counterexamples.

## Existing PR actual-code composition

Latest immutable heads reviewed: PR63 `bfae5fd133c1e4682d0def2d87c5321929cb449d`, PR64 `33db80691e65ea5e620cfff4abaa17be9eefc7ae`, PR302 `bc3dc0c12040c0bc3e4e2ff08536a9b033d54a6a`, PR318 `c6b13fde64486d21d7209cebee91a26671cbb516`, PR340 `062f0a1954377a7b4fffbbeb06b09f67ca90408f`.

A disposable composition applies actual production patches and profile deltas, retaining PR63 shooter startup and PR64 flight ownership. It includes both PR302 stream/speed sampling and PR318 gates, plus PR340 terrain radius. It passes **16/16 source +16/16 public minified-build tests**. A separate actual runner check verifies first post-roll emission on the fourth post-roll tick, then4F repeats, and held-stream scalar1.98 across20 shots.

Integration resolutions are explicit: imports/installers are additive; PR64's player-collision helper keeps PR318's mode radius where no growing Roller collider exists; PR64 owns the projectile outer-envelope call instead of applying an extra PR63 reduction; PR340 rolling recovery preserves PR318's post-shot/dodge countdown guards. Packet tests compare transmitted order, since PR63 reorders the local list center-first after launch; they do not mistake list order for network order. The PR302 speed sample consumes its own random draw before angular samples. This is CPU actual-code composition, not a merged branch or complete combined-PR browser certification.

## Issue linkage

Closes #356 only for the scoped ground-axis connection. Refs #354 (released-tap calibration), #357 (full distance falloff calibration), #361 (unit angle/width/PDF and broader authority integration). None is manually closed. Draft only; no main push, merge, or deployment.
