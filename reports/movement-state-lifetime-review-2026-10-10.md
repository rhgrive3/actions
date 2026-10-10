# Movement state-lifetime review, 2026-10-10

Baseline: PR #1202, `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`.
Integration target: the separate `fix/pr1202-data-fidelity-20261010` branch.
No edit to PR #1202's branch or merge is included.

## Source inspection and limits

The user-provided research bundle contains public repository snapshots:

- `SOURCE_INFO.txt`: Splatoon (Wii U, NTSC) `Dexx-io/Splatoon-Decomp`
  `9ef403d96f1a370bdd70434ce158a0c29879bfcf`, and Leanny/splat3
  `7280ff9cde8bb1c5dcef46c700c326471584d2e6`.
- Re-read part 01's `thick/model/Player00_anim.szs` directly; SHA-256
  `809ccb73b110953230e5611567f635cf487d53e1536e990d0c85fba136c71938`.
  Decoded Yaz0 and inspected the FSKA name and frame-count fields. Normal,
  Roller and normal firing jump resources have 5-frame start, 21-frame core,
  and 15-frame end clips. These are S1 animation lengths, **not** S3 physics,
  input-release thresholds or proof that an animation plays at 60 fps.
- Re-read part 02's complete
  `Splatoon3-resources/splat3/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json`;
  SHA-256 `afece0e3e2016a895ba79483bfa63489b334c372293417b3b0ef072993bcb660`.
  The Action Intensify Squid record has `WallJumpChargeFrm_Low=45`,
  `Mid=18`, `High=5`, corroborating the existing charge-time data.
  This complete file does not provide the neutral wall-descent speed/acceleration
  or the normal B-hold cutoff/release multiplier. No claim is made about every
  other file in the corpus.
- Public source record:
  https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json

The changes below correct reproducible INKWAVE action-lifetime defects. They
do not claim to recover undocumented Nintendo transitions from animation
names. The existing 5F/.7 jump approximation and .9 WU/s, 3.6 WU/s² wall
descent calibration remain unchanged and unverified against current S3 hardware.
Private bundle links and raw animation/decompilation bytes are not published.

## Confirmed defects and changes

### #253: a new wall contact inherited the previous descent ramp

`s3NeutralWallSlideT` was only cleared by a subsequent `_updateClimb` call
outside the neutral-cling branch. Neither `reset()` nor `_setClimb(false)`
retired it. Native death directly assigns `climbing=false`, bypassing the
climb setter too.

Reproduction: hold neutral on an own-ink wall until the existing ramp reaches
its terminal value; detach/reset and establish a fresh neutral contact before
an intervening climb update. Before, its first downward tick was already
-0.9 WU/s; a fresh actor began at -0.06 WU/s.

Now reset/remote-respawn cleanup, an actual detached state, and death clear
the contact clock. Calling `_setClimb(true)` during uninterrupted contact
does not reset the ramp. No speed, acceleration, geometry, charge or Roll
eligibility value changes.

### #890: a completed/blocked ascent retained its release response

The normal-jump hold owner retained an unconsumed early-release state after
vertical velocity reached zero or became negative. A later upward impulse
could reuse the old jump's response. On a real low-ceiling takeoff, the native
collision resolver set `vel.y=0`, but the wrapper still created a live hold
epoch after the collision.

The owner now retires the epoch when the current ascent ends, including after
the native update on the ceiling-collision tick itself. A genuinely new jump
serial creates a fresh response; buffered and same-tick humanoid-emergence
jumps retain their established behavior. This is state ownership, not a
new B-duration curve.

## Verification

- New regressions include real production-composed Actor/Physics ceiling
  collision, contact reset/detach/death, fresh jump admission, unchanged active
  contact, and 30/60/120 Hz fixed-step wall-contact traces.
- Nine new regressions: baseline 7 failed / 2 passed; candidate 9 passed.
- The candidate plus neighboring tests: **102 passed / 0 failed / 0 skipped**,
  using `node --experimental-vm-modules --test --test-concurrency=1` on the
  selected movement/jump/Surge/Dualies test files. This includes real Character
  production composition, cross-realm registration, indexed output/IK, and
  buffered/emergence jump regressions. One initial overlay run lacked two
  existing test fixtures; after restoring those test inputs the complete selected
  set passed in 118.9 seconds. The missing fixtures were not product defects.
- A synthetic external upward impulse is a unit-level ownership probe, not a
  claimed measured Nintendo event.
- No Switch capture, browser/GPU measurement or complete gameplay-parity
  claim. Whole-repository CI belongs to the final integrated commit.
