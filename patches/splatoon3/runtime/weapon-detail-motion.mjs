// Fine motion calibrated against Nintendo's normal Slosher / Splat Charger /
// Heavy Splatling / Blaster clips. These are this rig's visual curves, never
// claimed to be unpublished Nintendo joint parameters. Gameplay is read only.
const INSTALLED = Symbol.for('inkwave.weapon-detail-motion.installed');
const RESET_INSTALLED = Symbol.for('inkwave.weapon-detail-motion.runner-reset-installed');
const tracks = new WeakMap(), fills = new WeakMap(), reaches = new WeakMap();
const TAU = Math.PI * 2;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
function trackMap(ch) {
  for (let p = ch && Object.getPrototypeOf(ch); p; p = Object.getPrototypeOf(p))
    if (Object.hasOwn(p, INSTALLED)) return p[INSTALLED].tracks;
  return tracks;
}
export const WEAPON_DETAIL_CALIBRATION = Object.freeze({
  bucketDepth: .012, bucketDrawFrames: 3, bucketTiltLimit: .28,
  chargerReturnStart: .10, chargerReturnEnd: .38,
  splatlingCoastRate: 18, splatlingStopSpeed: .15,
});
const recoil = Object.freeze({
  shooter: { kick: .045, back: .022, hz: 11, z: .93, jit: .012 },
  blaster: { kick: .24, back: .045, hz: 5.2, z: .85, jit: .016 },
  charger: { kick: .36, back: .047, hz: 5.6, z: .84, jit: .006 },
  splatling: { kick: .022, back: .012, hz: 10, z: .92, jit: .006 },
});
function track(ch) {
  const map = trackMap(ch);
  let m = map.get(ch);
  if (!m) { m = { slosh: null, release: null, disposed: false }; map.set(ch, m); }
  return m;
}
function enabled(ch) { return ch.s3WeaponDetailMotionEnabled !== false && ch.s3WeaponMotionEnabled !== false; }
function activeSpecial(ch, T) {
  return ch._owner()?.specialActive ||
    Number.isInteger(T.T_SLAM) && ch.tr[T.T_SLAM] < 1.4 ||
    Number.isInteger(T.T_LEAP) && ch.tr[T.T_LEAP] < 1.9;
}
function withRecoil(ch, fn) {
  const original = ch.hold, tune = recoil[ch.weaponKind];
  if (!enabled(ch) || !tune || !original) return fn();
  ch.hold = { ...original, rc: { ...original.rc, ...tune } };
  try { return fn(); } finally { ch.hold = original; }
}
// Integrate the exponential motor's angle as well as velocity. Updating angle
// with the end-of-step velocity produces different coast at 30 and 120 Hz.
export function splatlingMotorStep(speed, angle, target, dt) {
  dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  if (!dt) return { speed, angle };
  const rate = target === 0 ? WEAPON_DETAIL_CALIBRATION.splatlingCoastRate : target > speed ? 5 : 1.6;
  let elapsed = dt;
  if (!target) elapsed = speed > WEAPON_DETAIL_CALIBRATION.splatlingStopSpeed
    ? Math.min(dt, Math.log(speed / WEAPON_DETAIL_CALIBRATION.splatlingStopSpeed) / rate) : 0;
  const decay = Math.exp(-rate * elapsed);
  angle = (angle + target * elapsed + (speed - target) * (1 - decay) / rate) % TAU;
  speed = !target && elapsed < dt ? 0 : target + (speed - target) * decay;
  if (!target && speed <= WEAPON_DETAIL_CALIBRATION.splatlingStopSpeed * (1 + 1e-10)) speed = 0;
  return { speed, angle };
}
export function bucketDrain(age, recovery) {
  if (age == null || age < 0 || !(recovery > 0) || age >= recovery) return 0;
  const draw = Math.min(WEAPON_DETAIL_CALIBRATION.bucketDrawFrames / 60, recovery / 3);
  return age < draw ? smooth(age / draw) : 1 - smooth((age - draw) / (recovery - draw));
}
// Bounds of the actual drawn vertices, including drawRange and index buffer.
// Unused vertices and geometry bounding boxes cannot describe the visible fill.
function fillRest(mesh) {
  if (!mesh?.geometry) return null;
  let rest = fills.get(mesh);
  const g = mesh.geometry, p = g.getAttribute('position'), ix = g.index;
  const count = ix ? ix.count : p.count, start = Math.max(0, g.drawRange.start || 0);
  const end = Math.min(count, start + g.drawRange.count);
  if (rest?.geometry === g && rest.start === start && rest.end === end) return rest;
  let bottom = Infinity, top = -Infinity;
  for (let i = start; i < end; i++) {
    const y = p.getY(ix ? ix.getX(i) : i); bottom = Math.min(bottom, y); top = Math.max(top, y);
  }
  rest = { bottom, top, y: rest?.y ?? mesh.position.y, scaleY: rest?.scaleY ?? mesh.scale.y, geometry: g, start, end };
  fills.set(mesh, rest); return rest;
}
function lowerFill(mesh, depth) {
  const r = fillRest(mesh);
  if (!r || !(r.top > r.bottom)) return;
  const scale = 1 - Math.min(depth / r.scaleY, (r.top - r.bottom) * .5) / (r.top - r.bottom);
  mesh.scale.y = r.scaleY * scale;
  mesh.position.y = r.y + r.bottom * r.scaleY * (1 - scale);
}
function clear(ch) {
  const map = trackMap(ch);
  if (!map.has(ch)) return; // an opted-out character has no owned parts to restore
  map.delete(ch);
  reaches.delete(ch);
  for (const w of Object.values(ch.weapons || {})) {
    if (w.def.kind === 'slosher') {
      const surface = w.parts?.surface;
      if (surface) { surface.position.copy(surface.userData.rest); surface.scale.set(1, 1, 1); surface.rotation.set(0, 0, 0); }
      lowerFill(w.ink, 0); lowerFill(w.inkFar, 0);
      if (w.parts?.lever) w.parts.lever.rotation.x = 0;
    }
    if (w.def.kind === 'splatling') {
      w.spinW = w.spinA = 0;
      if (w.parts?.barrels) w.parts.barrels.rotation.z = 0;
    }
    if (w.def.kind === 'blaster') {
      w.pump = 0;
      if (w.parts?.pump) w.parts.pump.position.copy(w.parts.pump.userData.rest);
    }
  }
}
export function weaponDetailMotionSnapshot(ch) {
  const m = ch && trackMap(ch).get(ch), w = ch?.weapon, a = m?.slosh;
  return Object.freeze({ kind: ch?.weaponKind ?? null, enabled: !!ch && enabled(ch),
    sloshElapsed: a?.elapsed ?? null, sloshReleaseAge: a?.releaseAge ?? null,
    bucketDrain: a ? bucketDrain(a.releaseAge, a.recovery) : 0,
    bucketSurfaceY: w?.parts?.surface?.position.y ?? null,
    barrelSpeed: w?.def.kind === 'splatling' ? w.spinW || 0 : null,
    barrelAngle: w?.def.kind === 'splatling' ? w.spinA || 0 : null,
    chargerReleaseAge: m?.release ?? null, gripCorrection: m?.gripCorrection ?? 0, pump: w?.pump || 0 });
}
export function installWeaponDetailMotion({ Character, WeaponRunner, THREE, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }) {
  if (!Character || !THREE || !C || !Number.isInteger(T?.T_SLOSH)) throw Error('Weapon detail motion requires actual Character, Three, channels and slosh timer');
  if (WeaponRunner && !Object.hasOwn(WeaponRunner.prototype, RESET_INSTALLED)) {
    Object.defineProperty(WeaponRunner.prototype, RESET_INSTALLED, { value: true });
    const reset = WeaponRunner.prototype.reset;
    WeaponRunner.prototype.reset = function (...args) { const result = reset.apply(this, args); if (this.a.character) clear(this.a.character); return result; };
  }
  const P = Character.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: Object.freeze({ tracks }) });
  const trigger = P.trigger, updateStates = P._updateStates, poseWeapon = P._poseWeapon;
  const poseSlosh = P._poseSlosh, animWeapon = P._animWeapon, nativeRecoil = P._recoil;
  const setWeapon = P.setWeapon, setVisible = P.setVisible, dispose = P.dispose;
  const solveLimb = P._solveLimb;
  P._solveLimb = function (limb, target, pole, endQuat, weight, slot) {
    const A = this.P;
    if (enabled(this) && this.kidForm && !this.dance && !activeSpecial(this, T) &&
      limb === this.limbs.armR && endQuat && weight > .99 &&
      ['slosher', 'splatling', 'blaster'].includes(this.weaponKind)) {
      let x = reaches.get(this);
      if (!x) { x = { right: new THREE.Vector3(), left: new THREE.Vector3(), delta: new THREE.Vector3(),
        leftCenter: new THREE.Vector3(), point: new THREE.Vector3(), original: new THREE.Vector3(),
        parentQ: new THREE.Quaternion(), weaponQ: new THREE.Quaternion() }; reaches.set(this, x); }
      const R = this.limbs.armR, L = this.limbs.armL, d = this.weapon.def;
      this._kidXform(R.up.parent, x.right, x.parentQ);
      x.right.add(x.delta.copy(R.up.position).applyQuaternion(x.parentQ));
      this._kidXform(L.up.parent, x.left, x.parentQ);
      x.left.add(x.delta.copy(L.up.position).applyQuaternion(x.parentQ));
      x.weaponQ.copy(d.handR.quat).invert().premultiply(endQuat);
      x.delta.subVectors(d.handL.pos, d.handR.pos).applyQuaternion(x.weaponQ);
      x.leftCenter.copy(x.left).sub(x.delta);
      x.original.copy(target); x.point.copy(target);
      // Project the held right grip into its actual arm sphere. A fully held
      // support hand adds the second sphere; a detached throwing hand does not.
      // The native solver still performs both limbs and reports its real
      // residual; no arm scaling, synthetic reach receipt or second IK solver.
      const rRight = (R.a + R.b) * .9995 - .002, rLeft = (L.a + L.b) * .9995 - .002;
      const support = A[C.IKL] > .99 && (A[C.LTW] || 0) < .001;
      for (let i = 0; i < (support ? 8 : 1); i++) {
        x.delta.subVectors(x.point, x.right);
        let length = x.delta.length();
        if (length > rRight) x.point.copy(x.right).addScaledVector(x.delta, rRight / length);
        if (support) {
          x.delta.subVectors(x.point, x.leftCenter); length = x.delta.length();
          if (length > rLeft) x.point.copy(x.leftCenter).addScaledVector(x.delta, rLeft / length);
        }
      }
      // Bomb's native release sampler evaluates the rig with _dt=0 inside a
      // transaction. Scratch vectors may be reused, but no visual track or
      // per-frame diagnostic advances during that read-only pose evaluation.
      const m = tracks.get(this);
      if (m && this._dt > 0) m.gripCorrection = Math.max(m.gripCorrection || 0, x.point.distanceTo(x.original));
      return solveLimb.call(this, limb, x.point, pole, endQuat, weight, slot);
    }
    return solveLimb.call(this, limb, target, pole, endQuat, weight, slot);
  };
  P._recoil = function (...args) { return withRecoil(this, () => nativeRecoil.apply(this, args)); };
  P.trigger = function (name, ...args) {
    const result = trigger.call(this, name, ...args);
    if (!enabled(this)) return result;
    const m = track(this);
    if (name === 'slosh') {
      const w = this._owner()?.weapon;
      m.slosh = w?.windup > 0 && w.fireInterval > w.windup ? { elapsed: 0, windup: w.windup,
        recovery: w.fireInterval - w.windup, releaseAge: null } : null;
    }
    if (name === 'charge_release' && this.weaponKind === 'charger') m.release = 0;
    return result;
  };
  P._updateStates = function (dt, s) {
    s = s || {};
    const result = updateStates.call(this, dt, s);
    if (!enabled(this)) return result;
    const m = track(this), runner = this._runner(s);
    m.gripCorrection = 0;
    if (!this.kidForm || this.dance || !this.visible || this._owner()?.alive === false) {
      clear(this);
      return result;
    }
    const a = m.slosh;
    if (a && this.weaponKind === 'slosher') {
      const before = a.elapsed;
      if (a.releaseAge == null && runner?.slosh >= 0) a.elapsed = runner.slosh;
      else if (a.releaseAge == null && runner && runner.slosh < 0 && before < a.windup) {
        // The actual runner already emitted its wave. Preserve any variable-dt
        // overshoot without advancing a second visual attack clock.
        a.releaseAge = Math.max(0, before + dt - a.windup);
        a.elapsed = a.windup + a.releaseAge;
      } else if (a.releaseAge != null) { a.releaseAge += dt; a.elapsed = a.windup + a.releaseAge; }
    }
    if (m.release != null && this.weaponKind === 'charger') {
      m.release += dt;
      if (runner?.charging || runner?.s3Stored || (s.charge ?? 0) > .01) m.release = null;
      else this.wAim = Math.min(this.wAim,
        1 - smooth((m.release - WEAPON_DETAIL_CALIBRATION.chargerReturnStart) /
          (WEAPON_DETAIL_CALIBRATION.chargerReturnEnd - WEAPON_DETAIL_CALIBRATION.chargerReturnStart)));
    }
    return result;
  };
  P._poseWeapon = function (dt, s) {
    s = s || {};
    if (enabled(this) && this.weaponKind === 'blaster' && this.weapon) this.weapon.pump = 0;
    // A partially detached sub-throw hand is not trying to reach the foregrip.
    // Its raw partial-IK error must not build next frame's gun-shoulder reach.
    if (enabled(this) && this.wSub > .05 && ['blaster', 'slosher'].includes(this.weaponKind)) this.ikErrPre = 0;
    const result = withRecoil(this, () => poseWeapon.call(this, dt, s));
    if (!enabled(this) || !this.kidForm || this.dance || this.wSub > .05 || activeSpecial(this, T)) return result;
    const A = this.P, r = this._runner(s), k = this.wAim;
    if (this.weaponKind === 'blaster') {
      const span = this.rest.hips.y - this.rest.footL.y;
      A[C.HIPS_P + 1] -= span * .12 * k * (1 - this.wAir);
      A[C.AFOLT] += (1 - A[C.AFOLT]) * k;
      const delay = this._owner()?.weapon.preDelay;
      if (r?.s3BlasterWindup > 0 && delay > 0) A[C.ANCR] += .10 * smooth(r.s3BlasterWindup / delay) * k;
    }
    if (this.weaponKind === 'splatling' && r) {
      // Official Heavy keeps the cluster low and nearly level while winding;
      // reduce this rig's exaggerated 0.42-rad low-to-level charge sweep.
      A[C.ANCR] -= .30 * (1 - smooth(r.charge || 0)) * this.spinW * k;
      A[C.ANC + 1] -= .045 * k;
      const brace = this.streamW * k * (1 - this.wAir);
      A[C.HIPS_P + 1] -= (this.rest.hips.y - this.rest.footL.y) * .08 * brace;
      A[C.AFOLT] += (1 - A[C.AFOLT]) * brace;
    }
    return result;
  };
  P._poseSlosh = function (A, ...args) {
    const support = A[C.IKL], x = A[C.ANC], y = A[C.ANC + 1], z = A[C.ANC + 2];
    const result = poseSlosh.call(this, A, ...args);
    // Nintendo's normal bucket holds both hands through the heave. Native art
    // still places the support hand on its lower bar; no matching handle claim.
    if (enabled(this) && track(this).slosh && this.kidForm && !activeSpecial(this, T)) {
      if (this.wSub < .05) A[C.IKL] = Math.max(A[C.IKL], support);
      // Native windup translates down .22 and back .34, an exaggerated sweep
      // for this short arm rig. The official hands stay near the waist.
      // Keep the retimed rotational heave and secondary impulse, calibrating
      // only its overly large translation to this shorter arm rig.
      A[C.ANC] = x + (A[C.ANC] - x) * .8;
      A[C.ANC + 1] = y + (A[C.ANC + 1] - y) * .45;
      A[C.ANC + 2] = z + (A[C.ANC + 2] - z) * .6;
    }
    return result;
  };
  P._animWeapon = function (dt, s, w) {
    s = s || {};
    const oldSpeed = w.spinW || 0, oldAngle = w.spinA || 0;
    const result = animWeapon.call(this, dt, s, w);
    if (!enabled(this)) return result;
    const m = track(this), r = this._runner(s), parts = w.parts || {};
    if (w.def.kind === 'slosher') {
      const a = m.slosh, drain = a && this.kidForm ? bucketDrain(a.releaseAge, a.recovery) : 0;
      const depth = WEAPON_DETAIL_CALIBRATION.bucketDepth * drain;
      if (parts.surface) {
        parts.surface.position.y = parts.surface.userData.rest.y - depth;
        parts.surface.scale.set(1 - .025 * drain, 1, 1 - .025 * drain);
        const tilt = WEAPON_DETAIL_CALIBRATION.bucketTiltLimit;
        parts.surface.rotation.x = clamp(parts.surface.rotation.x, -tilt, tilt);
        parts.surface.rotation.z = clamp(parts.surface.rotation.z, -tilt, tilt);
      }
      lowerFill(w.ink, depth); lowerFill(w.inkFar, depth);
      if (parts.lever) parts.lever.rotation.x = 0; // no supported original thumb-lever mechanism
    }
    if (w.def.kind === 'blaster') {
      w.pump = 0;
      if (parts.pump) parts.pump.position.copy(parts.pump.userData.rest);
    }
    if (w.def.kind === 'splatling') {
      const target = this.kidForm && this.visible && !this.dance && this._owner()?.alive !== false ? r ? r.charging ? 14 + 46 * (r.charge || 0) : r.streaming ? 64 : 0
        : s.firing ? 30 + 30 * (s.charge || 0) : 0 : 0;
      const motor = splatlingMotorStep(oldSpeed, oldAngle, target, Math.max(0, Math.min(.1, dt || 0)));
      w.spinW = motor.speed; w.spinA = motor.angle;
      if (parts.barrels) parts.barrels.rotation.z = w.spinA;
    }
    return result;
  };
  P.setWeapon = function (...args) { if (args[0] !== this.weaponKind) clear(this); return setWeapon.apply(this, args); };
  P.setVisible = function (value) { if (!value) clear(this); return setVisible.call(this, value); };
  P.dispose = function (...args) { clear(this); return dispose.apply(this, args); };
}
