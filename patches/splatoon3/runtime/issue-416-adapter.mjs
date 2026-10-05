// Issue #416 — build-only Charger partial-charge cancel recovery.
// Splatoon 3 Ver. 11.3.0 (acceptance baseline cited by issue #416): cancelling
// an in-progress *partial* charger charge with a later ZL / squid press runs a
// documented 6-frame cancel-recovery action before ordinary squid/swim
// movement is granted. The published INKWAVE S3 wrapper instead forces
// `WeaponRunner.busy()` to false as soon as the later squid press exists, so
// Actor.update flips `form` in the same tick that receives ZL and
// `_horizontal` runs the squid path with zero recovery frames. This module
// holds the narrow correction without touching inkwave-public/, profile.json
// numbers, the legal full-charge keep (#390 / #49), post-shot submerge timing
// (#122), minimum shot-release timing (#304), the Splatling later-squid
// bypass, or any non-Charger squid transform.
//
// The gameplay build dispatcher applies this transform to weapons.mjs.

// Documented cancel recovery: 6 frames at the 60 fps reference capture =
// 0.1 s of simulation time (6 fixed 1/60 ticks). Kept in seconds so the
// boundary is identical whether the fixed step is driven directly at 30/60/
// 120 Hz or through the 60 Hz FixedClock under any render cadence.
// Source of the 6f figure: the issue #416 acceptance baseline (Splatoon 3
// Ver. 11.3.0, wikiwiki charger frame reference cited there). The cited wiki
// page is not retrievable from this environment (HTTP 403 on 2026-10-05) and
// no Switch machine capture was taken, so the value stays issue-documented
// rather than machine-verified.
export const CHARGE_CANCEL_RECOVERY = 6 / 60;
const EPS = 1e-10;

// True while the authoritative charge-cancel recovery owns the action.
export function chargeCancelActive(runner) {
  return (runner?.s3ChargeCancelT ?? 0) > EPS;
}

// The later ZL press discards the in-progress partial charge immediately and
// arms the 6f recovery. The partial charge is never stored and never fired:
// `charge` only reaches the keep (`>= .999` + held ZR) through the untouched
// full-charge path, so this can only run on a partial.
export function beginChargeCancel(runner) {
  runner.charging = false;
  runner.charge = 0;
  runner.chargeT = 0;
  runner.chargeDinged = false;
  runner.chargeLoop?.stop(.05);
  runner.chargeLoop = null;
  runner.s3ChargeCancelT = CHARGE_CANCEL_RECOVERY;
  return runner;
}

// The #416 admission predicate, shared by every call site so there is exactly
// one definition of "a later ZL/squid press is cancelling this live partial
// charge". Pure: it reads state and never mutates it, so it is safe to evaluate
// from both `busy()` and the weapon-update boundary.
export function cancelPartialAdmission(runner) {
  const a = runner?.a;
  if (!a) return false;
  return !!a.intent?.squid && a._squidPressT > a._firePressT &&
    a.weapon?.kind === 'charger' && a.form !== 'squid' &&
    !!runner.charging && runner.charge < .999;
}

// Advance the recovery once per weapon update (never per busy() read, which
// Actor.update and the ink refill both perform each tick).
export function tickChargeCancel(runner, dt) {
  runner.s3ChargeCancelT = Math.max(0, (runner.s3ChargeCancelT ?? 0) - dt);
  return runner;
}

const ISSUE_416_REL = 'patches/splatoon3/runtime/weapons.mjs';
const ISSUE_416_BUSY_ANCHOR = `  WeaponRunner.prototype.busy = function () {
    if (['charger','splatling'].includes(this.a.weapon.kind) && this.a.intent.squid && this.a._squidPressT > this.a._firePressT) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };`;
const ISSUE_416_CHARGER_HEAD_ANCHOR = '    const a = this.a, held = !!a.intent.fire;';
const ISSUE_416_CHARGER_TAIL_ANCHOR = '    return charger.call(this, dt, inp, w);';
const ISSUE_416_RESET_ANCHOR = '    this.s3SloshRecovery = false; return result;';
const ISSUE_416_IMPORT = `import { chargeCancelActive, beginChargeCancel, tickChargeCancel, cancelPartialAdmission } from './issue-416-adapter.mjs';`;

const ISSUE_416_BUSY_REPLACEMENT = `  WeaponRunner.prototype.busy = function () {
    const a = this.a;
    // Issue #416: an in-progress partial Charger charge cancelled by a later
    // ZL press starts an authoritative 6f charge-cancel recovery. Actor.update
    // reads busy() before form selection and before _horizontal, so returning
    // true here keeps the kid form — and ordinary kid movement — for the whole
    // recovery instead of diving in the same tick that receives ZL.
    if (chargeCancelActive(this)) return true;
    if (cancelPartialAdmission(this)) { beginChargeCancel(this); return true; }
    const laterSquid = !!a.intent.squid && a._squidPressT > a._firePressT;
    // Unchanged admission for every other path: the Splatling later-squid
    // press and a legal full-charge keep (stored or still held) bypass the
    // charging busy exactly as before, and a Charger with no live charge
    // falls through to the native busy() — plain dives stay 0f.
    if (laterSquid && ['charger','splatling'].includes(a.weapon.kind) &&
        (a.weapon.kind === 'splatling' || this.s3Stored || this.charging)) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };`;

const ISSUE_416_CHARGER_HEAD = `    const a = this.a, held = !!a.intent.fire;
    // Issue #416 admitted at the shared weapon-update boundary, BEFORE the
    // cancelRecovery snapshot. busy() normally arms this first, but input
    // paths that never read busy() — the main-only Super Jump prelanding kid
    // segment, which calls weaponRunner.update() directly — must run the same
    // admission or a later squid press would release the partial on ZR
    // release. Both sites share one predicate and neither decrements the
    // timer, so re-evaluating here is idempotent for the ordinary path.
    if (cancelPartialAdmission(this)) beginChargeCancel(this);
    // Snapshot the recovery for this tick, then advance it exactly once per
    // weapon update. The snapshot keeps the final recovery tick suppressing a
    // fresh charge start even as the timer reaches zero, so a held ZR can
    // never re-arm the cancel on the tick the boundary opens.
    const cancelRecovery = chargeCancelActive(this);
    tickChargeCancel(this, dt);`;
const ISSUE_416_CHARGER_TAIL = `    if (cancelRecovery) return;
    return charger.call(this, dt, inp, w);`;
const ISSUE_416_RESET = '    this.s3SloshRecovery = false; this.s3ChargeCancelT = 0; return result;';

function replaceOne(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE issue-416 anchor mismatch: expected exactly one ${label} connection.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// Fail closed on upstream drift: every connection must exist exactly once and
// the result must stay a valid module for the build dispatcher to minify.
export function adaptIssue416(rel, code) {
  if (rel !== ISSUE_416_REL) return code;
  let patched = replaceOne(code, ISSUE_416_BUSY_ANCHOR, ISSUE_416_BUSY_REPLACEMENT, 'busy override');
  patched = replaceOne(patched, ISSUE_416_CHARGER_HEAD_ANCHOR, ISSUE_416_CHARGER_HEAD, 'charger head');
  patched = replaceOne(patched, ISSUE_416_CHARGER_TAIL_ANCHOR, ISSUE_416_CHARGER_TAIL, 'charger tail');
  patched = replaceOne(patched, ISSUE_416_RESET_ANCHOR, ISSUE_416_RESET, 'reset');
  if (!patched.includes('./issue-416-adapter.mjs')) patched = `${ISSUE_416_IMPORT}\n${patched}`;
  return patched;
}
