// Roller-specific refinements. Timing comes from the existing gameplay profile;
// joint curves are visual calibration against Nintendo's public roller videos.
const EPS = 1e-10;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function rollerMode(w, vertical) {
  return vertical ? { ...w, flickWindup: w.verticalWindup, flickInterval: w.verticalInterval ?? w.flickInterval, flickInk: w.verticalInk } : w;
}

export function installRollerLogic({ WeaponRunner }, _profile) {
  const roller = WeaponRunner.prototype._roller, reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3RollerAttack = null;
    if (this.a.character) this.a.character.s3RollerFlick = null;
    return result;
  };
  WeaponRunner.prototype._roller = function (dt, inp, w) {
    const a = this.a;
    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);
    if (starting) {
      this.cooldown = Math.min(0, this.cooldown);
      this.s3FlickVertical = !a.grounded;
      const mode = rollerMode(w, this.s3FlickVertical);
      this.s3RollerAttack = { vertical: this.s3FlickVertical, windup: mode.flickWindup, interval: mode.flickInterval, elapsed: 0, released: false };
      a.character.s3RollerFlick = this.s3RollerAttack;
      // Starting a new flick lifts the drum. The public runner otherwise leaves
      // rolling=true through its early windup return, including in the air.
      this.rolling = false; this.rollT = 0;
      this.rollLoop?.stop(.12); this.rollLoop = null;
    }
    const state = this.s3RollerAttack, mode = rollerMode(w, this.s3FlickVertical);
    const winding = this.flick >= 0;
    if (state && !starting) state.elapsed = Math.min(state.interval, state.elapsed + dt);
    // Float accumulation must not add a 22nd/27th tick to a 21F/26F windup.
    if (winding && this.flick + dt + EPS >= mode.flickWindup) this.flick = mode.flickWindup;
    const result = roller.call(this, dt, inp, mode);
    if (state && winding && this.flick < 0) {
      state.elapsed = mode.flickWindup;
      state.released = true;
    }
    if (state && state.elapsed + EPS >= state.interval) {
      this.s3RollerAttack = null;
      a.character.s3RollerFlick = null;
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
  const anchor = [mix(-.07, .015, coil), mix(.86, 1.32, coil), mix(.2, -.055, coil)];
  const rotation = [mix(.8, -2.45, coil), mix(.06, .015, coil), Math.PI / 2 * coil];
  // Keep the upright drum clear of the floor through its follow-through. A
  // horizontal carry-height target clips the lower cap while the axis is tilted.
  const release = [-.025, 1.05, .36], end = [-.025, 1.16, .42];
  for (let i = 0; i < 3; i++) anchor[i] = mix(mix(anchor[i], release[i], whip), end[i], follow);
  rotation[0] = mix(mix(rotation[0], -.04, whip), .95, follow);
  rotation[1] = mix(rotation[1], 0, whip);
  return { anchor, rotation, weight, coil: coil * (1 - whip), whip: whip * (1 - recover) };
}

export function installRollerMotion({ Character, CHARACTER_CHANNELS: C }, _profile) {
  if (!Character || !C) throw new Error('Roller motion requires exact upstream Character channels');
  const flick = Character.prototype._poseFlick, animate = Character.prototype._animWeapon, setWeapon = Character.prototype.setWeapon;
  Character.prototype.setWeapon = function (...args) {
    this.s3RollerFlick = null;
    return setWeapon.apply(this, args);
  };
  Character.prototype._poseFlick = function (P, ft) {
    const state = this.s3RollerFlick;
    if (!state) return flick.call(this, P, ft);
    if (!state.vertical) {
      // Preserve the upstream horizontal joints, retiming coil/whip/recovery to
      // the actual attack, including the existing calibrated cooldown.
      const age = state.elapsed < state.windup ? state.elapsed / state.windup * .23 : .23 + (state.elapsed - state.windup) / (state.interval - state.windup) * .45;
      return flick.call(this, P, age);
    }
    const p = verticalRollerPose(state.elapsed, state.windup, state.interval), w = p.weight;
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
