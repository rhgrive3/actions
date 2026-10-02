// Additive correction to movement-motion's long-axis turn. Nintendo's footage
// supports an airborne turnover and direction reversal, not these exact curves.
// Install after installMovementMotion and the other squid layers. Only Roll owns
// the squid pivot here; the original springs, IK and gameplay remain untouched.
import { movementMotionSnapshot, MOVEMENT_MOTION_CALIBRATION } from './movement-motion.mjs';

export const SQUIDROLL_MOTION_CALIBRATION = Object.freeze({
  turns: 1, tuck: .22, directionRelease: .65,
  status: 'visual calibration; original angle, shape and timing curves unknown',
});
const INSTALL = Symbol.for('inkwave.s3.squidroll-motion.install.v1');
const states = new WeakMap();
const disposed = new WeakSet();
const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };

export function squidrollMotionSnapshot(ch) {
  // A second module realm reads the first installation's state too.
  return ch?.[INSTALL]?.snapshot(ch) ?? null;
}

export function installSquidrollMotion({ Character, Actor, THREE }, profile) {
  if (!Character || !THREE || !(profile?.movement?.roll?.duration > 0))
    throw new Error('Squid Roll motion requires Character, THREE and roll tuning');
  const C = Character.prototype;
  if (Object.hasOwn(C, INSTALL)) return;
  const duration = profile.movement.roll.duration;
  const cfg = SQUIDROLL_MOTION_CALIBRATION;
  const get = ch => {
    let m = states.get(ch);
    if (!m) {
      m = { active: false, applied: false, live: null, blocked: null,
        preview: 0, previewDuration: duration, sequence: 0, age: null, spin: 0, frame: null,
        baseQ: new THREE.Quaternion(), baseScale: new THREE.Vector3(),
        outputQ: new THREE.Quaternion(), outputScale: new THREE.Vector3(),
        modelQ: new THREE.Quaternion(), worldQ: new THREE.Quaternion(),
        targetQ: new THREE.Quaternion(), turnQ: new THREE.Quaternion(),
        yawQ: new THREE.Quaternion(), direction: new THREE.Vector3(),
        mantle: new THREE.Vector3(), axis: new THREE.Vector3(),
        up: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(1, 0, 0),
        source: null };
      states.set(ch, m);
    }
    return m;
  };
  const restore = (ch, m) => {
    if (!m?.applied) return;
    // Actor reset/death can restore the older movement layer before the next
    // Character tick. Do not overwrite that authoritative cancellation with
    // our saved legacy Roll pose, especially on a hidden/dead character.
    if (ch.squid.pivot.quaternion.equals(m.outputQ)) ch.squid.pivot.quaternion.copy(m.baseQ);
    if (ch.squid.pivot.scale.equals(m.outputScale)) ch.squid.pivot.scale.copy(m.baseScale);
    m.applied = false;
  };
  const interrupt = ch => {
    const m = states.get(ch);
    if (!m) return;
    restore(ch, m);
    m.blocked = m.live;
    m.active = false; m.spin = 0;
  };
  Object.defineProperty(C, INSTALL, { value: Object.freeze({ snapshot(ch) {
    const m = states.get(ch);
    return m ? { phase: m.active ? 'roll' : null, age: m.age, spin: m.spin,
      sequence: m.sequence, direction: m.direction.toArray(),
      directionSource: m.source, axis: m.axis.toArray(), applied: m.applied } : null;
  } }) });

  const update = C.update, squid = C._updateSquid, trigger = C.trigger;
  const setWeapon = C.setWeapon, dispose = C.dispose;
  C.update = function (dt, s) {
    if (disposed.has(this)) return;
    const m = get(this);
    // Restore before delegating so this offset never feeds native pose springs
    // or movement-motion's saved transform, including when the body is hidden.
    restore(this, m);
    m.frame = s || {};
    m.active = false; m.spin = 0;
    const result = update.call(this, dt, s);
    m.age = movementMotionSnapshot(this)?.rollAge ?? null;
    if (m.age === null) m.live = m.blocked = null;
    return result;
  };
  C._updateSquid = function (dt, s) {
    if (disposed.has(this)) return;
    const m = get(this);
    restore(this, m);
    const result = squid.call(this, dt, s);
    const motion = movementMotionSnapshot(this);
    if (motion?.phase !== 'roll' || this.sqScale <= .001
      || this.s3SquidrollMotionEnabled === false) return result;
    const frame = m.frame, action = frame.movementMotion?.actions?.roll;
    const pivot = this.squid.pivot, u = clamp(motion.rollAge / (action ? duration : m.previewDuration));
    m.baseQ.copy(pivot.quaternion); m.baseScale.copy(pivot.scale);
    // Remove only the existing Roll offset, preserving its native base pose.
    // No legacy Surge/Super Jump branch is evaluated or modified here.
    pivot.quaternion.multiply(m.turnQ.setFromAxisAngle(m.up, -motion.spin));
    const legacyTuck = 1 - MOVEMENT_MOTION_CALIBRATION.rollTuck * Math.sin(Math.PI * u);
    pivot.scale.y /= legacyTuck;
    pivot.scale.x *= Math.sqrt(legacyTuck); pivot.scale.z *= Math.sqrt(legacyTuck);
    m.outputQ.copy(pivot.quaternion); m.outputScale.copy(pivot.scale);
    m.applied = true;
    const live = action || m.preview;
    if (m.live !== live) {
      m.live = live; m.sequence++; m.blocked = null;
      const vx = action?.vx, vz = action?.vz;
      if (Number.isFinite(vx) && Number.isFinite(vz) && Math.hypot(vx, vz) > 1e-6) {
        m.direction.set(vx, 0, vz).normalize(); m.source = 'action-launch-velocity';
      } else {
        // Standalone Character previews have no Actor action. Follow the
        // public localMove convention (+x left); never inspect/mutate input.
        const local = frame.localMove;
        m.direction.set(-(local?.x || 0), 0, local?.z || 0);
        this.root.getWorldQuaternion(m.modelQ);
        m.direction.applyQuaternion(m.modelQ); m.direction.y = 0;
        if (m.direction.lengthSq() <= 1e-12) {
          this.model.getWorldQuaternion(m.modelQ);
          m.worldQ.copy(m.modelQ).multiply(pivot.quaternion);
          m.direction.copy(m.up).applyQuaternion(m.worldQ); m.direction.y = 0;
          m.source = 'native-pose-fallback';
          if (m.direction.lengthSq() <= 1e-12) m.direction.set(0, 0, 1);
        } else m.source = 'preview-local-move';
        m.direction.normalize();
      }
    }
    // Form/action interruptions suppress this live Roll until a fresh action.
    if (this.form === 'kid' || this.form === 'climb' || this.grounded || this.dance
      || frame.subAim || frame.firing || frame.rolling || m.blocked === live) {
      m.blocked = live;
      return result;
    }
    this.model.getWorldQuaternion(m.modelQ);
    m.worldQ.copy(m.modelQ).multiply(pivot.quaternion);
    m.mantle.copy(m.up).applyQuaternion(m.worldQ);
    const pitch = Math.atan2(m.mantle.y, Math.hypot(m.mantle.x, m.mantle.z));
    const heading = Math.atan2(m.direction.x, m.direction.z);
    m.targetQ.setFromAxisAngle(m.up, heading)
      .multiply(m.yawQ.setFromAxisAngle(m.x, Math.PI / 2 - pitch));
    // Release the direction lock into the live native pose before completion;
    // there is no stored landing pose to leak into the next chained Roll.
    const lock = 1 - ease((u - cfg.directionRelease) / (1 - cfg.directionRelease));
    m.worldQ.slerp(m.targetQ, lock);
    m.axis.crossVectors(m.up, m.direction).normalize();
    m.spin = TAU * cfg.turns * ease(u);
    m.worldQ.premultiply(m.turnQ.setFromAxisAngle(m.axis, m.spin));
    pivot.quaternion.copy(m.modelQ.invert().multiply(m.worldQ));
    const tuck = 1 - cfg.tuck * Math.sin(Math.PI * u);
    pivot.scale.y *= tuck;
    pivot.scale.x /= Math.sqrt(tuck); pivot.scale.z /= Math.sqrt(tuck);
    m.outputQ.copy(pivot.quaternion); m.outputScale.copy(pivot.scale);
    m.active = true;
    return result;
  };
  C.trigger = function (name, arg) {
    if (!disposed.has(this) && name === 'squidroll') {
      const m = get(this); restore(this, m);
      m.preview++; m.live = m.blocked = null;
      m.previewDuration = Math.max(1e-10, arg?.duration ?? duration);
    } else if (!disposed.has(this) && ['spawn', 'land', 'movement_cancel', 'squidsurge', 'squidsurge_top',
      'jump', 'shoot', 'shootL', 'slosh', 'flick', 'charge_release', 'dodge',
      'throw', 'special_leap', 'special_slam'].includes(name)) interrupt(this);
    return trigger.call(this, name, arg);
  };
  C.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) interrupt(this);
    return setWeapon.apply(this, args);
  };
  const visible = C.setVisible, dance = C.setDance;
  C.setVisible = function (...args) {
    if (!args[0]) interrupt(this);
    return visible.apply(this, args);
  };
  C.setDance = function (...args) {
    if (args[0]) interrupt(this);
    return dance.apply(this, args);
  };
  C.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this);
    restore(this, states.get(this));
    states.delete(this);
    return dispose.apply(this, args);
  };
  if (Actor?.prototype) for (const method of ['reset', 'splat', '_startSpecial', 'superJump']) {
    const original = Actor.prototype[method];
    if (!original) continue;
    Actor.prototype[method] = function (...args) {
      // Unwind the outer Roll before the older movement layer cancels. Doing
      // this afterwards can restore our saved legacy spin over its native pose.
      if (this.character && (method !== 'superJump' || this.canSuperJump())) interrupt(this.character);
      return original.apply(this, args);
    };
  }
}
