# Native Charger source replay contract

This is an experimental implementation boundary for #1665/#1666, limited to the
base native Splat Charger, 1/65 main weapon owners. The damage path in this experimental tree still
uses `charger-contact-authority.mjs` capture-ledger admission and actual source
finite-flight contact capabilities; this branch is not deployed. The published
clock-only branch does not contain these contact/runtime changes. The new private native-source proof is now
connected to NetMatch input/FIFO/lifecycle, but **is not a mandatory damage gate**.
No completed authority fix or production readiness is claimed.

The comparison baseline is Splatoon 3 11.3.0, native Splat Charger, default and
equipped main/sub ink saver and recovery gear. The driver reuses existing
INKWAVE source behavior; it adds no inferred Nintendo timing or movement values.
The tests below are source/CPU tests, not browser or Switch measurements.

## Implemented boundary

`runtime/native-charger-input.mjs` captures actual source Actor updates, resource
phase and final WeaponRunner input. Exact double dt/time, per-life serials, raw
buttons/move/aim and body/effective/form witnesses survive local send rejection.
`outbound-prefix.mjs` commits the exact prefix only after transport acceptance
and identity checks. Existing actor slots23/24/25 and the maximum27-column body
schema remain intact. The separate, compatibility-hashed `ci` version2 envelope
is validated before owner timeline watermarks advance.

Each frame has17 fields: serial, exact dt, exact source G.time, raw button bits,
effective weapon input witness, physical x/y/z, vertical velocity, form witness,
aim yaw/pitch, move x/z, resource-phase witness, source event sequence before the
frame, and global local-owner capture order. Raw bits are fire1, squid2, sub4,
jump8 and special16. Each transmitted actor batch includes the latest captured
serial/time checkpoint. That checkpoint may be newer than its transmitted
prefix; its canonical actor physical body can only verify the matching later
source frame. No time, input, button edge or body is interpolated or quantized.

`runtime/native-charger-replay.mjs` creates a private actual Actor and executes
the installed Actor.update, Physics, updateResources and final WeaponRunner.
Incoming charge/ink/grounded values never initialize resources or clocks. Raw
input passes through the native pre-admission/form/keep/R owners. Body,
effective input and form are witnesses compared against that execution; they
cannot assign the private actor pose or grant charge. Rendering, finish-frame
presentation, audio, FX, input and world/network output are sinks. Actual native
sub debit/preparation runs and only the private bomb birth is suppressed.
An unready Special press remains a native no-op; Special earning/activation is
not contracted by this replay.

The installed flight computes private-shot damage, cost, speed and range using
the same calculation as normal source launches. WeakMap membership enrolls the
private actor. Its launch receipt is branded, bounded, single-use, and tied to
actual owner/life/weapon/net/match/level/physics/world/generation. A copied
object, owner flag, replaced life, weapon, world or retired driver cannot spend
it. Peek does not consume a launch; commit consumes it once.

`receiver-charger-input.mjs` now connects that driver to actual NetMatch:

- Bind captures native remote actors' source-generated spawn/velocity/yaw/life
  **before any owner snapshots**. Accepted equipment identities are installed
  through source gear setup; later equipment transitions retire the new proof.
  No later owner row enrolls a life or restores a fresh100ink budget.
- Accepted member/clock/actor rows enroll input only after oldTick acceptance.
  Exact retained duplicates are deduplicated. Serial/time/order gaps retire the
  new proof instead of inventing held inputs. First-frame `time-dt` aligns an
  arbitrary simulation-clock origin only; cumulative dt is separately bounded
  by receiver elapsed time from the fixed bind instant. Packet.u's grace does
  not fund a private replay.
- Frame execution respects accepted peer simulation time, event tick, source
  before-event sequence and same-owner global capture order. Frames before an
  event run before native oldPlay; frames depending on that event run afterward.
  Actual same-tick feet paint therefore precedes later source swim/resources.
  This is same-owner FIFO causality, not a cross-owner world rollback.
- A fire event may precede its input prefix. A separate bounded pending set
  waits for an actual source launch and canonical actor checkpoint. The normal
  FIFO continues. Native tick/charge/full, range and actual exact muzzle/body
  segment must match before a private receiver birth proof is exposed. Missing
  prefixes expire even when no frames execute; invalid requests do not consume
  a valid launch. Commit is one-use. This proof is not yet consumed by the
  experimental damage path; actual flight/capsule/terrain/Boss gates remain.
- Death/life/owner/net/weapon replacement, leave, host change, disposal, match,
  level, physics and world clear revoke the new driver/proofs. New owner body
  snapshots cannot reenroll it. Unsupported motion retires only the new proof;
  existing normal replication/gameplay remains active.

Producer bounds remain32actors,4096frames,512KiB total,512frames/channel and
256frames/24KiB per packet. Receiver bounds are32actors,4096frames,512KiB total,
512frames/channel,512 exact history frames,32 canonical checkpoints/channel,
256 replay steps/advance call,256 pending births total and48/channel. Pending
birth TTL is1.4 receiver seconds; private source launch TTL is1.4 source seconds.
No relay limits or accepted server envelope were expanded.

## Required contracts before mandatory damage admission

| Boundary | Remaining trusted contract |
| --- | --- |
| Complete world order | Replay must see correct multi-owner historical paint/world state and source-earned turf credit at each frame. Current same-owner native FIFO order does not prove shared-world rollback, late paint precommit or Special credit. |
| External displacement | Match applies soft pushes after Actor.update; hits/actions apply knockback between frames. Receiver remote proxies and source owners have different weights/interpolation, so receiver-local Match pushes alone cannot reproduce source pushes. Supply trusted actual contact/impulse history or authoritative multi-actor replay. Assigning body witnesses would reopen the floating-ground bypass. |
| Other actions | Supply trusted SuperJump destination/admission/lifecycle, earned Special activation/body/refill, conditional/transient gear and deployed support. Owner active/ink/charge/grounded/modifier flags are insufficient. |
| Late join/loading/migration | Inputs currently drain on local transport acceptance. A delayed first owner-clock packet may omit earlier input. Missing serials retire proof; they never start a fresh resource budget. Mandatory admission requires trusted replay checkpoints or per-peer retained original-life history/acknowledgment, including bounded loading and paused clocks. |
| Damage handoff | Replace capture-ledger admission only when every legal native action above can mint a matching source proof. Successful actual receiver source-flight admission must atomically commit that launch and preserve later actual collision capabilities. No owner-flag or sampled-scalar fallback may bypass a missing proof. |
| Other64 main owners | Source-native input/resource/action replay and actual collision capabilities are still required for their respective main owners; global #1665/#1666 remain open. |

## Validation at this boundary

- Producer15/15: actual30/60/120Hz capture, exact dt/order,16.7ms R tap,
  rejection/retry, append during send,32actor fairness, frame/event quotas,
  explicit bounded abort, lifecycle/session replacement and schema.
- Driver20/20: full/partial charge at30/60/120Hz; every-frame ink, lastFire,
  kidT and charge equality for14F/32F/63F R cancellation; equipped gear;
  low-ink held recovery; keep31F; air/landing/jump/movement; sub debit;
  forged witnesses/serial/time; branded launch/lifecycle.
- Authority39/39: actual source flight/capsule/OBB/Boss contacts and previous
  capture-ledger regressions, including the corrected stored-R behavior below.
- Receiver15/15 uses two independently composed production-runtime VM peers:
  real Actor/Physics/NetSession/NetMatch/Projectiles, arbitrary source-clock
  offset, fixed elapsed budget, exact retry, gap/body rejection, FIFO pending,
  forged full birth against minimum source charge, native unready Special,
  same-tick native feet paint followed by actual postshot-gated squid movement,
  idle pending TTL and life/owner/world/leave/host-change revocation.
- Actual Worker/RoomDurableObject relay4/4: config MATCH.teamSize4 and native
  NetSession two-team generation produce a normal maximum8actors (also Boss8).
  Dense changing source controls at30/60/120Hz rendering each carry600 native
  ticks/4800 source frames over200 packets/10s. Each peaks142835 bytes/second,
  total1406387 bytes, all frames drained, no close under unchanged256KiB/s
  relay quota. The32actor defensive stress explicitly hits1008 Relay traffic
  limit at38 wire frames and retains bounded input state.32 is a guard bound,
  not a supported normal gameplay roster or silent quota expansion.

Logs are under `.ci-scratch/combat-authority/`: `native-receiver-coherent.log`,
`native-receiver-dual.log`, `native-relay-quota.log` and previous
`native-driver-source-final.log`/`native-driver-foundation.log`.

The old foundation positive claiming R preserves stored keep was wrong. The
outer fresh-charge predicate excludes stored keep from its5F interruption
classification, but inner native `mainSubOwns -> cancelMainForSub` still clears
`s3Stored`. Source owner/private replay confirm this. Experimental capture-ledger admission now
rejects full keep after R while retaining late FIFO for a ready shot released
before a later R capture.

Exact private-driver ink equality does not make the current experimental
capture-ledger resource model complete. Its documented normal cancellation
residual remains. No browser/GPU/Switch validation of this receiver stage has
been performed; no conclusion about Nintendo-network equivalence is inferred.
