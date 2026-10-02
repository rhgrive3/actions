// State/timing connections for the actual public Character. Existing joint
// curves and glow intensities are visual calibration, not extracted Nintendo
// animation parameters. Gameplay state is read only.
const installed = new WeakSet(), resetInstalled = new WeakSet(), states = new WeakMap(), views = new WeakMap();
const EPS = 1e-10;
const LEGACY_SLOSH_RELEASE = .13, LEGACY_SLOSH_END = .66;
function state(ch) {
  let s = states.get(ch);
  if (!s) { s = { slosh: null, thrown: false }; states.set(ch, s); }
  return s;
}
export function slosherMotionTime(elapsed, windup, interval) {
  if (!(windup > 0 && interval > windup)) return elapsed;
  return elapsed <= windup ? elapsed / windup * LEGACY_SLOSH_RELEASE
    : LEGACY_SLOSH_RELEASE + (elapsed - windup) / (interval - windup) * (LEGACY_SLOSH_END - LEGACY_SLOSH_RELEASE);
}
function clear(ch, timers) {
  if (!ch?.tr) return;
  states.set(ch, { slosh: null, thrown: false });
  ch.lockW = ch.spinW = ch.streamW = ch.charge = ch.fullT = ch.chargeFlash = 0;
  ch.lastShot = ch.lastRelease = 99;
  ch.bombHeld = false; ch.wSub = ch.bombSwap = 0; ch._subPrev = false;
  ch.tumble = ch.tumbleDrop = 0;
  // These are exact exported source indices; do not infer private timer order.
  for (const name of ['T_SHOOT', 'T_SHOOTL', 'T_THROW', 'T_SLOSH', 'T_REL', 'T_DODGE'])
    if (Number.isInteger(timers?.[name])) ch.tr[timers[name]] = 99;
  for (const w of Object.values(ch.weapons || {})) for (let x = w; x; x = x.left) {
    x.spinW = 0; x.spinA = 0;
    if (x.parts?.barrels) x.parts.barrels.rotation.z = 0;
  }
}
export function installWeaponMotion({ Character, WeaponRunner, CHARACTER_TIMERS: timers, CHARACTER_CHANNELS: channels }, profile) {
  if (!Character || !channels) throw Error('Weapon motion requires the actual Character and its exact pose channels');
  if (WeaponRunner && !resetInstalled.has(WeaponRunner.prototype)) {
    resetInstalled.add(WeaponRunner.prototype);
    const reset = WeaponRunner.prototype.reset;
    WeaponRunner.prototype.reset = function (...args) {
      const result = reset.apply(this, args);
      if (this.a.character?.s3WeaponMotionEnabled !== false) clear(this.a.character, timers);
      return result;
    };
  }
  const C = Character.prototype;
  if (installed.has(C)) return;
  installed.add(C);
  const runner = C._runner, updateStates = C._updateStates, trigger = C.trigger;
  const slosh = C._poseSlosh, dodge = C._poseDodge, throwing = C._poseThrow;
  const setWeapon = C.setWeapon, materials = C._updateMaterials, poseWeapon = C._poseWeapon;
  C._runner = function (s) {
    const r = runner.call(this, s);
    if (this.s3WeaponMotionEnabled === false || !this.dual || !r?.s3Turret) return r;
    // Character already has the correct stationary dualies stance. Its old
    // lockT-only input misses continued turret fire after movement unlocks.
    // The view is used solely by Character, never by the gameplay runner.
    let view = views.get(r);
    if (!view) {
      view = new Proxy(r, { get(target, name) {
        const value = Reflect.get(target, name, target);
        return name === 'lockT' && target.s3Turret ? Math.max(EPS, value || 0) : value;
      } });
      views.set(r, view);
    }
    return view;
  };
  C.trigger = function (name, arg) {
    const result = trigger.call(this, name, arg);
    if (this.s3WeaponMotionEnabled === false) return result;
    const m = state(this);
    if (name === 'slosh') {
      const w = this._owner()?.weapon || profile?.weapons?.[this.weaponKind];
      m.slosh = w?.windup > 0 && w.fireInterval > w.windup
        ? { elapsed: 0, windup: w.windup, interval: w.fireInterval, released: false } : null;
    }
    if (name === 'throw') m.thrown = true;
    return result;
  };
  C._updateStates = function (dt, s) {
    if (this.s3WeaponMotionEnabled !== false) {
      const m = state(this), r = runner.call(this, s), a = m.slosh;
      if (a) {
        if (!this.kidForm || this.weaponKind !== 'slosher') m.slosh = null;
        else if (r && r.slosh >= 0) a.elapsed = r.slosh;
        else if (r && !a.released) { a.elapsed = a.windup; a.released = true; }
        else a.elapsed += dt;
      }
    }
    return updateStates.call(this, dt, s);
  };
  C._poseSlosh = function (P, elapsed) {
    if (this.s3WeaponMotionEnabled === false) return slosh.call(this, P, elapsed);
    const m = state(this).slosh;
    if (!m && this._owner()?.weaponRunner) return;
    if (!m) return slosh.call(this, P, elapsed);
    const age = slosherMotionTime(m.elapsed, m.windup, m.interval);
    // Secondary spring impulses cross the same retimed curve once per tick.
    const dt = this._dt;
    this._dt = age - slosherMotionTime(Math.max(0, m.elapsed - dt), m.windup, m.interval);
    try { return slosh.call(this, P, age); }
    finally { this._dt = dt; }
  };
  C._poseDodge = function (P, elapsed) {
    const r = runner.call(this);
    if (this.s3WeaponMotionEnabled !== false && r && !r.dodge && !(r.lockT > 0) && !r.s3Turret) {
      this.tumble = this.tumbleDrop = 0; return;
    }
    return dodge.call(this, P, elapsed);
  };
  C._poseWeapon = function (dt, s) {
    const result = poseWeapon.call(this, dt, s), r = runner.call(this, s);
    if (this.s3WeaponMotionEnabled === false || !this.dual || !this.kidForm || !this.grounded || this.dance || r?.dodge) return result;
    // Nintendo's stationary post-slide pose is a deep planted crouch. The
    // public curve only drops the hips 0.05 world units. Calibrate the extra
    // bend against this rig's leg span, without claiming Nintendo world scale.
    const k = this.lockW, drop = (this.rest.hips.y - this.rest.footL.y) * .30;
    this.P[channels.HIPS_P + 1] -= drop * k;
    this.P[channels.SPINE] += .12 * k;
    // Both pistol IK targets follow the lowered chest, retaining aim direction.
    this.P[channels.AFOLT] += (1 - this.P[channels.AFOLT]) * k;
    return result;
  };
  C._poseThrow = function (P, elapsed) {
    if (this.s3WeaponMotionEnabled !== false && this._owner()?.weaponRunner && !state(this).thrown) return;
    return throwing.call(this, P, elapsed);
  };
  C.setWeapon = function (...args) {
    if (this.s3WeaponMotionEnabled !== false && args[0] !== this.weaponKind) clear(this, timers);
    return setWeapon.apply(this, args);
  };
  C._updateMaterials = function (dt, s) {
    const result = materials.call(this, dt, s);
    if (this.s3WeaponMotionEnabled !== false && this._owner()?.s3?.flow?.active) {
      // Reuse the public character's calibrated team-colour glow. Nintendo's
      // clip also has exterior aura particles; those remain unimplemented.
      const pulse = .5 + .5 * Math.sin(this.t * Math.PI * 2 * 1.6);
      this.u.uGlow.value.copy(this.color).multiplyScalar(.35 + .45 * pulse);
    }
    return result;
  };
}
