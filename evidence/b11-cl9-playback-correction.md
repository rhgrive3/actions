# Evidence: INKWAVE Issue #477 Network Playback & Admission Corrections (b11-cl9)

## 1. Overview of Corrections

Following review of initial replication for Issue #477 (Splat Dualies 4F pre-roll startup before 12F roll movement), three concrete network acceptance gaps were resolved in `patches/splatoon3/issue-477-adapter.mjs`:

### Gap A: Playback Time Advancement Between Owner Packets
- **Problem**: `rl.time` remained constant between 20 Hz owner packets (50 ms) because Hermite interpolation and extrapolation copied constant sidecar time without advancing `S.t`. Remote proxy startup froze until the next packet, overrunning the 4F window.
- **Fix**: Phase age is derived directly from `peer.playback tr` (existing native owner clock) minus accepted packet timestamp `origT`, bounded by existing 0.18s extrapolation.
  - Phase time is a deterministic pure function of owner state + playback time (not an accumulating `+= dt` clock).
  - Calling `applyRemote` repeatedly on the same playback `tr` is idempotent and cannot double-advance.
  - In Hermite interpolation halfway between packets, discrete roll state comes from the earlier snapshot; next new roll does not reveal future token early.
  - When startup remaining expires during dry buffer extrapolation, remote proxy smoothly transitions to genuine moving roll.

### Gap B: Scoped Token Admission (Owner & Life Epoch)
- **Problem**: `a.net.lastRollToken` was globally actor-scoped, rejecting token 1 forever after host handoff, reconnect, or new life if a previous owner reached token > 1.
- **Fix**: Scoped token admission to `(current owner, accepted snapshot life)`:
  - Resets coherently on `_adopt(a)`, `actor.reset()`, and `netLife` epoch transitions.
  - New owner or new life starting with token 1 is legitimately admitted.
  - Late packets from old owners or old lives are rejected by existing admission.
  - Roll scalar data is validated (finite, bounded, non-negative, valid phase `'startup'` | `'roll'`); invalid/legacy packets gracefully fall back to native uncoordinated roll without poisoning `lastRollToken`.

### Gap C: Non-Destructive Broadcast Boundary & Composition
- **Problem**: Exact replacement of `const msg = ...` in `_sendTick()` conflicted when composed with PR495 #484 named `sc` sidecar.
- **Fix**: Attached `msg.rl` at the unique `this.stats.out++` / `this.s.tr?.broadcast(msg)` boundary.
  - Preserves any existing `l` (combat-life), `sc` (special cost), reserved actor tuple slot 21, and flag bit 20.
  - Bidirectionally compatible with PR495 #484 in both composition orders (`477-then-484` and `484-then-477`).
  - Includes validated native authoritative `_dodgeDir` in `rl` for remote pose calculation without independent remote physics simulation.

## 2. Test Verification

### Issue #477 Test Suite (`patches/splatoon3/tests/issue-477.test.mjs`)
- Total tests: 14 / 14 passing (0 failing, 0 skipped):
  1. Negative Control: unpatched baseline lacks 4F startup and immediately imparts roll velocity
  2. Patched: exactly 4F startup with 0 roll displacement before 12F roll movement begins
  3. Movement duration remains exactly 12F and total roll displacement is exactly w.rollDist
  4. Visible anticipation/roll pose follows startup -> moving-roll boundary
  5. Post-roll firing remains its own 4F gate and is not folded into startup
  6. Two chained rolls preserve 4F startup on each accepted roll
  7. 30/60/120 Hz render schedules over the same fixed simulation produce identical boundary ticks
  8. Remote presentation parity: actual native NetMatch transport (late-start, moving, chained, stale, legacy, lifecycle)
  9. Gap A: Playback time advancement on NetMatch (Hermite halfway, dry buffer extrapolation, idempotent same TR, future roll protection)
  10. Gap B: Token admission scoped to owner and accepted life epoch (handoff, new life, stale rejection, reset/adopt cleanup, invalid scalar fallback)
  11. Gap C: Composition in both orders with PR495 #484 adapter and production reliability pipeline
  12. Negative real Actor/WeaponRunner state: special activation preserves non-dualies weapons and failed special states
  13. Cancellation by splat, special, form, and weapon change clears startup and cannot replay a stale roll
  14. Negative Controls: non-dualies weapons and invalid dodge conditions are rejected

### Adjacent Regression Test Suites
- `patches/reliability/tests/combat-life.test.mjs`: 10 / 10 passing
- `patches/splatoon3/tests/dualies-motion.test.mjs`: 9 / 9 passing

## 3. Physical Limitations & Status
- **Physical joint angles**: Exact Nintendo Splatoon 3 joint angles remain unmeasured (`physicalNintendoanglesunmeasured = true`); calibrated rig tuck is applied.
- **Whole-batch integration**: Parent owns final whole-batch integration, review, and verification.
