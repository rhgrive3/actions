// Final WeaponRunner input owns the action after existing admission wrappers.
// Projectile physics, damage, paid windups and recovery clocks keep their owners.
import { replaceOnce } from './input-adapter.mjs';
export function adaptSubAction(rel, code) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replaceOnce(code, '    this.cooldown -= dt; this.emptyCd -= dt; this.rumbleT -= dt;',
    '    this.s3SubReleased = false;\n    this.cooldown -= dt; this.emptyCd -= dt; this.rumbleT -= dt;', 'clear actual sub payment receipt');
  code = replaceOnce(code, '        a.ink -= bomb.inkCost;',
    '        a.ink -= bomb.inkCost; this.s3SubReleased = true;', 'record actual sub payment');
  code = replaceOnce(code,
    '    switch (w.kind) {\n      case \'shooter\': case \'blaster\': this._auto(dt, inp, w); break;',
    `    // A committed flick/heave/blaster windup or dodge finishes before a new
    // sub action is admitted. No time or paid ink is rewound or refunded.
    const committedMain = this.flick >= 0 || this.slosh >= 0 || this.s3BlasterWindup > 0 || this.dodge || this.lockT > 0;
    if (!this.aimingSub && committedMain && (inp.sub || inp.subReleased)) {
      // Existing Dualies suppress main fire for a held sub even during travel.
      const suppressMain = w.kind === 'dualies' && inp.sub;
      inp = { ...inp, fire: suppressMain ? false : inp.fire, sub: false, subReleased: false };
    }
    const subOwns = !!inp.sub || this.aimingSub && !!inp.subReleased;
    if (subOwns) {
      // PR302 owns prepaid Splatling cancellation/refund. Reach its existing
      // sub branch before clearing presentation state; never settle ink here.
      if (w.kind === 'splatling' && this[Symbol.for('inkwave.s3.splatling.v1')]) this._splatling(dt, inp, w);
      this.cancelMainForSub();
    }
    else switch (w.kind) {
      case 'shooter': case 'blaster': this._auto(dt, inp, w); break;`, 'sub action dispatcher ownership');
  return replaceOnce(code, '  _empty() {', `  cancelMainForSub() {
    // Cancel only interruptible main state, retaining cooldown, recovery,
    // alternating-hand clocks, roll count, bloom and already-paid stream ink.
    this.a.fireBuffer = 0;
    if (this.s3RollerAttack) {
      this.s3RollerAttack = null;
      this.a.character?._s3CancelRollerFlick?.();
    }
    // An idle sub interval must not accumulate catch-up main shots.
    this.cooldown = Math.max(0, this.cooldown);
    this.charging = this.streaming = this.rolling = false;
    this.charge = this.chargeT = this.burstT = this.burstDur = this.burstFrac = 0;
    this.chargeDinged = false; this.rollT = 0; this.lastRollPos = null;
    this.chargeLoop?.stop(.05); this.chargeLoop = null;
    this.spinLoop?.stop(.08); this.spinLoop = null;
    this.rollLoop?.stop(.1); this.rollLoop = null;
    this.s3Stored = null; this.s3Turret = false;
    this.s3DualiesStart = 0; this.s3DualiesHeld = false;
    this.s3DodgeShotPending = false; this.s3SloshRecovery = false;
    this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0;
  }

  _empty() {`, 'sub cancels interruptible main state');
}
