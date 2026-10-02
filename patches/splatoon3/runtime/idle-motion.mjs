// Match idle only. Nintendo's short shooter demonstrations show a restrained
// carry between attacks, not a measured full idle cycle. Removing the large
// showcase flourishes and reducing the native look gesture is visual calibration.
// Native breathing, planted feet, turns, walk and weapon/action poses stay native.
export const IDLE_MOTION_CALIBRATION = Object.freeze({
  lookWeight: .20,
  status: 'visual calibration; original idle frequencies and joint curves unknown',
});
const INSTALL = Symbol.for('inkwave.s3.idle-motion.install.v1');
function state(ch) {
  const states = ch[INSTALL].states;
  let m = states.get(ch);
  if (!m) {
    m = { phase: 'off', reason: 'unowned', quiet: false, filtered: 0, looks: 0, pose: null };
    states.set(ch, m);
  }
  return m;
}
function clear(ch, reason) {
  const m = ch?.[INSTALL]?.states.get(ch);
  if (m) { m.phase = 'off'; m.reason = reason; m.quiet = false; m.pose = null; }
}
function classify(ch, s, api) {
  const actor = ch._owner(), T = api.CHARACTER_TIMERS, tr = ch.tr;
  if (ch.s3IdleMotionEnabled === false || !actor || !ch.inWorld || !api.G.match?.playing?.()
      || ch.dance || ch.wDance > .001) return 'outside-match';
  if (!actor.alive || !ch.root.visible) return 'hidden-or-dead';
  if (!ch.kidForm || !ch.grounded || ch.formT < .5 || ch.wAir > .01) return 'form-or-air';
  if (ch.moving || (s.speed || 0) > 0 || ch.gs > .01 || ch.gv > .01 || ch.gaitW > .01)
    return 'walk';
  const runner = ch._runner(s);
  if (s.subAim || ch.wSub > .001 || ch.bombHeld || runner?.aimingSub
      || tr[T.T_THROW] < .62) return 'sub';
  if (s.firing || (s.charge || 0) > 0 || ch.wAim > .05 || ch.wRoll > .05
      || s.rolling || runner?.charging || runner?.streaming || runner?.rolling
      || runner?.dodge || runner?.s3Turret || (runner?.lockT || 0) > 0
      || tr[T.T_FLICK] < .7 || tr[T.T_SLOSH] < .66 || tr[T.T_REL] < .35
      || ch.lastShot < .5 || ch.lastRelease < .35) return 'weapon';
  if (actor.specialActive || actor.superJumpState || actor.s3?.actions?.roll
      || actor.s3?.actions?.surge || actor.hurtFlash > 0 || ch.hitAcc > 0
      || tr[T.T_SPAWN] < 1.4 || tr[T.T_LEAP] < 1.9 || tr[T.T_SLAM] < 1.4
      || tr[T.T_DODGE] < ch.dodgeDur + .3 || tr[T.T_LAND] < .8 && ch.landAmp > .3)
    return 'action';
  return 'quiet';
}
export function idleMotionSnapshot(ch) {
  const hooks = ch?.[INSTALL], m = hooks?.states.get(ch);
  return { phase: m?.phase || 'off', reason: m?.reason || 'unowned',
    quiet: !!m?.quiet, filteredFidgets: m?.filtered || 0, looks: m?.looks || 0,
    ownedResources: 0, disposed: !!hooks?.disposed.has(ch) };
}
export function installIdleMotion(api, _profile) {
  const C = api.Character?.prototype, A = api.Actor?.prototype;
  if (!C?._poseFidget || !C._owner || !api.G || !api.CHARACTER_TIMERS || !api.CHARACTER_CHANNELS)
    throw Error('Idle motion requires production Character, G, channel and timer exports');
  if (Object.prototype.hasOwnProperty.call(C, INSTALL)) return;
  // Diagnostics imported in another realm must use the installed registry,
  // just as duplicate installers use this globally registered prototype key.
  const states = new WeakMap(), disposed = new WeakSet();
  Object.defineProperty(C, INSTALL, { value: { states, disposed } });
  const updateStates = C._updateStates, fidget = C._poseFidget;
  C._updateStates = function (dt, s) {
    const result = updateStates.call(this, dt, s);
    const m = state(this), reason = classify(this, s || {}, api);
    m.reason = reason; m.quiet = reason === 'quiet';
    m.phase = m.quiet ? 'ready' : 'off';
    return result;
  };
  C._poseFidget = function (P, id, elapsed) {
    const m = states.get(this);
    if (!m || m.reason === 'outside-match') return fidget.call(this, P, id, elapsed);
    // Fidgets are the idle lane. Never let them override sub aim, one-shots,
    // charging, forms or moving locomotion, which were authored earlier in P.
    if (!m.quiet || id !== 2) { if (this._dt > 0) m.filtered++; return; }
    // Retain only the native looking-around gesture (id 2). It has no weapon,
    // hand-target, spring impulse or foot side effects. Reuse its native eased
    // curve, reduce its pose delta, and let native IK apply the resulting pose.
    const before = m.pose || (m.pose = new Float32Array(P.length));
    before.set(P); fidget.call(this, P, id, elapsed);
    for (let i = 0; i < P.length; i++)
      P[i] = before[i] + (P[i] - before[i]) * IDLE_MOTION_CALIBRATION.lookWeight;
    // A match glance keeps the carry facing the controlled body direction.
    // The source look fidget rotates the chest too, moving the weapon with it.
    // Leave that showcase detail outside the match-only head/eye gesture.
    const channels = api.CHARACTER_CHANNELS;
    P[channels.SPINE + 1] = before[channels.SPINE + 1];
    P[channels.CHEST + 1] = before[channels.CHEST + 1];
    if (this._dt > 0) m.looks++;
  };
  const update = C.update, dispose = C.dispose, setWeapon = C.setWeapon, visible = C.setVisible;
  C.update = function (...args) { if (!disposed.has(this)) return update.apply(this, args); };
  C.setWeapon = function (...args) {
    clear(this, 'weapon-change'); return setWeapon.apply(this, args);
  };
  C.setVisible = function (...args) {
    if (!args[0]) clear(this, 'hidden'); return visible.apply(this, args);
  };
  C.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this); states.delete(this); return dispose.apply(this, args);
  };
  if (A) {
    const reset = A.reset, splat = A.splat;
    A.reset = function (...args) {
      const result = reset.apply(this, args); clear(this.character, 'reset'); return result;
    };
    A.splat = function (...args) {
      const result = splat.apply(this, args);
      if (!this.alive) clear(this.character, 'death'); return result;
    };
  }
}
