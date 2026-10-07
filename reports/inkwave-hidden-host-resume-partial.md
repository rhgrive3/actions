# Refs878: same-host resume clock only

Source inspected: PR868 `402802be92d76b6aa30502237429fb66e34f3fc2`; claim https://github.com/rhgrive3/actions/issues/878#issuecomment-6023898698.

## Confirmed ownership and reproduction

The final `installPlatformGame` replaces the older clock `_loop` wrapper. PlatformFrameDriver cancels RAF at visibility suspension and starts again with zero elapsed simulation on resume. The native online Match owns its relative remaining seconds; NetMatch sends `[state,time]` plus a sender-local timestamp. The repository relay records membership and join times but no battle deadline, server clock synchronization, heartbeat timeout or host lease. Host migration occurs only after its socket close/error cleanup. Live deployed Worker behavior was not observed.

Using native Match/NetSession/NetMatch, actual Platform lifecycle/driver, and the repository relay's handleSession with bounded mock sockets, a host with10seconds remaining retains10 while hidden for5/20/120seconds. Guests reach5/0/0 and remain playing. A real simulated relay close elects the remaining guest, preserving its current remaining time; if already0 it finishes on the next tick. The old host's session enters its existing error/abort path and does not automatically rejoin.

## Bounded correction

At a hidden suspension, retain the same live authoritative Turf match/session/NetMatch/host ID, current remaining time and monotonic timestamp. On prepareResume, consume the record once after input/clock rebase, validate all owners and playing scope again, and reduce remaining time by elapsed monotonic time. A separate legitimate reduction is never rolled back. At0 invoke the native finish transition, including its current result snapshot and host-state event. No actor/projectile/global simulation catch-up, socket close, new duration, protocol field, server deployment or extra module is added.

Eight tests pass across0.1/5/20/120seconds, duplicate/repeated resume, old/finished/replaced matches, owner migration, excluded modes, invalid/reversed time, and independent clock reduction. Physics calls and G.time stay unchanged on the resume transition. Roster/painting/socket/RAF are bounded fixtures, not a live browser or service test.

## Explicitly unresolved

A permanently hidden host whose socket remains open can still strand a guest at0; this partial patch does not grant another peer finish/result authority. End-of-match paint is still sampled by the existing finish owner at resume, not reconstructed at an earlier wall-time boundary. OS/browser monotonic clocks that pause during sleep need separate device evidence. Boss/offline/guest/paused matches are intentionally outside this partial correction. Keep Refs878 only; no automatic closure or complete-S3-disconnect claim.
