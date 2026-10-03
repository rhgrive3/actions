// Dedicated squid action layer on the actual public Character, after its normal
// form/swim/climb/air pose. Rotations and shape curves are visual calibration;
// Nintendo's public clips establish the actions, not exact joint curves.
const installedCharacters = new WeakSet(), installedActors = new WeakSet();
const states = new WeakMap();
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2, EPS = 1e-10;

export const MOVEMENT_MOTION_CALIBRATION = Object.freeze({
  rollTurns: 1, rollTuck: .12, surgeCompress: .22, surgeStretch: .16,
  superJumpCompress: .20,
});

export function movementMotionSnapshot(ch) {
  const m = states.get(ch);
  return m ? { phase: m.phase, rollAge: m.roll?.age ?? null,
    topAge: m.top?.age ?? null, spin: m.spin, charge: m.charge } : null;
}

function restore(ch, m) {
  if (!m.applied) return;
  ch.squid.pivot.position.copy(m.basePosition);
  ch.squid.pivot.quaternion.copy(m.baseQuaternion);
  ch.squid.pivot.scale.copy(m.baseScale);
  m.applied = false;
}
function cancel(ch, m) {
  restore(ch, m);
  m.roll = m.top = m.burst = m.liveRoll = null;
  m.phase = null; m.spin = m.charge = 0;
}

export function installMovementMotion({ Character, Actor, THREE }, profile) {
  if (!Character || !THREE || !profile?.movement) throw new Error('Movement motion requires Character, THREE and movement tuning');
  const cfg = profile.movement, visual = MOVEMENT_MOTION_CALIBRATION;
  const get = ch => {
    let m = states.get(ch);
    if (!m) {
      m = { roll: null, top: null, burst: null, liveRoll: null, phase: null,
        charge: 0, spin: 0, applied: false,
        basePosition: new THREE.Vector3(), baseQuaternion: new THREE.Quaternion(),
        baseScale: new THREE.Vector3(), rotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0) };
      states.set(ch, m);
    }
    return m;
  };
  if (!installedCharacters.has(Character.prototype)) {
    installedCharacters.add(Character.prototype);
    const C = Character.prototype, trigger = C.trigger, update = C.update, squid = C._updateSquid;
    C.trigger = function (name, arg) {
      const m = get(this);
      if (name === 'squidroll') {
        m.roll = { age: 0, duration: Math.max(EPS, arg?.duration ?? cfg.roll.duration) };
        m.top = m.burst = null;
      } else if (name === 'squidsurge') {
        m.roll = m.top = null;
        m.burst = { charge: clamp(arg?.charge ?? 1), age: 0, duration: Math.max(EPS, arg?.duration ?? cfg.surge.duration) };
      } else if (name === 'squidsurge_top') {
        m.roll = null;
        m.top = { age: 0, duration: Math.max(EPS, arg?.duration ?? cfg.surge.duration), charge: clamp(arg?.charge ?? 1) };
      } else if (name === 'movement_cancel' || name === 'spawn' || name === 'land') cancel(this, m);
      return trigger.call(this, name, arg);
    };
    C.update = function (dt, s = {}) {
      s = s || {}; // preserve the public Character's nullable preview input
      const m = get(this), frame = s.movementMotion, step = Math.max(0, Math.min(.1, dt || 0));
      // Actor state is authoritative. A missed notification cannot strand a
      // pose; hidden characters still advance/cancel their action clocks.
      const allowed = (s.form || 'kid') !== 'kid' && !this.dance && !(frame && (!frame.alive || frame.special));
      if (!allowed) cancel(this, m);
      else {
        if (frame) {
          const live = frame.actions?.roll;
          if (!live) m.roll = m.liveRoll = null;
          else if (live !== m.liveRoll) {
            m.liveRoll = live;
            m.roll = { age: 0, duration: cfg.roll.duration };
          }
          if (frame.superJump) { m.roll = m.top = m.burst = null; }
          if (!frame.actions?.surge) m.burst = null;
        }
        if (m.roll) {
          m.roll.age = Math.min(m.roll.duration, m.roll.age + step);
          if (!frame && m.roll.age + EPS >= m.roll.duration) m.roll = null;
        }
        if (m.top) {
          m.top.age += step;
          if (s.grounded || s.form === 'climb' || m.top.age + EPS >= m.top.duration) m.top = null;
        }
        if (m.burst) {
          m.burst.age += step;
          if (s.form !== 'climb' || m.burst.age + EPS >= m.burst.duration) m.burst = null;
        }
        if (s.grounded && s.form !== 'climb') m.roll = m.top = m.burst = null;
      }
      m.phase = null; m.charge = m.spin = 0;
      const action = frame?.actions?.surge, sj = frame?.superJump;
      if (allowed && sj?.phase === 'charge') {
        m.phase = 'superjump-charge';
        m.charge = clamp(sj.t / (frame.chargeTime ?? profile.superJump.chargeTime));
      } else if (allowed && sj?.phase === 'flight') m.phase = 'superjump-flight';
      // A wall charge/burst owns the visible pose. Do not introduce a new
      // gameplay armor-cancellation rule merely to switch the body animation.
      else if (s.form === 'climb' && action?.phase === 'charge') { m.roll = null; m.phase = 'surge-charge'; m.charge = clamp(action.charge); }
      else if (s.form === 'climb' && (action?.phase === 'burst' || m.burst)) { m.roll = null; m.phase = 'surge-burst'; m.charge = clamp(action?.charge ?? m.burst.charge); }
      else if (m.roll) { m.phase = 'roll'; m.spin = TAU * visual.rollTurns * ease(m.roll.age / m.roll.duration); }
      else if (m.top) { m.phase = 'surge-top'; m.charge = m.top.charge; m.spin = TAU * ease(m.top.age / m.top.duration); }
      const result = update.call(this, dt, s);
      // Hidden bodies skip _updateSquid. Restore an applied offset immediately
      // on cancellation rather than letting it reappear when shown again.
      if (!m.phase) restore(this, m);
      return result;
    };
    C._updateSquid = function (dt, s) {
      const m = get(this);
      // Original pose overwrites pivot from its own springs every visible tick;
      // our offset must never feed back into those springs or accumulate.
      restore(this, m);
      const result = squid.call(this, dt, s);
      if (!m.phase || this.sqScale <= .001) return result;
      const pivot = this.squid.pivot;
      m.basePosition.copy(pivot.position); m.baseQuaternion.copy(pivot.quaternion); m.baseScale.copy(pivot.scale);
      let stretch = 1;
      if (m.phase === 'roll' || m.phase === 'surge-top') {
        pivot.quaternion.multiply(m.rotation.setFromAxisAngle(m.axis, m.spin));
        const u = m.phase === 'roll' ? m.roll.age / m.roll.duration : m.top.age / m.top.duration;
        stretch = 1 - visual.rollTuck * Math.sin(Math.PI * clamp(u));
      } else if (m.phase === 'surge-charge') stretch = 1 - visual.surgeCompress * ease(m.charge);
      else if (m.phase === 'surge-burst') stretch = 1 + visual.surgeStretch * m.charge;
      else if (m.phase === 'superjump-charge') stretch = 1 - visual.superJumpCompress * ease(m.charge);
      pivot.scale.y *= stretch;
      const width = 1 / Math.sqrt(stretch);
      pivot.scale.x *= width; pivot.scale.z *= width;
      m.applied = true;
      return result;
    };
  }
  // Prototype hooks need no adapter/source anchor. Call after installMovement.
  // They delegate the full public frame, reset, death and action implementations.
  if (Actor && !installedActors.has(Actor.prototype)) {
    installedActors.add(Actor.prototype);
    const A = Actor.prototype, finish = A._finishFrame;
    A._finishFrame = function (...args) {
      const frame = this.anim.movementMotion ||= {};
      frame.actions = this.s3?.actions; frame.superJump = this.superJumpState;
      frame.chargeTime = this.s3?.jumpChargeTime;
      frame.alive = this.alive; frame.special = this.specialActive;
      return finish.apply(this, args);
    };
    for (const method of ['reset', 'splat', '_startSpecial', 'superJump']) {
      const original = A[method];
      A[method] = function (...args) {
        const result = original.apply(this, args);
        if (method === 'reset' || !this.alive || this.specialActive || this.superJumpState) {
          if (this.character) cancel(this.character, get(this.character));
          if (this.anim) delete this.anim.movementMotion;
        }
        return result;
      };
    }
  }
}
