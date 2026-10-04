# Evidence Report: INKWAVE Issue #427 Network Blockers Correction (Lane b05-agy1)

**Issue**: [#427](https://github.com/rhgrive3/actions/issues/427) — Cross-owner confirmed combat progression (Flow damage/splat/assist and s3.splatsThisLife/QuickRespawn)  
**Lane**: `/mnt/workspace/inkwave-batch-c/lanes/b05-agy1`  
**Branch**: `inkwave/batch-c-issue-427`  
**Baseline**: `origin/main` @ `8158a2b83c8e6948d0f96f1bbe0e80e987c4bafd` (post-PR #452)  
**Claim**: `/mnt/workspace/inkwave-issue-claims/427/claim.json` (Owner C preserved)

---

## 1. Network Blockers Identified in Parent Review of 555c0b1

Parent review of commit `555c0b1` identified critical network authority and validation blockers:

1. **Premature Pending Deletion (Sender Forgery Vulnerability)**:
   In `555c0b1`, `_hitAck` called `this._pendingHits.delete(h)` immediately upon finding the sequence `h`, prior to validating `from === pending.vo`. A forged or malicious sender sending an ACK with sequence `h` deleted the legitimate pending request, causing the authentic victim owner's subsequent ACK to be dropped.
2. **Missing Identity & Life Binding**:
   `d.a` and `d.v` were never verified against `pending.a` and `pending.v`, allowing an authenticated victim owner to grant credit to an arbitrary attacker. Furthermore, `pending` did not store the observed victim life (`pending.vl`), and incoming `d.vl` was ignored.
3. **Legitimate Reordered ACKs Dropped by Monotonic Counter**:
   The monotonic `peer.lastHitAck` check dropped legitimate out-of-order ACKs for distinct hits (e.g. hit 2 ACK arriving before hit 1 ACK dropped hit 1).
4. **Unretired Blocked Hits**:
   Legitimate ACKs for blocked or zero-damage hits (e.g., spawn invulnerability) failed to retire the pending entry properly.
5. **Non-strict Payload Validation**:
   Damage was not guarded against non-finite or negative values, and `killed` used loose truthiness instead of strict `0` or `1`.
6. **Stale / Dead Owner Progress & Missing Lifecycle Cleanup**:
   Hits pending across local death or respawn were not cleaned up on local actor death/respawn events.
7. **Assistant Flow Progression Omission**:
   When an earlier confirmed damage helper was waiting on an assist, the helper's client never received a terminal notification when the victim was splatted by another player or environment, leaving Flow assist progression unawarded.

---

## 2. Technical Corrections Implemented

### A. Pre-Validation of Request Identity and Payload (`_hitAck`)
In `patches/splatoon3/issue-427-adapter.mjs`, all validations are strictly performed **before** consuming the pending entry:
- **Sequence check**: `h` is a safe integer $\ge 1$, present in `_pendingHits`.
- **Sender identity**: `from !== undefined && from === pending.vo`.
- **Actor binding**: `d.v === pending.v && d.a === pending.a`.
- **Victim life**: `d.vl` is a safe non-negative integer and `d.vl === pending.vl`.
- **Payload types**: `typeof d.d === 'number' && Number.isFinite(d.d) && d.d >= 0`. No arbitrary integer damage maximum assumed (accommodating weapon/gear scaling).
- **Strict killed flag**: `d.kld === 0 || d.kld === 1`.
- **Local world actors**: Local victim exists with `v.owner === from === pending.vo`. Local attacker exists with `!atk.remote && atk.owner === this.myId === pending.ao`.
- **Attacker life & alive status**: `atk.netLife === pending.al && atk.alive`.

If any validation fails, `_hitAck` returns immediately without touching `this._pendingHits`. Forged senders cannot consume or drop valid pending requests.

### B. Per-Pending-Request Once Semantics
- Removed global `peer.lastHitAck`.
- `this._pendingHits.delete(h)` consumes the request exactly once when all validations pass.
- Legitimate reordered ACKs for distinct hits (e.g., hit 2 arriving before hit 1) each match their own pending request and are credited.
- Replays find no pending entry and are safely ignored.

### C. Authenticated Blocked ACK Retirement
- When an ACK is authenticated and valid but results in no damage or kill (`d.d === 0 && d.kld === 0`), `_pendingHits.delete(h)` retires the request without emitting `combat:confirmed`, preventing pending hit accumulation.

### D. Lifecycle Cleanup (Death, Respawn, Disconnect, Handoff)
- In `_onLocalEvent`: When local `splatted` or `respawn` fires for a local actor, any pending hits matching that actor's `nid` are immediately cleared.
- `dispose()`, `_ownership()`, and `bind(match)` each clear `_pendingHits`.

### E. Terminal-Event Assistant Integration
- When an authenticated remote victim splat event is processed in NetMatch (`_remoteSplat`), NetMatch emits `combat:terminal` with `{ victim, attacker }`.
- Flow listens to `combat:terminal`:
  ```javascript
  on('combat:terminal', ({ victim, attacker }) => {
    if (!victim) return;
    for (const [helper, time] of credits.get(victim) || []) {
      if (helper !== attacker && G.time - time <= cfg.assistWindow && !helper.remote) {
        award(helper, 'assist', 1);
      }
    }
    credits.delete(victim);
  });
  ```
- If a local helper previously dealt confirmed damage to the victim within `assistWindow`, the helper receives `award(helper, 'assist', 1)`.
- `credits.delete(victim)` ensures duplicate terminal events or ACKs cannot double-award.
- No generic `damage` or `splatted` events, UI stings, death FX, or paint scoring are duplicated.

---

## 3. Focused Test Suite Verification

All 14 tests in `patches/splatoon3/tests/issue-427.test.mjs` pass cleanly using Node VM modules (`--experimental-vm-modules`):

```
✔ negative control: unpatched main leaves shooter Flow inactive and misses splatsThisLife on attacker owner (200ms)
✔ patched: cross-owner confirmed lethal hit activates Flow and increments splatsThisLife exactly once (210ms)
✔ patched: cross-owner confirmed nonlethal hit awards damage progress without kill progression (243ms)
✔ patched: reversed owners (B shoots A) retains symmetric confirmed progression (307ms)
✔ patched: Quick Respawn is correctly withheld after cross-owner kill (noquickrespawn-afterkill) (206ms)
✔ adversarial: false sender cannot consume real ack, which subsequently grants progression (211ms)
✔ adversarial: wrong a/v/life and malformed payloads are rejected without consuming pending (216ms)
✔ adversarial: authenticated blocked ACK retires pending request without granting (213ms)
✔ adversarial: out-of-order distinct legitimate ACKs each credit without drop (223ms)
✔ adversarial: dead or stale owner cannot progress combat state and cleans up on death/respawn (228ms)
✔ adversarial: assistant receives Flow assist progression on authenticated terminal event (214ms)
✔ normal/offline: local combat retains standard progression with no duplication (110ms)
✔ patched: ownership handoff and disposal clear pending hits (133ms)
✔ patched: composition with PR400 clothing gear adapter preserves hit transactions and flow progress (235ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ duration_ms 3130ms
```

All 11 reliability integration tests in `patches/reliability/tests/combat-integration.test.mjs` also pass (11/11).

---

## 4. GitHub & Upstream Claim Audit

- **Claim**: Preserved in `/mnt/workspace/inkwave-issue-claims/427/claim.json` under owner C.
- **GitHub Audit**: Issue #427 remains solely owned and open. PR #452 merged into `origin/main` (`8158a2b`) fixing combat-life (#394) and death-burst credit (#379). The #427 adapter integrates with the named life metadata and sequence numbers without duplicating or rewriting them.
- **Wiring Hand-off**: As instructed, dispatcher wiring will be handled in the parent integration batch; `issue-427-adapter.mjs` remains self-contained with no raw `inkwave-public/` source mutations.
