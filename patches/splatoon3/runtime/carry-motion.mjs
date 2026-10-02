// Nintendo's shooter clip ends in a supported, lowered two-hand hold. Keep
// that support through idle/walk/aim using the native hold and foregrip solver.
// This changes a rig policy, not an extracted Nintendo joint/time coefficient.
const INSTALLED = Symbol.for('inkwave.s3.carry-motion.v1');
function record(ch) { return ch?.constructor?.prototype?.[INSTALLED]; }
export function carryMotionSnapshot(ch) {
  const state = record(ch)?.states.get(ch);
  return state ? { active: state.active, resources: 0 } : null;
}
export function installCarryMotion({ Character, Actor }) {
  const P = Character?.prototype;
  if (!P?._poseWeapon || !P?.dispose) throw Error('Carry motion requires the native Character');
  if (Object.hasOwn(P, INSTALLED)) return;
  const states = new WeakMap();
  Object.defineProperty(P, INSTALLED, { value: { states } });
  const clear = ch => { if (ch) states.delete(ch); };
  const pose = P._poseWeapon, setWeapon = P.setWeapon, dispose = P.dispose;
  P._poseWeapon = function (dt, input) {
    const original = this.hold;
    if (this.s3CarryMotionEnabled === false || this.weaponKind !== 'shooter' ||
      !this.kidForm || this.dance || this._owner?.()?.alive === false || !original) {
      clear(this); return pose.call(this, dt, input);
    }
    let state = states.get(this);
    if (!state || state.source !== original) {
      state = { source: original, hold: { ...original, twoCarry: 1 }, active: true };
      states.set(this, state);
    }
    state.active = true;
    // Let the existing pose calculate both shoulder protraction and actual
    // foregrip IK. Sub/throw/fidget/special layers still detach the hand later.
    // Restore the original shared native hold even if a delegated hook throws.
    this.hold = state.hold;
    try { return pose.call(this, dt, input); }
    finally { this.hold = original; }
  };
  P.setWeapon = function (...args) { clear(this); return setWeapon.apply(this, args); };
  P.dispose = function (...args) { clear(this); return dispose.apply(this, args); };
  if (Actor?.prototype && !Object.hasOwn(Actor.prototype, INSTALLED)) {
    Object.defineProperty(Actor.prototype, INSTALLED, { value: true });
    for (const name of ['reset', 'splat']) {
      const original = Actor.prototype[name];
      Actor.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (name === 'reset' || !this.alive) clear(this.character);
        return result;
      };
    }
  }
}
