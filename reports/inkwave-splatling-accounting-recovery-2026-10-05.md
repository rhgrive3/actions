# Heavy Splatling discrete ink and post-stream recovery (#543 / #501)

Base: integration Draft536 exact `9f1d794f79f3f78d0d2a4920fe16667b8a2e1b06`, derived from real main `83d6b088246f760a34d0921c118482bca7cde777`. Following the current workflow, this local batch is handed to the integration owner for one combined publication/CI; it does not push/merge main or independently start a redundant source CI.

## #543: reserve whole rounds

Before: one fixed-tick charge yields a continuous1/36-second burst and pays0.234375 ink, yet emits one full projectile whose configured cost is0.5625. Prepayment is based on continuous time while emission is discrete.

After: `splatlingReservation` calculates requested whole rounds as `ceil(splatlingBurst/fireInterval-EPS)`, caps by `floor(availableInk/inkPerShot+EPS)`, and reserves exactly `shots*inkPerShot`. Duration is the same count of cadence slots. Per-shot streaming remains prepaid, so it cannot double-charge. A zero affordable-round reservation stops without a phantom projectile. Guard the last slot against floating-point extra ticks, and initialize the first emission's clock without borrowing the pre-update dt from the next4F interval.

Consequences are explicit: partial streams round up to a whole4F slot, changing their continuous duration by less than4F and occasionally adding the last fully paid round. The endpoints remain first80F/20rounds and full160F/40rounds/22.5ink. This is an internal accounting rule, not a claim that Nintendo's fractional-charge quantization was measured. Snapshot cost uses equipped per-round ink, so existing Ink Saver(Main) scales reservation and full cost consistently. Unsupported/nonfinite reservation inputs fail closed.

Cancel-before-release still costs zero. On this base, cancellation after payment retains the existing prepaid cancellation policy; unused reservation refunds are owned by PR302, not silently redefined here.

## #501: independent4F natural-end delay

Pinned [S3 Ver.11.3.0 Heavy Splatling primary data](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json), `WeaponParam.PostDelayFrame=4`. `RepeatFrame=4`, `ChargeFrame_First/Second=48/72`, `MaxShootingFrame_First/Second=80/160` and `InkRecoverStop=40` remain independent fields. The public [parameter glossary](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報) identifies post-delay as shot recovery.

Before: natural stream end uses0.22seconds, so a new charge waits about14 subsequent60Hz ticks. After: native end-of-stream admission uses the sourced `postStreamDelay=4/60`. Epsilon normalization avoids turning exact4F into5F. It does not change the separate ink-refill lock, charge speed, firing movement, projectile properties, barrel animation or cancellation branch. Recoil/audio presentation does not control admission.

## Reproduction and verification

Actual `WeaponRunner`/`Projectiles` through build adapters and existing fixtures, with display/terrain mocks only:
- Every charge length1–72 fixed ticks, with0/57AP Ink Saver(Main), matches actual emitted rounds to the paid reservation. Full endpoint40rounds/22.5ink; each emission remains4F apart.
- One-tick taps pay0.5625, and50 repeated taps pay exactly50rounds. Low available ink0 through22.5 never causes a negative tank or unpaid shot.
- Actual native projectile/recording callback sees one complete projectile after minimal payment. Cancelled charge emits none; current-base prepaid cancellation behavior is retained.
- Natural end after1/19/48/72 charge ticks admits new charge on the fourth subsequent tick, not before. First/full stream slots, charge endpoints,40F refill and squid cancellation remain independent.
- Fixed60Hz histories match30/60/120Hz rendering; all timing statements use that fixed-step convention.

Focused native12/12 passed. Exact final build/minified/full regression receipts are appended at handoff, not inferred from earlier checks. Existing source/provenance verification reads the pinned primary bytes:11files,146 extracted fields,14 unknown entries retained. No new browser/GPU/Switch observation or absolute-distance calibration is claimed.

## PR302 composition contract

Actual PR302 head `bc3dc0c12040c0bc3e4e2ff08536a9b033d54a6a` replaces the entire Splatling runner, so merely merging our old-wrapper hunk would lose this fix. In a disposable actual-code composition:
1. Pass `splatlingReservation` alongside the existing burst/cap helpers into `installSplatling`.
2. On release, take duration/shots/paid/unspent from one reservation; remove its fractional `costAt` formula and `max(1,ceil(...))` fallback.
3. Use `w.postStreamDelay` instead of.22 at natural end.
4. Keep PR302's air/empty progression, spread/jitter, per-round unspent accounting and cancellation/refund owner.

This is a deliberate resolution, not an assertion that two replacing implementations merge automatically. The baseline local batch does not copy PR302's separate feature code.

## Final local handoff receipts

Combined #543/#501/#518 tree: full patch/reliability929pass,0fail,1skip(total930); quality/idle/motion/workflow117pass,0fail,2skip(total119). The skips are existing built-site-only gates; targeted native/emitted tests have no skips. Production build and actual minified16/16 pass. Actual PR302 runner with the documented shared-reservation and4F-delay resolutions passes12/12. Prior emitted baseline without these roots fails8/12 Splatling checks;4 unchanged control checks remain passing. Dualies prior emitted baseline fails4/4 state-lifetime tests. Primary verification11files/146extracted/14unknown, compatibility/numeric/diff checks pass. No individual source push/CI was started; combined remote CI belongs to the integration owner.
