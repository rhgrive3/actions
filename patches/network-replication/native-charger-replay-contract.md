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

The current producer appends aim-point x/y/z requests to the original17 fields (20 total). The bounded v2 schema retains17-field landed-source frames for compatibility; initial-spawn replay requires all20. The original fields are: serial, exact dt, exact source G.time, raw button bits,
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
| Actual Turf opening/respawn | The current continuation recreates initial aim through `beginInitialSquidSpawn` only from the receiver bind-time initial lifecycle. It runs wait, legal target/steering, flight, landing and native resource/weapon phases; requests never set position, ink or grounded. Matched trusted Match phases pass, including an intro followed by playing. A retained intro prefix arriving after the receiver has changed phase still retires proof on the first native body mismatch. Trusted historical Match/world ordering, post-death enrollment and later lives remain unsupported. Never skip these frames or bootstrap ink from an owner landing snapshot. |
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

## Isolated experimental candidate QA

The source-equivalent candidate is `9d8efc505352e161beed3cd56632f39a5b40d31e`
(tree `3be81c11aa220f2d49d9dd4c6ef63d17f2fb01b9`), built on published clock-only
`4a969a9ea23147519897e788b3e97562a22c3bd2`. This is an experimental source
object, not a deployed production change. Production-format build input/output
hash verification passed in the isolated tree; runtime source stayed fixed.

Initial complete network run:125 files,865 tests,839 pass/26 fail in873.4s.
All148 hashed runtime/test inputs matched before/after. Failures were21 old
26-column expectations,3 old display-Y/physical-Y expectations, and2 metadata
fixture files lacking newly audited native boundaries. They are preserved in
the raw report; the full125-file run was not repeated or called all green.

Lab-only test migration keeps strict27 columns, existing adoption23/Surge24/
accepted-hit25 assertions, and exact tagged raw-input/r3 physicalY tuple26.
Legacy22–25 cases remain and26 is added. Malformed present tuple26 is rejected
as an actor row, while the enclosing valid packet clock still advances; a
subsequent genuine owner tick recovers. Same-timestamp packet retries remain
rejected by the existing strict packet-clock policy. Metadata tests explicitly
audit new imports, reject native capabilities with throwing stubs, and extract
the actual pure selector and Boss receipt prefix. Missing/duplicate native
Boss guard rejection is tested; no runtime guard was relaxed.

All88 tests across the12 affected files pass on their final file revisions,
combined from the bounded migration runs. These are separate from source155
(coherent113 plus outbound42) and independent54 results above. The new receiver
16th case creates actual initial Squid Spawn on both source and receiver before
bind, retains the same enrolled life, accepts all3 source frames with resource0/
effective-null, and rejects the new proof as another action owner. Normal actor
snapshots continue; a later owner snapshot does not recreate the private budget.
This confirms the unsupported ordinary first Turf life described above.


## 2026-10-23 initial-spawn continuation

The former first-life rejection above describes the retained historical run. Current source no longer treats all resource0/effective-null rows as unsupported: only a private initial Squid Spawn created from trusted bind state can execute them. Both the actual resource-phase presence and the phase body witness are checked against the private Actor; zeroes are not permission to skip native work. Aim-point coordinates are bounded input requests. Native target clamping and Physics resolve them. The private resource hook captures body at the same resource phase as the producer, including a later landing handoff.

Final focused receiver24/24 and native-input/replay/actual-Worker quota39/39 pass under Node22.23.4. The receiver selection includes normal initial wait/flight/steering/landing/first full shot at30/60/120Hz, native ink equality, one-use launch receipts, four co-forged initial witnesses, current intro→playing, and fail-closed delayed historical intro. These are separate suites, not a full125-file rerun or browser/device acceptance. Normal8 relay runs keep4,800 source frames and200 packets per10seconds, maximum145,715 wire bytes/second, below the unchanged256KiB limit;32-actor defensive stress still explicitly closes1008.

No mandatory damage-gate connection, other64 mains, trusted historical paint/Match phases, later-life enrollment or migration is completed by this continuation. #1665/#1666 remain open.

## 2026-10-24 aim request binding and initialization repair

The optional receiver birth proof now verifies the requested event direction with the actual native `Projectiles._aimFrom` owner, using immutable aim-point and aim-direction snapshots captured at the private source launch. Native Charger vectors are already lossless on the wire, so no new quantization or aim model is introduced. This includes native close-target and rear-hemisphere fallbacks. A later input's aim cannot rewrite an earlier launch. Branded, live, unspent launch membership remains required; copied/retired/spent handles do not authorize aim. Legacy17-field rows can still execute resource replay, but cannot authorize an aim-point-bound birth without those missing input requests.

A before-change dual-peer counterexample fired a genuine native shot and forged only the outgoing direction; the old optional matcher accepted it. The new negative rejects it while far/near/behind positives and later-aim changes pass. This hardens the *optional proof*, not the capture-ledger damage path, and does not complete #1665/#1666.

The previous initial-spawn continuation also introduced a dependency cycle: ctx's tiny replay-event guard imported replay -> composed respawn lifecycle -> native engine -> minimap -> ctx before its event bus initialized. The existing native contact suite reproduces this on the unchanged a8da7f29 baseline. The S3 installer now supplies the native initial-spawn callback to replay at installation, removing that reverse static import. No event bus preinitialization, fixture stubs or source adapter bypass is used.

Final focused source validation is108/108 across receiver, native driver, input producer, actual relay quota and existing PvP/Boss contact authority. Earlier69pass/1file initialization failure and the before-change forged-direction failure remain recorded. Full network/production-format build follow separately. These are not hardware, browser or Nintendo executable comparisons; mandatory damage handoff, historical world/Match order, later lives and other weapon owners remain unresolved.

### 2026-10-24 matched-proof lifetime supplement

A matched optional birth proof now retains the original receiver observation instant and exact immutable event signature. It expires after the same1.4 receiver-second bound already used for pending births, even if no new source inputs advance the private simulation clock. Lookup also requires the original event payload/tick/sequence and a still-live unspent native launch, so another request cannot expose a stale alias after the first commits. Source clock timestamps and owner fields do not fund an extension. Before-change receiver regressions for frozen-source expiry, payload mutation and shared-launch aliasing all failed; final focused source111/111 passes. This remains optional-proof hardening, not a mandatory damage-gate completion.
