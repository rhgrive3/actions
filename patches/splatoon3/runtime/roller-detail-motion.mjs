// Additive detail for the public Character, installed after roller.mjs. Nintendo
// footage supports the motion order; these targets are INKWAVE rig calibration,
// never extracted Nintendo joint angles or a change to the gameplay clock.
const INSTALL = Symbol.for('inkwave.s3.roller-detail-motion.install.v1');
const RUNNER = Symbol.for('inkwave.s3.roller-detail-motion.runner.v1');
const ACTOR = Symbol.for('inkwave.s3.roller-detail-motion.actor.v1');
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// roller.mjs maps the horizontal release to native age .23. The native whip
// begins at .15. Meet its existing target there, without retiming the release.
const COIL_END = .15 / .23;
const COIL_ANCHOR = [-.13, 1.06, -.02];
const COIL_ROTATION = [-2.3, .3, 0];

function record(ch) { return ch?.constructor?.prototype?.[INSTALL]; }
export function rollerDetailMotionSnapshot(ch) {
  const m = record(ch)?.states.get(ch);
  if (!m) return null;
  const a = ch.s3RollerFlick;
  return { active: !!a && a === m.attack && !m.blocked,
    phase: m.blocked ? 'interrupted' : !a ? 'ready' : a.elapsed < a.windup * COIL_END ? 'startup'
      : a.elapsed < a.windup ? 'swing' : 'recovery', released: a?.released ?? false,
    vertical: a?.vertical ?? null, elapsed: a?.elapsed ?? null,
    windup: a?.windup ?? null, interval: a?.interval ?? null,
    startAnchor: m.startAnchor?.slice() ?? null, startRotation: m.startRotation?.slice() ?? null };
}

export function installRollerDetailMotion({ Character, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T, WeaponRunner, Actor }, _profile) {
  const P = Character?.prototype;
  if (!P?._poseFlick || !P?._updateStates || !P?.dispose || !P?._s3CancelRollerFlick
    || !['ANC', 'ANCR'].every(name => Number.isInteger(C?.[name]))
    || !['T_THROW', 'T_LEAP', 'T_SLAM', 'T_DODGE', 'T_SPAWN'].every(name => Number.isInteger(T?.[name])))
    throw new Error('Roller detail requires the actual public Character and exported channels/timers');
  if (Object.hasOwn(P, INSTALL)) return;
  const states = new WeakMap();
  const clear = ch => { if (ch) states.delete(ch); };
  // A prototype guard survives a second module realm. Store the state map with
  // it so either realm's snapshot reads the same installed addon.
  Object.defineProperty(P, INSTALL, { value: { states, clear } });
  const updateStates = P._updateStates, flick = P._poseFlick;
  const setWeapon = P.setWeapon, dispose = P.dispose;
  function interrupted(ch, s) {
    const a = ch._owner?.(), r = ch._runner?.(s), tr = ch.tr;
    return !ch.kidForm || !!ch.dance || a?.alive === false || !!a?.specialActive || !!a?.superJumpState
      || !!a?.s3?.actions?.roll || !!a?.s3?.actions?.surge
      || !!(s?.subAim ?? r?.aimingSub) || ch.wSub > .01 || tr[T.T_THROW] < .62
      || tr[T.T_LEAP] < 1.9 || tr[T.T_SLAM] < 1.4
      || tr[T.T_DODGE] < ch.dodgeDur || tr[T.T_SPAWN] < 1.4;
  }
  P._updateStates = function (dt, s) {
    const result = updateStates.call(this, dt, s);
    if (this.weaponKind !== 'roller' || this.s3RollerDetailMotionEnabled === false) { clear(this); return result; }
    const a = this.s3RollerFlick;
    let m = states.get(this);
    if (!m || m.attack !== a) { m = { attack: a, blocked: false, startAnchor: null, startRotation: null }; states.set(this, m); }
    // Interrupt only the visual addon/old flick layer. The runner still owns
    // attack selection, ink, projectiles, release, and whether rolling resumes.
    if (interrupted(this, s)) { m.blocked = !!a; m.startAnchor = m.startRotation = null; }
    return result;
  };
  P._poseFlick = function (pose, ft) {
    if (this.weaponKind !== 'roller' || this.s3RollerDetailMotionEnabled === false) return flick.call(this, pose, ft);
    const a = this.s3RollerFlick, m = states.get(this);
    if (interrupted(this) || (m?.attack === a && m.blocked)) return;
    // Once an actor's authoritative attack ends, the legacy .7s preview timer
    // must not replay a tail. A nullable standalone preview keeps native flicks.
    if (!a) return this._owner?.()?.weaponRunner ? undefined : flick.call(this, pose, ft);
    if (a.vertical || !(a.windup > 0) || a.elapsed >= a.windup * COIL_END) return flick.call(this, pose, ft);
    const detail = m ?? { attack: a, blocked: false, startAnchor: null, startRotation: null };
    if (!m) states.set(this, detail);
    if (!detail.startAnchor) {
      detail.startAnchor = Array.from(pose.slice(C.ANC, C.ANC + 3));
      detail.startRotation = Array.from(pose.slice(C.ANCR, C.ANCR + 3));
    }
    const result = flick.call(this, pose, ft);
    const u = ease(a.elapsed / (a.windup * COIL_END));
    // The old low-carry coil blended with the raised carry first swung forward,
    // then backward. One interpolation reaches the same existing coil endpoint.
    // Only the weapon's pre-IK pose changes; actual arms, skin and geometry use
    // the native two-bone solver and drawing hierarchy unchanged.
    for (let i = 0; i < 3; i++) {
      pose[C.ANC + i] = mix(detail.startAnchor[i], COIL_ANCHOR[i], u);
      pose[C.ANCR + i] = mix(detail.startRotation[i], COIL_ROTATION[i], u);
    }
    return result;
  };
  P.setWeapon = function (...args) { clear(this); return setWeapon.apply(this, args); };
  P.dispose = function (...args) { clear(this); return dispose.apply(this, args); };
  if (WeaponRunner?.prototype && !Object.hasOwn(WeaponRunner.prototype, RUNNER)) {
    const R = WeaponRunner.prototype, reset = R.reset;
    Object.defineProperty(R, RUNNER, { value: true });
    R.reset = function (...args) { clear(this.a?.character); return reset.apply(this, args); };
  }
  if (Actor?.prototype && !Object.hasOwn(Actor.prototype, ACTOR)) {
    const A = Actor.prototype, splat = A.splat;
    Object.defineProperty(A, ACTOR, { value: true });
    A.splat = function (...args) { const result = splat.apply(this, args); if (this.alive === false) clear(this.character); return result; };
  }
}
