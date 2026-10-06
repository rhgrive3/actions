import { specialMotionAllowsAction } from './action-admission.mjs';
import { ROLLER_DRUM } from './roller-model.mjs';
// Roller-specific refinements. Timing comes from the existing gameplay profile;
// joint curves are visual calibration against Nintendo's public roller videos.
const EPS = 1e-10;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const READY_ANCHOR = [-.08, .80, .28];
const READY_ROTATION = [-2.5, .04, 1.0];
const ROLL_ANCHOR = [-.07, .75, .34];
const ROLL_ROTATION = [.36, .06, 0];
const ROLL_LEAN = [.14, .06, .12, .05];
const DRUM_LIFT = .1015 * (ROLLER_DRUM.radius - 1);
// Vertical swing handle pitch: coil overhead, release level, follow-through.
// local-quality's release-velocity repair reads the same angles.
export const VERTICAL_SWING = Object.freeze({ coil: -2.45, release: -.04, follow: .6 });
// Read-only view for regressions; the arrays stay owned by this module.
export const ROLLER_POSE = Object.freeze({ READY_ANCHOR, READY_ROTATION, ROLL_ANCHOR, ROLL_ROTATION, ROLL_LEAN });

// Issue #635: gates after flick release, independent of roll-stop locks.
const POST_SUB = { horizontal: 14 / 60, vertical: 18 / 60 };
const POST_SQUID = { horizontal: 15 / 60, vertical: 19 / 60 };

function observedLife(actor) {
  if (Number.isSafeInteger(actor?.netLife)) return actor.netLife;
  if (Number.isSafeInteger(actor?.net?.lastLife)) return actor.net.lastLife;
  return null;
}

function resolveRollHitEpochs(runner) {
  const epochs = runner.s3RollHitEpochs;
  if (!epochs?.size) return;
  for (const [victim, epoch] of epochs) {
    const life = observedLife(victim);
    if (!victim.alive || !victim.remote || victim.owner !== epoch.owner || life !== epoch.life) {
      if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
      runner.s3PendingRollHits.delete(victim);
      epochs.delete(victim);
      runner.rollHits.delete(victim);
    }
  }
}

export function rollerMode(w, vertical) {
  return vertical ? { ...w, flickWindup: w.verticalWindup, flickInterval: w.verticalInterval ?? w.flickInterval, flickInk: w.verticalInk } : w;
}

// Action-interruption windows that start when an authoritative roll ENDS.
export const ROLL_STOP_LOCKS = Object.freeze({ main: 16 / 60, sub: 5 / 60, squid: 6 / 60 });
export function rollStopBlocks(now, locks) {
  if (!locks) return { main: false, sub: false, squid: false };
  return { main: now < locks.main - EPS, sub: now < locks.sub - EPS, squid: now < locks.squid - EPS };
}
export function rollStopLocks(now) {
  return { main: now + ROLL_STOP_LOCKS.main, sub: now + ROLL_STOP_LOCKS.sub, squid: now + ROLL_STOP_LOCKS.squid };
}

export function installRollerLogic({ WeaponRunner, Actor, G, on }, _profile) {
  const roller = WeaponRunner.prototype._roller, reset = WeaponRunner.prototype.reset, actorUpdate = Actor.prototype.update;
  const runnerUpdate = WeaponRunner.prototype.update;
  Actor.prototype.update = function (dt) {
    const r = this.weaponRunner;
    if (r && this.weapon?.kind === 'roller') {
      const prev = this._prevIntent || {};
      if (this.intent?.fire && !prev.fire) r.s3RollerSquidPressT = this.form === 'squid' ? G.time : null;
      if (!this.alive || this.specialActive || this.superJumpState) r.s3RollerSquidPressT = null;
    }
    return actorUpdate.call(this, dt);
  };

  const armsInterruption = runner => {
    const a = runner.a;
    return a.grounded && a.ink > 0.5 && runner.flick < 0;
  };
  const rollWillStop = (runner, fire) => {
    const a = runner.a;
    return runner.rolling === true && !fire && armsInterruption(runner);
  };
  const armAheadOf = (runner, now, fire) => {
    const live = rollStopBlocks(now, runner.s3RollStop);
    if ((live.main || live.sub || live.squid) || !rollWillStop(runner, fire)) return false;
    runner.s3RollStop = rollStopLocks(now);
    return true;
  };
  const disarmIf = (runner, armed) => {
    if (armed && (runner.rolling === true || !armsInterruption(runner))) runner.s3RollStop = null;
  };
  WeaponRunner.prototype.update = function (dt, inp = {}) {
    const now = G.time;
    const armed = armAheadOf(this, now, !!inp.fire);
    const locks = this.s3RollStop;
    let input = inp;
    if (this.s3FlickPostSub > 0 && (input.sub || input.subReleased)) input = { ...input, sub: false, subReleased: false };
    if (locks && this.a.weapon?.kind === 'roller') {
      const blocked = rollStopBlocks(now, locks);
      if (blocked.main || blocked.sub) {
        input = { ...input };
        if (blocked.main && !armed) { input.fire = false; input.firePressed = false; }
        if (blocked.sub) { input.sub = false; input.subReleased = false; }
      }
    }
    const wasRolling = this.rolling === true;
    const result = runnerUpdate.call(this, dt, input);
    disarmIf(this, armed);
    if (wasRolling && this.rolling !== true && armsInterruption(this)) this.s3RollStop = rollStopLocks(now);
    return result;
  };

  const rollStopActorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...rest) {
    const runner = this.weaponRunner;
    if (!runner) return rollStopActorUpdate.call(this, dt, ...rest);
    const now = G.time;
    const armed = armAheadOf(runner, now, !!(this.intent?.fire || this.fireBuffer > 0));
    const blockSquid = rollStopBlocks(now, runner.s3RollStop).squid;
    if (blockSquid && this.intent?.squid) {
      const held = this.intent.squid;
      this.intent.squid = false;
      try { return rollStopActorUpdate.call(this, dt, ...rest); }
      finally { this.intent.squid = held; disarmIf(runner, armed); }
    }
    try { return rollStopActorUpdate.call(this, dt, ...rest); }
    finally { disarmIf(runner, armed); }
  };

  const resolveRemoteContact = (event, accepted) => {
    const attacker = event?.attacker, victim = event?.victim;
    const runner = attacker?.weaponRunner;
    const pending = runner?.a === attacker && runner.s3PendingRollHits?.get(victim);
    if (!pending || runner.s3RollHitConfirmDisabled.has(victim) || !victim?.remote
      || pending.owner !== victim.owner || pending.life !== observedLife(victim)) return;
    const exactWeapon = event.weaponId === pending.weaponId;
    const exactContact = exactWeapon && event.damage === pending.damage;
    if (accepted ? (!exactWeapon || (!event.killed && !exactContact)) : !exactContact) return;
    runner.s3PendingRollHits.delete(victim);
    if (accepted) runner.rollHits.set(victim, G.time);
    else runner.rollHits.delete(victim);
  };
  // Existing events have no hit-request ID. One outstanding request can be
  // correlated; when native contact cadence sends another packet, retire ACK
  // matching for this victim so a late earlier event cannot settle the newer hit.
  on?.('hit', event => resolveRemoteContact(event, true));
  on?.('hit:rejected', event => resolveRemoteContact(event, false));
  WeaponRunner.prototype.reset = function (...args) {
    const uncorrelated = this.s3RollHitConfirmDisabled || new WeakSet();
    for (const victim of this.s3PendingRollHits?.keys() || []) uncorrelated.add(victim);
    const result = reset.apply(this, args);
    this.s3RollerAttack = null;
    this.s3RollerSquidPressT = null;
    this.s3PendingRollHits = new Map();
    this.s3RollHitEpochs = new Map();
    this.s3RollHitConfirmDisabled = uncorrelated;
    this.s3RollStop = null;
    this.s3FlickPostSub = 0; this.s3FlickPostSquid = 0;
    if (this.a.character) {
      this.a.character.s3RollerFlick = null;
      this.a.character._s3CancelRollerFlick?.();
    }
    return result;
  };
  WeaponRunner.prototype._roller = function (dt, inp, w) {
    const a = this.a;
    resolveRollHitEpochs(this);
    if (this.s3FlickPostSub > 0) {
      this.s3FlickPostSub -= dt;
      if (this.s3FlickPostSub < EPS) this.s3FlickPostSub = 0;
    }
    if (this.s3FlickPostSquid > 0) {
      this.s3FlickPostSquid -= dt;
      if (this.s3FlickPostSquid < EPS) this.s3FlickPostSquid = 0;
    }
    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);
    if (starting) {
      this.cooldown = Math.min(0, this.cooldown);
      this.s3FlickVertical = !a.grounded;
      const mode = rollerMode(w, this.s3FlickVertical);
      let windup = mode.flickWindup;
      if (!this.s3FlickVertical && Number.isFinite(this.s3RollerSquidPressT)) {
        const elapsed = Math.max(0, G.time - this.s3RollerSquidPressT);
        windup = Math.max(EPS, 34 / 60 - elapsed);
      }
      this.s3RollerAttack = { vertical: this.s3FlickVertical, windup, interval: mode.flickInterval, elapsed: 0, released: false, rolling: false };
      this.s3RollerSquidPressT = null;
      a.character.s3RollerFlick = this.s3RollerAttack;
      // Starting a new flick lifts the drum. The public runner otherwise leaves
      // rolling=true through its early windup return, including in the air.
      this.rolling = false; this.rollT = 0;
      this.rollLoop?.stop(.12); this.rollLoop = null;
    }
    const state = this.s3RollerAttack;
    const vertical = state ? state.vertical : this.s3FlickVertical;
    let mode = rollerMode(w, vertical);
    if (state) mode = { ...mode, flickWindup: state.windup, flickInterval: state.interval };
    const winding = this.flick >= 0;
    if (state && !starting) state.elapsed += dt;
    // Float accumulation must not add a 22nd/27th tick to a 21F/26F windup.
    if (winding && this.flick + dt + EPS >= mode.flickWindup) this.flick = mode.flickWindup;
    let rollInp = inp;
    if (state && state.released) {
      const rollDelay = state.vertical ? (22 / 60) : (7 / 60);
      const postRelease = state.elapsed - state.windup;
      if (postRelease + EPS < rollDelay) rollInp = inp.fire ? { ...inp, fire: false } : inp;
    }
    const projectiles = G.projectiles, applyHit = projectiles?.applyHit;
    let result;
    if (typeof applyHit === 'function') {
      const runner = this;
      const admittedHit = function (attacker, victim, ...args) {
        const admission = applyHit.call(this, attacker, victim, ...args);
        if (attacker === a && args[1] === 'roller') {
          if (admission === 'rejected') {
            if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
            runner.s3PendingRollHits.delete(victim);
            runner.rollHits.delete(victim);
          } else if (admission === 'rejected-invulnerable') {
            if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
            runner.s3PendingRollHits.delete(victim);
            runner.rollHits.delete(victim);
          } else if (admission === 'pending') {
            runner.s3RollHitEpochs.set(victim, { owner: victim.owner, life: observedLife(victim) });
            if (runner.s3RollHitConfirmDisabled.has(victim) || runner.s3PendingRollHits.has(victim)) {
              runner.s3PendingRollHits.delete(victim);
              runner.s3RollHitConfirmDisabled.add(victim);
            } else {
              runner.s3PendingRollHits.set(victim, {
                owner: victim.owner, life: observedLife(victim), damage: args[0], weaponId: args[1],
              });
            }
          }
        }
        return admission;
      };
      projectiles.applyHit = admittedHit;
      try { result = roller.call(this, dt, rollInp, mode); }
      finally { if (projectiles.applyHit === admittedHit) projectiles.applyHit = applyHit; }
    } else result = roller.call(this, dt, rollInp, mode);
    if (state) state.rolling = this.rolling;
    if (state && winding && this.flick < 0) {
      state.elapsed = mode.flickWindup;
      state.released = true;
      // InkRecoverStop belongs to this actual release, not the paid windup.
      if (!a.remote) {
        a.lastFire = 0;
        a.s3 ||= {};
        const delay = state.vertical ? w.verticalInkRecoverStop ?? w.inkRecoverStop : w.inkRecoverStop;
        a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining || 0, delay || 0);
      }
      const edge = this.s3FlickVertical ? 'vertical' : 'horizontal';
      this.s3FlickPostSub = Math.max(0, POST_SUB[edge] - dt);
      this.s3FlickPostSquid = Math.max(0, POST_SQUID[edge] - dt);
    }
    if (state && state.released) {
      const rollDelay = state.vertical ? (22 / 60) : (7 / 60);
      const postRelease = state.elapsed - state.windup;
      if (state.rolling) {
        if (a.character ? (a.character.wRoll >= 0.95 || postRelease >= rollDelay + 0.25) : postRelease >= rollDelay + 0.1) {
          this.s3RollerAttack = null;
          if (a.character) a.character.s3RollerFlick = null;
        }
      } else if (!inp.fire && state.elapsed + EPS >= state.interval) {
        this.s3RollerAttack = null;
        if (a.character) a.character.s3RollerFlick = null;
      } else if (state.elapsed + EPS >= Math.max(state.interval, state.windup + rollDelay) && !a.grounded) {
        this.s3RollerAttack = null;
        if (a.character) a.character.s3RollerFlick = null;
      }
    }
    return result;
  };
}

// The X axis across the drum turns upright around the handle (local +Z).
// This is a pose target for the existing two-arm IK, not a second bone rig.
export function verticalRollerPose(elapsed, windup, interval) {
  const coil = ease(elapsed / (windup * .68));
  const whip = ease((elapsed - windup * .76) / (windup * .24));
  const follow = ease((elapsed - windup) / .12);
  const recover = ease((elapsed - windup - .12) / Math.max(.01, interval - windup - .12));
  const weight = ease(elapsed / (2 / 60)) * (1 - recover);
  const anchor = [mix(READY_ANCHOR[0], .015, coil), mix(READY_ANCHOR[1], 1.11, coil), mix(READY_ANCHOR[2], .025, coil)];
  const rotation = [mix(READY_ROTATION[0], VERTICAL_SWING.coil, coil), mix(READY_ROTATION[1], .015, coil), mix(READY_ROTATION[2], Math.PI / 2, coil)];
  // Keep the upright drum clear of the floor through its follow-through. A
  // horizontal carry-height target clips the lower cap while the axis is tilted.
  const release = [-.025, 1.05, .23], end = [-.025, 1.12, .28];
  for (let i = 0; i < 3; i++) anchor[i] = mix(mix(anchor[i], release[i], whip), end[i], follow);
  rotation[0] = mix(mix(rotation[0], VERTICAL_SWING.release, whip), VERTICAL_SWING.follow, follow);
  rotation[1] = mix(rotation[1], 0, whip);
  // The drum lands across the front: an upright drum as wide as the Inkling is
  // tall would drive its lower end into the floor at the bottom of the slam.
  rotation[2] = mix(rotation[2], ROLL_ROTATION[2], follow);
  return { anchor, rotation, weight, coil: coil * (1 - whip), whip: whip * (1 - recover) };
}

export function installRollerMotion({ Character, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T) throw new Error('Roller motion requires exact upstream Character channels and timers');
  const flick = Character.prototype._poseFlick, animate = Character.prototype._animWeapon, setWeapon = Character.prototype.setWeapon;
  const updateStates = Character.prototype._updateStates, weaponPose = Character.prototype._poseWeapon;
  Character.prototype._s3CancelRollerFlick = function () {
    this.s3RollerFlick = null;
    // A cancelled runner must not fall back to the legacy 0.7s pose or its
    // 0.15s drum impulse on the next Character frame.
    if (this.tr) this.tr[T.T_FLICK] = 99;
    if (this._wst) this._wst.flickReleaseTime = undefined;
  };
  Character.prototype._updateStates = function (dt, s) {
    const previous = this.wRoll;
    const result = updateStates.call(this, dt, s);
    if (this.weaponKind === 'roller') {
      // The runner owns whether the drum is rolling. A fixed 0.6s flick timer
      // otherwise delays the arms after gameplay has already resumed painting.
      const rolling = this.kidForm && this.grounded && !this.dance && !!s.rolling;
      this.wRoll = mix(previous, rolling ? 1 : 0, 1 - Math.exp(-(rolling ? 14 : 6) * dt));
    }
    return result;
  };
  Character.prototype._poseWeapon = function (dt, s) {
    const result = weaponPose.call(this, dt, s);
    if (this.weaponKind !== 'roller' || !this.kidForm || this.dance || this.wSub > .01) return result;
    if (T && (!specialMotionAllowsAction(this,this.tr[T.T_LEAP] >= 1.9 && this.tr[T.T_SLAM] >= 1.4) || this.tr[T.T_DODGE] < this.dodgeDur || this.tr[T.T_SPAWN] < 1.4)) return result;
    // Official footage carries the raised drum behind the shoulder, then lowers
    // it only to roll. These targets are rig calibration, not Nintendo joints.
    const P = this.P, roll = this.wRoll;
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(READY_ANCHOR[i], ROLL_ANCHOR[i], roll);
      P[C.ANCR + i] = mix(READY_ROTATION[i], ROLL_ROTATION[i], roll);
    }
    // Pushing the wider drum the footage shows a low crouch, the back bent over
    // the handle and both arms reaching down to it (on top of the native lean).
    P[C.SPINE] += ROLL_LEAN[0] * roll; P[C.CHEST] += ROLL_LEAN[1] * roll; P[C.HIPS] += ROLL_LEAN[2] * roll;
    P[C.HIPS_P + 1] -= ROLL_LEAN[3] * roll;
    return result;
  };
  Character.prototype.setWeapon = function (...args) {
    this._s3CancelRollerFlick();
    return setWeapon.apply(this, args);
  };
  Character.prototype._poseFlick = function (P, ft) {
    const state = this.s3RollerFlick;
    if (!state) return flick.call(this, P, ft);
    if (!state.vertical) {
      // Preserve the upstream horizontal joints, retiming coil/whip/recovery to
      // the actual attack, including the existing calibrated cooldown.
      const age = state.elapsed < state.windup ? state.elapsed / state.windup * .23 : .23 + (state.elapsed - state.windup) / (state.interval - state.windup) * .45;
      const base = P.slice();
      flick.call(this, P, age);
      const coil = ease(state.elapsed / (state.windup * .65)) * (1 - ease((state.elapsed - state.windup * .65) / (state.windup * .35)));
      const recover = ease((age - .42) / .26);
      P[C.ANC + 1] -= .16 * coil;
      // The sweep keeps the larger drum (roller-model.mjs) at the same floor clearance.
      P[C.ANC + 1] += (.2 + DRUM_LIFT) * ease((state.elapsed - state.windup) / .08) * (1 - recover);
      // Start from the raised carry instead of first dropping to the upstream
      // low carry and lifting again. Keep its arm/body curves for the swing.
      const lift = ease(state.elapsed / (state.windup * .64));
      for (let i = 0; i < 3; i++) {
        P[C.ANC + i] = mix(base[C.ANC + i], P[C.ANC + i], lift);
        P[C.ANCR + i] = mix(base[C.ANCR + i], P[C.ANCR + i], lift);
      }
      const weight = ease(state.elapsed / (3 / 60)) * (state.released && state.rolling ? 1 - this.wRoll : 1);
      for (let i = 0; i < P.length; i++) P[i] = mix(base[i], P[i], weight);
      return;
    }
    const p = verticalRollerPose(state.elapsed, state.windup, state.interval), w = p.weight * (state.released && state.rolling ? 1 - this.wRoll : 1);
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(P[C.ANC + i], p.anchor[i], w);
      P[C.ANCR + i] = mix(P[C.ANCR + i], p.rotation[i], w);
    }
    P[C.AFOLT] = mix(P[C.AFOLT], .6, w); P[C.AFOLR] = mix(P[C.AFOLR], .25, w);
    P[C.IKR] = mix(P[C.IKR], 1, w); P[C.IKL] = mix(P[C.IKL], 1, w);
    P[C.SPINE] += (-.18 * p.coil + .32 * p.whip) * w;
    P[C.CHEST] += (-.12 * p.coil + .18 * p.whip) * w;
    P[C.HIPS_P + 1] -= (.025 * p.coil + .045 * p.whip) * w;
    P[C.HLP] += (.055 * p.coil - .09 * p.whip) * w;
    this._effort = Math.max(this._effort || 0, (p.coil + p.whip * .7) * w);
  };
  Character.prototype._animWeapon = function (dt, s, w) {
    const state = this.s3RollerFlick;
    this._wst.flickReleaseTime = state?.windup;
    return animate.call(this, dt, s, w);
  };
}
