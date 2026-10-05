// Ordinary grounded swim only. Nintendo's footage establishes a surface glide;
// all shape/rate coefficients below are visual calibration, not joint data.
// Keep the native squid mesh, material deformation, eyes and IK. Integrate the
// oscillators instead of multiplying a changing frequency by Character.t.
import { movementMotionSnapshot } from './movement-motion.mjs';

const INSTALL = Symbol.for('inkwave.s3.swim-motion.install.v1');
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
const wrap = (x, period = TAU) => ((x % period) + period) % period;
export const SWIM_MOTION_CALIBRATION = Object.freeze({
  speedReference: 11, speedFollow: 16, headingFollow: 10, poseFollow: 26,
  bankFollow: 6, bankScale: .08, bankLimit: .5,
  // A resting squid sinks fully under its ink; swimming rises to the glide.
  restDepth: .19, surfacePower: .35, sinkFollow: 6,
  status: 'visual calibration; original swim joint curves and wave rates unknown',
});

function restore(ch, m) {
  if (!m?.applied) return;
  const pivot = ch.squid.pivot;
  pivot.position.copy(m.basePosition); pivot.quaternion.copy(m.baseQuaternion);
  pivot.scale.copy(m.baseScale);
  ch.u.uTime.value = m.baseTime; ch.u.uWig.value.copy(m.baseWig);
  m.applied = false;
}
function clear(ch, states) {
  const m = states.get(ch); if (!m) return;
  restore(ch, m); states.delete(ch);
}
function eligible(ch, s, owner) {
  const frame = s.movementMotion;
  return ch.s3SwimMotionEnabled !== false && ch.form === 'swim' && ch.grounded
    && ch.sqScale > .999 && ch.kidScale < .001 && !ch.dance
    // Native form gestures last .45s. Never replace their squash/pop curves.
    && !(ch.formPrev === 'kid' && ch.formT < .45)
    && ch.root.visible && ch.root.parent?.visible !== false
    && s.hp !== 0 && !s.subAim && !s.firing && !s.rolling && !(s.charge > .01)
    && owner?.alive !== false && !owner?.specialActive && !owner?.superJumpState
    && !owner?.weaponRunner?.aimingSub && !owner?.weaponRunner?.dodge
    && !owner?.weaponRunner?.rolling && !(owner?.weaponRunner?.charge > .01)
    && !(owner?.weaponRunner?.lockT > 0)
    && !owner?.s3?.actions?.roll && !owner?.s3?.actions?.surge
    && !(frame && (!frame.alive || frame.special || frame.superJump
      || frame.actions?.roll || frame.actions?.surge))
    && !movementMotionSnapshot(ch)?.phase;
}
function makeState(ch, owner, THREE) {
  const c = SWIM_MOTION_CALIBRATION, power = clamp(ch.hs / c.speedReference);
  const pivot = ch.squid.pivot, time = ch.t;
  return { active: true, applied: false, owner, age: 0, power, sink: 0,
    yaw: ch.yaw + ch.sqYaw, bank: ch.sqRoll,
    bodyPhase: wrap(time * (5 + 9 * power)),
    swayPhase: wrap(time * (4 + 7 * power)),
    heightPhase: wrap(time * 5),
    // The shader's second oscillator runs at 4/5 of the first. Five full
    // turns preserve BOTH waves when reducing the phase for float precision.
    wavePhase: wrap(time * (12 + 8 * power), TAU * 5),
    position: pivot.position.clone(), quaternion: pivot.quaternion.clone(),
    worldQuaternion: pivot.getWorldQuaternion(new THREE.Quaternion()),
    scale: pivot.scale.clone(), targetPosition: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(), modelQuaternion: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'), offset: new THREE.Vector3(),
    basePosition: new THREE.Vector3(), baseQuaternion: new THREE.Quaternion(),
    baseScale: new THREE.Vector3(), baseWig: new THREE.Vector3(), baseTime: 0 };
}
function advance(ch, m, dt, s) {
  const c = SWIM_MOTION_CALIBRATION;
  // Actor._finishFrame supplies actual speed/direction, not desired stick
  // input. gv also supports the public Character's stationary treadmill.
  const speed = Number.isFinite(s.speed) ? Math.max(0, s.speed) : ch.gv;
  const target = clamp(speed / c.speedReference), k = -Math.expm1(-c.speedFollow * dt);
  const integral = target * dt + (m.power - target) * k / c.speedFollow;
  m.power += (target - m.power) * k;
  m.bodyPhase = wrap(m.bodyPhase + 5 * dt + 9 * integral);
  m.swayPhase = wrap(m.swayPhase + 4 * dt + 7 * integral);
  m.heightPhase = wrap(m.heightPhase + 5 * dt);
  m.wavePhase = wrap(m.wavePhase + 12 * dt + 8 * integral, TAU * 5);
  m.age += dt;

  const move = s.localMove;
  let heading = m.yaw;
  if (speed > .3) {
    if (move && Math.hypot(move.x, move.z) > .05)
      heading = ch.yaw + Math.atan2(-move.x, move.z);
    else if (ch.gv > .3) heading = Math.atan2(ch.gvx, ch.gvz);
  }
  const turn = angle(heading - m.yaw) * -Math.expm1(-c.headingFollow * dt);
  m.yaw = angle(m.yaw + turn);
  const bank = clamp(-turn / dt * c.bankScale, -c.bankLimit, c.bankLimit);
  m.bank += (bank - m.bank) * -Math.expm1(-c.bankFollow * dt);

  const v = m.power * c.speedReference, und = Math.sin(m.bodyPhase);
  // Heading is world relative. Compensate the model's current rotation so a
  // root/aim turn cannot drag a squid travelling in an unchanged direction.
  m.euler.set(Math.PI / 2 + .06 * und * m.power,
    m.yaw + .1 * Math.sin(m.swayPhase + 1) * m.power,
    m.bank + und * .12 * Math.min(1, v / 4), 'YXZ');
  m.targetQuaternion.setFromEuler(m.euler);
  const poseK = -Math.expm1(-c.poseFollow * dt);
  // Smooth in world space BEFORE converting to model space. Smoothing local
  // quaternions would let a fast root/aim turn rotate the displayed mantle.
  m.worldQuaternion.slerp(m.targetQuaternion, poseK);
  ch.model.getWorldQuaternion(m.modelQuaternion);
  m.targetQuaternion.premultiply(m.modelQuaternion.invert());
  m.quaternion.copy(m.modelQuaternion).multiply(m.worldQuaternion);
  // Nintendo's footage shows a squid resting in its own ink as hidden under the
  // surface (only a ripple), and a mound while it swims. The native glide keeps
  // the mantle back ~0.1 above the ink even at rest. Sink with falling speed.
  const surface = clamp(m.power / c.surfacePower);
  m.sink += (c.restDepth * (1 - surface * surface * (3 - 2 * surface)) - m.sink) * -Math.expm1(-c.sinkFollow * dt);
  m.targetPosition.set(0, -.085 + .012 * Math.sin(m.heightPhase) - m.sink, 0);
  m.offset.set(0, -.12, 0).applyQuaternion(m.targetQuaternion);
  m.targetPosition.add(m.offset);
  m.position.lerp(m.targetPosition, poseK);
  const sy = 1 + .2 * m.power + .03 * und * m.power, sxz = 1 / Math.sqrt(sy);
  m.scale.x += (sxz - m.scale.x) * poseK;
  m.scale.y += (sy - m.scale.y) * poseK;
  m.scale.z += (sxz - m.scale.z) * poseK;
}
function draw(ch, m) {
  const pivot = ch.squid.pivot;
  m.basePosition.copy(pivot.position); m.baseQuaternion.copy(pivot.quaternion);
  m.baseScale.copy(pivot.scale); m.baseTime = ch.u.uTime.value;
  m.baseWig.copy(ch.u.uWig.value);
  pivot.position.copy(m.position); pivot.quaternion.copy(m.quaternion); pivot.scale.copy(m.scale);
  const frequency = 12 + 8 * m.power;
  ch.u.uWig.value.set(.018 + .022 * m.power, frequency, m.power);
  // uTime is exclusively the native squid material's visual uniform. Retiming
  // it keeps its existing travelling-arm field and ghost material identical;
  // Character.t, timers, gameplay/weapon clocks and root transforms stay native.
  ch.u.uTime.value = m.wavePhase / frequency;
  m.applied = true;
}

export function swimMotionSnapshot(ch) {
  const m = ch && Object.getPrototypeOf(ch)?.[INSTALL]?.states.get(ch);
  return m ? { active: true, age: m.age, power: m.power, yaw: m.yaw, bank: m.bank,
    bodyPhase: m.bodyPhase, swayPhase: m.swayPhase, wavePhase: m.wavePhase,
    heightPhase: m.heightPhase, position: m.position.toArray(),
    quaternion: m.quaternion.toArray(), scale: m.scale.toArray(), resources: 0 }
    : { active: false, resources: 0 };
}

export function installSwimMotion({ Character, Actor, THREE }, _profile) {
  if (!Character?.prototype?._updateSquid || !THREE)
    throw new Error('Swim motion requires the native Character and THREE');
  const C = Character.prototype;
  if (Object.prototype.hasOwnProperty.call(C, INSTALL)) return;
  const states = new WeakMap(), disposed = new WeakSet();
  Object.defineProperty(C, INSTALL, { value: { states } });
  const squid = C._updateSquid, update = C.update;
  C._updateSquid = function (dt, s = {}) {
    s ||= {};
    restore(this, states.get(this));
    const result = squid.call(this, dt, s), owner = this._owner();
    if (disposed.has(this) || !eligible(this, s, owner)) { clear(this, states); return result; }
    let m = states.get(this);
    if (m && m.owner !== owner) { clear(this, states); m = null; }
    if (!m) {
      if (!(dt > 0)) return result;
      m = makeState(this, owner, THREE); states.set(this, m);
    } else if (dt > 0) advance(this, m, dt, s);
    draw(this, m); return result;
  };
  C.update = function (...args) {
    if (disposed.has(this)) return;
    const result = update.apply(this, args);
    // Native hidden characters skip _updateSquid entirely.
    if (!this.root.visible || this.root.parent?.visible === false) clear(this, states);
    return result;
  };
  const visible = C.setVisible, weapon = C.setWeapon, trigger = C.trigger, dispose = C.dispose, dance = C.setDance;
  C.setVisible = function (...args) {
    if (!args[0]) clear(this, states); return visible.apply(this, args);
  };
  C.setDance = function (...args) {
    if (args[0]) clear(this, states);
    return dance.apply(this, args);
  };
  C.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) clear(this, states); return weapon.apply(this, args);
  };
  C.trigger = function (name, ...args) {
    if (['spawn', 'movement_cancel', 'squidroll', 'squidsurge', 'squidsurge_top',
      'jump', 'shoot', 'shootL', 'slosh', 'flick', 'charge_release', 'throw',
      'leap', 'slam', 'special_leap', 'special_slam', 'dodge'].includes(name)) clear(this, states);
    return trigger.call(this, name, ...args);
  };
  C.dispose = function (...args) {
    if (disposed.has(this)) return;
    clear(this, states); disposed.add(this); return dispose.apply(this, args);
  };
  if (Actor?.prototype) {
    for (const method of ['reset', 'splat', '_startSpecial', 'superJump']) {
      const original = Actor.prototype[method]; if (!original) continue;
      Actor.prototype[method] = function (...args) {
        const result = original.apply(this, args);
        if (method === 'reset' || !this.alive || this.specialActive || this.superJumpState)
          if (this.character) clear(this.character, states);
        return result;
      };
    }
  }
}
