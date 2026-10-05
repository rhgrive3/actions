// INKWAVE issue #196 — build-only adapter (no inkwave-public mutation).
// Narrow root: Actor._startSpecial() never clears WeaponRunner state, so a
// pre-special Charger charge (charging/charge/chargeT + charge audio loop,
// plus the S3 full-charge store) is frozen while specialActive owns the body
// and the stale release branch auto-fires after the special with no new input.
// This wrapper cancels *charger-kind only* suspended charge bookkeeping, and
// only when this call newly activates a special (native stats.specials +1 and
// specialActive null -> set). Unsuccessful attempts (no activation, e.g. an
// uncharged manual call on a weapon whose special id sets no specialActive,
// or a wrapped no-op) and unrelated weapons (splatling/slosher/roller/dualies
// etc.) are preserved. Owner/remote parity: the same native path runs for
// both; no isLocal branch. No numeric retuning: no chargeTime/ink/damage edit.
// Wiring: lane does NOT edit shared patches/splatoon3/adapter.mjs or
// profile.json — parent must import installIssue196SpecialChargeCancel and
// call it from the build install path (see install.mjs / adapter wiring).
let apiRef = null;
const INSTALLED = Symbol.for('inkwave.issue196.specialChargeCancel');
export function installIssue196SpecialChargeCancel(context) {
  apiRef = apiRef || context;
  const { Actor } = context;
  const proto = Actor?.prototype;
  if (!proto || typeof proto._startSpecial !== 'function') throw new Error('issue-196: Actor._startSpecial missing');
  if (proto[INSTALLED]) return;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeStart = proto._startSpecial;
  function cancelSuspendedCharger(runner) {
    if (!runner) return;
    // Stop the charge audio loop first (native reset() ordering), then drop
    // the suspended books. Do NOT touch cooldown/firingT/history: post-special
    // handoff timing stays native.
    try { runner.chargeLoop?.stop?.(0.05); } catch { /* audio stub may throw */ }
    runner.chargeLoop = null;
    runner.charging = false;
    runner.charge = 0;
    runner.chargeT = 0;
    runner.chargeDinged = false;
    // S3 full-charge squid store (patches runtime/weapons.mjs): a stored full
    // charge from before the special must not pop out afterwards either.
    if ('s3Stored' in runner) runner.s3Stored = null;
  }
  proto._startSpecial = function (...args) {
    const runner = this.weaponRunner;
    const kind = this.weapon?.kind;
    const activeBefore = this.specialActive;
    const specialsBefore = this.stats?.specials;
    const result = nativeStart.apply(this, args);
    // Successful native start only: this call newly set specialActive AND the
    // native exactly-once activation counter advanced. A manual/unsuccessful
    // call that activates nothing leaves prior charge state untouched.
    const activated = this.specialActive && this.specialActive !== activeBefore
      && (typeof specialsBefore !== 'number' || this.stats?.specials === specialsBefore + 1);
    if (activated && kind === 'charger') cancelSuspendedCharger(runner);
    return result;
  };
}
