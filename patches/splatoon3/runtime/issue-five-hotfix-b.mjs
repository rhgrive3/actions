const FRAME = 1 / 60;
const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.issue-five.hotfix-b');

export function installIssueFiveHotfixB({ Actor, WeaponRunner }) {
  const wr = WeaponRunner.prototype;
  if (wr[INSTALLED]) return;
  Object.defineProperty(wr, INSTALLED, { value: true });

  const reset = wr.reset;
  wr.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3BlasterMoveRemaining = 0;
    return result;
  };

  // #1067: start a dedicated movement clock only when a Blaster shot actually
  // consumes ink. It is advanced in update(), after Actor movement.
  const auto = wr._auto;
  wr._auto = function (dt, input, w) {
    const before = this.a.ink;
    const result = auto.call(this, dt, input, w);
    if (w.kind === 'blaster' && this.a.ink < before - EPS)
      this.s3BlasterMoveRemaining = w.postShotDelay;
    return result;
  };
  const update = wr.update;
  wr.update = function (dt, input) {
    this.s3BlasterMoveRemaining = Math.max(0, (this.s3BlasterMoveRemaining || 0) - dt);
    return update.call(this, dt, input);
  };
  const moveSpeed = wr.moveSpeed;
  wr.moveSpeed = function () {
    const w = this.a.weapon;
    if (w.kind === 'blaster' && (this.s3BlasterMoveRemaining || 0) > EPS &&
        Number.isFinite(w.moveSpeedFiring)) return w.moveSpeedFiring;
    return moveSpeed.call(this);
  };

  // #1070: CK cancellation owns a separate 3F refill lock. Sub/main action
  // admission is unchanged; only resource refill observes this state.
  const charger = wr._charger;
  wr._charger = function (dt, input, w) {
    if (w.kind === 'charger' && this.s3Stored && !this.a.intent?.fire) {
      this.a.s3 ||= {};
      this.a.s3.chargerKeepCancelRecover =
        Math.max(this.a.s3.chargerKeepCancelRecover || 0, 3 * FRAME);
    }
    return charger.call(this, dt, input, w);
  };
  const busy = wr.busy;
  wr.busy = function () {
    if (this.a.weapon?.kind === 'charger' &&
        (this.a.s3?.chargerKeepCancelRecover || 0) > EPS) return true;
    return busy.call(this);
  };
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    if (this.s3?.chargerKeepCancelRecover > 0)
      this.s3.chargerKeepCancelRecover =
        Math.max(0, this.s3.chargerKeepCancelRecover - dt);
    return actorUpdate.call(this, dt, ...args);
  };
  const actorReset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const result = actorReset.apply(this, args);
    if (this.s3) this.s3.chargerKeepCancelRecover = 0;
    return result;
  };
  const setWeapon = Actor.prototype.setWeapon;
  Actor.prototype.setWeapon = function (...args) {
    const result = setWeapon.apply(this, args);
    if (this.s3) this.s3.chargerKeepCancelRecover = 0;
    return result;
  };
}
