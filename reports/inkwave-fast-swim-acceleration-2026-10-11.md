# Fast weapon acceleration: bounded grounded connection

Baseline: adopted main `675731132cc419bd2026db0692f918828d60393f`, same-tree local `62a313c22adcc992d78f3d467f7d5728751511e1`.

## Source and scope

Pinned [WeaponShooterShort 11.3.0](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterShort.game__GameParameterTable.json) declares `MainWeaponSetting.WeaponAccType=Fast`, independently of `WeaponSpeedType=Fast`. SHA256: `4766d778180949833438b93fd945131cd76835adfda6a11feb6f7b2b3803c315`.

All 65 raw weapon files were hash-checked against `weapon-weight-1130.json`; their effective acceleration classes match the generated runtime. Three rows explicitly state acceleration, and only Sploosh has Fast. Missing values retain Mid.

The [verification wiki's acceleration section](https://wikiwiki.jp/splatoon3mix/システム詳細仕様#xb946c7b), read 2026-10-11, describes Sploosh squid acceleration as 1.5 times ordinary, human acceleration unchanged, and attack/ready acceleration as the common 2 times ordinary rather than stacking to 3 times. The extracted SplPlayer parameter file does not give this numeric acceleration. This is a measured-behavior reference combined with the pinned class, not a claim to have recovered the game function.

Only grounded acceleration selection changes. Existing absolute calibration 36/72 WU/s², speed caps, collision integration, air handling and networking remain. An air-specific 1.5x rule and exact Nintendo world-unit/turn curve are not established here.

## Reproduced discrepancy and fix

Actual installed Actor `_horizontal(1/60)` before: Sploosh and Splattershot Jr. both increased velocity by 0.6 WU/s in kid and squid forms. Sploosh's acceleration class was collected but never read.

After: grounded ordinary Sploosh squid 0.9 WU/s per 60-Hz tick; kid and other weapons 0.6; attack/held sub/special all retain 1.2. Braking and reverse use the same selected rate. Equipment changes affect speed caps without altering this class. Weapon/form switching does not retain a stale multiplier.

## Verification

- All 65 actual Actor classes across kid/squid and ordinary/main/sub/ready/special states; target-speed clipping is retained.
- Actual native Physics integration under 30/60/120 render schedules, AP0 and AP57: identical 60 fixed-tick traces.
- Owner update invokes horizontal movement once; remote snapshot playback invokes it zero times and preserves supplied velocity.
- New source cases: 4/4; existing movement/weight/issue405/air regression actual-built: 24 pass, 1 optional raw-source skip (25 total).
- Initial new 65-Actor test incorrectly expected the full acceleration step for a charger whose target speed was lower. The fixture expectation was corrected to cap at the existing actual target; runtime was unchanged for that correction.
- Exact browser-probe preparation adds eight class/form/ready cases. Hosted Chromium/WebKit execution is pending.
- Complete workflow source gate: 4,845 tests, 4,826 pass, 19 optional skips, zero failures. Separate network448/448. The earlier splatoon3-only suite was3,916 total/3,906pass/10skip and is not substituted for the complete gate.
- Integrated adopted main062c4a81 (PR1246 models/motion), actual-built29/29 including the pinned misc speed hash, all65 models, actual Actor/Physics, remote playback and FPS checks. Manifest2f1474466a47a0809d24cd27357ea5df3f018a9232da5bed26e7265484625782.
- All63 changed main text blobs were fixed-SHA verified; local checkout omits267 report-only PNG/JPGs, which remain untouched in the official remote base tree. No complete-tree local equivalence is claimed.
- Hosted exact-head Chromium/WebKit checks are pending. This bounded candidate is not complete retail physics.
