# #533: motion ownership on the Turf Map

## Comparison and scope

Target: Splatoon 3 Ver. 11.3.0, motion controls enabled, map open, then hover a
Super Jump target and confirm. Inkipedia's Joy-Con controls page documents tilting
the device to move the Super Jump cursor:
https://splatoonwiki.org/wiki/Joy-Con . The issue also cites Game8's Super Jump
guide https://game8.co/games/Splatoon-3/archives/388870 (direct fetch returned 402
in this environment). This change concerns the missing input route, not a
measured Nintendo sensitivity or sensor-transport parity claim. #71's connected
controller motion transport remains separate.

Previously PlayerController consumed DeviceMotion while mapUp but applied the
delta neither to aim nor to DioramaOverlay. Dead navigation discarded it too.
The build-only map-gyro adapter now routes each calibrated delta once into a
controller queue; the actual Diorama consumes that queue and moves its cursor.
The camera's existing perspective projection converts the angular change into
normalized cursor position. No additional guessed gain, dt multiplication,
fixed Nintendo FOV or sensitivity setting was introduced.

Battle camera yaw/pitch stay frozen while the map owns motion. Entering/leaving
map ownership discards the boundary sample and clears undelivered deltas, so a
queued turn is not replayed as aim. OFF, disabled/menu state, reset and respawn
navigation cleanup also clear the cursor state. D-pad selection clears queued
motion and takes precedence in that frame. Motion hover supplies target identity
to the existing standard-pad right-face A confirmation. It does not auto-jump;
raw-pad/direct-touch paths remain available. Dead requests still wait for actual
landing via #409, and invalid targets remain rejected.

## Verification

- Actual native Input, PlayerController, Match.updateController, Gyro.consume and
  DioramaOverlay.update are exercised; display elements are stubbed in Node.
- New regressions: alive/dead map cursor movement while aim stays frozen,
  exactly-once consumption, ten open/close cycles, OFF/reset/pause cleanup,
  30/60/120/144 Hz angular-integral consistency, A confirmation and same-frame
  D-pad precedence, dead queued confirmation, and invalid-target rejection.
- Source new tests: 8/8. Combined source navigation tests: 39/39.
- Emitted/minified actual module tests: 39/39, build d2aea3975d4b.
- Negative control omitting only adaptMapGyro: both alive/dead cursor tests fail
  because the cursor does not move, matching the reported baseline.
- Canonical Chromium/WebKit probe added for actual rendered Diorama movement,
  frozen aim, single consumption and return to battle aim. It awaits the next
  combined CI; no new standalone source CI is requested.

Physical-device calibration, exact Nintendo map sensitivity and FOV parity are
not verified. Projection behavior is an explicit web implementation choice using
the current rendered lens, not evidence of a measured reference coefficient.

## Current main plus gyro composition

Rechecked on main/536 foundation 5a2350f with gyro batch 22df8d7. The real gyro startup grant, map-open discard, one-consumer live steps, repeated render, platform reset, resync, and return to battle aim pass in source and emitted modules. Both alive and dead undelivered map queues, targets, and cursor ownership clear synchronously through the existing clearRespawnNavigation entry point. No additional production change is needed. Source Map cases 11/11; emitted Map/platform/navigation cases 45/45; build 63f9cd183184. Browser and physical-device acceptance remain separate gates.
