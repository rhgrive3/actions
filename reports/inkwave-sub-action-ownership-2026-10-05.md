# Main/sub action ownership (#530)

Base: reviewed feature batch `67a90550ce00d0d048b767ff35957474fe36e0de`, containing main/PR536 and the separate #527 Roller startup work. This is a build-only final input/dispatcher correction. Raw upstream, projectile physics, collision, damage, Bomb cost, and recovery durations are unchanged.

## Boundary

The native runner dispatched a main attack before reading its sub input. Holding Bomb aim plus main fire therefore advanced Shooter, Charger, Roller, Splatling, Slosher and Blaster concurrently. Dualies already masks fire during sub hold in its existing edge-case owner; that partial fix is preserved.

After existing per-weapon input admission, an accepted sub hold or an accepted release from an existing aim owns the dispatcher for that tick. Interruptible charge/stream/rolling state is cancelled without manufacturing a release attack. The Actor's buffered main press is cleared when sub ownership begins, including #527's longer Roller emergence buffer. Positive cooldown, firing-pose/recovery and alternating-hand clocks retain their normal updates. An idle sub interval clamps negative cooldown to zero, preventing accumulated catch-up shots. Roller presentation uses its existing cancellation hook after a completed release; the stale release clock is not frozen. Recovery classification uses a per-update receipt of actual Bomb payment, so a rejected sub release cannot borrow Bomb recovery time.

Already committed flick/heave/Blaster windup and Dualies travel/recovery finish before a new sub aim is admitted. Their existing clocks and paid ink are not rewound. Holding sub across completion may begin aiming on the next tick; an earlier rejected release is not queued. No new Nintendo duration or numeric tuning was introduced. This is the bounded action-ordering implementation; it does not establish physical-device or exact Nintendo frame-parity evidence.

## Existing owners and limits

- PR #302 at `bc3dc0c12040c0bc3e4e2ff08536a9b033d54a6a` owns Splatling cancellation and unspent prepaid-ink refunds. When that installer is present, the final dispatcher reaches its existing `_splatling` sub branch before neutralizing main state. This patch never computes a refund. Without #302, the current main's no-refund cancellation behavior remains; #294 is not fixed by this change.
- PR #318 at `c6b13fde64486d21d7209cebee91a26671cbb516` owns post-release admission clocks. Dynamic sub getters remain observable before selecting the dispatcher. Their 22F/16F policy is neither copied nor replaced here.
- PR #63 owns Shooter/Charger timing, PR #64 the main projectiles, and PR #259 Bomb/Storm physics. None of those mechanics is duplicated here. Shooter release movement timing (#408) is unchanged.

## Validation

- Baseline seven-weapon hold/release tests: six failures, one already-correct Dualies hold case.
- New source and actual emitted/minified tests: 21/21 each. Cover seven weapon kinds, cancellation and abort, committed windups, live Dodge and lock, cooldown/recovery, insufficient Bomb ink, actual Actor buffered Roller input, and identical 30/60/120/144Hz fixed-step histories.
- Existing #527 focused tests remained 6/6; the new native Actor regression independently covers sub takeover of its buffered emergence press.
- Final full gameplay aggregate: 1091 pass, 0 fail, 3 optional emitted-mode skips. Dedicated actual emitted tests above were run explicitly.
- Production build: `c0a2497c07a2`.
- Separate actual-module composition probes loaded the exact PR302 installer and profile: paid 22.5, unspent 20.25 returned exactly once, followed by Bomb-only release. The exact PR318 installer preserved dynamic admission and discarded a blocked release without replay. These narrow probes do not certify the entire two PRs as merged.
- A native DOM sub/FIRE hold-release browser probe was added for the combined integration CI. It has not been run locally and is not counted as passing browser evidence.

## Independent review corrections

The first passing candidate was withheld after review found four untested boundaries. Dedicated regressions now cover: Shooter/Blaster negative cooldown debt; real Character Roller drum impulses replaying from a frozen release clock; a denied Bomb release incorrectly choosing 1.0s recovery for a Blaster's 0.95s main shot; and Dualies travel losing its existing sub-hold fire suppression. The source and emitted 21-case suites pass after correcting all four. A second read-only review found no remaining blocker and additionally checked the actual PR318 getter with rejected Blaster release, the following real Bomb, and receipt expiry. Browser execution remains pending; this review is not physical-device evidence.
