// #879: weapon-family spawn presentation, layered BEFORE native hand/weapon IK.
// See reference/spawn-pose-calibration.md for screenshot provenance and the
// explicit distinction between S3 silhouettes and this rig's original curves.
// No launch trajectory, input lock, armor lifetime, or network packet is changed.
const INSTALLED = Symbol.for('inkwave.s3.spawn-pose-motion.v1');
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x*x*(3-2*x); };
const pose = (peakFrame, recoverFrame, endFrame, values) => Object.freeze({
  peakFrame, recoverFrame, endFrame,
  values: Object.freeze(Object.entries(values).map(([channel, delta]) =>
    Object.freeze([channel, Object.freeze(Array.isArray(delta) ? delta : [delta])]))),
});
// Offsets from the native carry pose: translations in rig units, angles in
// radians. These are deliberately labelled calibration, not Nintendo data.
export const SPAWN_POSE_CALIBRATION = Object.freeze({
  shooter: pose(5, 13, 29, { SPINE: [-.08, .04, 0], ANC: [0, .045, -.025], ANCR: [-.18, .08, .02], FOOTL: [0, .05, -.03] }),
  roller: pose(6, 16, 32, { SPINE: [-.10, -.08, 0], ANC: [0, .025, -.025], ANCR: [-.20, -.14, -.04], FOOTR: [0, .07, -.045] }),
  charger: pose(5, 14, 30, { SPINE: [.06, .10, 0], ANC: [0, .025, -.02], ANCR: [.13, -.18, .03], FOOTL: [0, .06, .015] }),
  slosher: pose(5, 13, 28, { SPINE: [.10, -.04, 0], ANC: [0, -.025, -.025], ANCR: [.17, .08, 0], FOOTR: [0, .045, -.025] }),
  splatling: pose(7, 17, 34, { SPINE: [-.12, -.10, 0], ANC: [0, .035, -.02], ANCR: [-.12, .12, .06], FOOTL: [0, .075, -.025] }),
  dualies: pose(4, 12, 28, { SPINE: [-.06, 0, 0], ANC: [0, .05, -.02], ANCR: [-.26, -.12, -.04], ANL: [0, .05, -.02], ANLR: [-.26, .12, .04], FOOTR: [0, .055, -.02] }),
  blaster: pose(6, 14, 30, { SPINE: [.06, -.06, 0], ANC: [0, -.02, -.035], ANCR: [.15, .08, -.03], FOOTL: [0, .055, -.02] }),
});
function hooks(ch) { return ch?.[INSTALLED]; }
function clear(ch, reason = 'cancelled') {
  const s = hooks(ch)?.states.get(ch);
  if (s) { s.phase = 'off'; s.weight = 0; s.reason = reason; }
}
export function spawnPoseSnapshot(ch) {
  const s = hooks(ch)?.states.get(ch);
  return s ? { family: s.family, phase: s.phase, age: s.age, weight: s.weight, reason: s.reason } : null;
}
export function installSpawnPoseMotion({ Character, Actor, CHARACTER_CHANNELS: channels, CHARACTER_TIMERS: timers }) {
  if (!Character || !Number.isInteger(timers?.T_SPAWN) || !channels)
    throw new Error('Spawn pose requires the native Character channels/timers');
  const C = Character.prototype;
  if (Object.hasOwn(C, INSTALLED)) return;
  const states = new WeakMap();
  // Resolve channels once, not per Actor tick. Missing dual anchors must fail
  // explicitly rather than corrupting a Float32Array with an undefined index.
  const tables = Object.create(null);
  for (const [family, cfg] of Object.entries(SPAWN_POSE_CALIBRATION)) {
    tables[family] = cfg.values.map(([name, values]) => {
      if (!Number.isInteger(channels[name])) throw new Error('Missing spawn pose channel '+name);
      return [channels[name], values];
    });
  }
  Object.defineProperty(C, INSTALLED, { value: { states } });
  const trigger = C.trigger, spawn = C._poseSpawn, updateStates = C._updateStates;
  const setWeapon = C.setWeapon, visible = C.setVisible, dispose = C.dispose;
  C.trigger = function (name, ...args) {
    const result = trigger.call(this, name, ...args);
    if (name === 'spawn' && this.s3SpawnPoseMotionEnabled !== false && this.s3HitSpawnMotionEnabled !== false) {
      const family = this.weaponKind;
      if (SPAWN_POSE_CALIBRATION[family])
        states.set(this, { family, phase: 'launch', age: 0, weight: 0, reason: null });
      else clear(this, 'unsupported-weapon');
    } else if (['land', 'splat', 'shoot', 'slosh', 'flick', 'throw', 'dodge', 'jump', 'special_leap', 'special_slam'].includes(name)) clear(this, name);
    return result;
  };
  C._updateStates = function (dt, frame) {
    const result = updateStates.call(this, dt, frame);
    const s = states.get(this);
    if (!s || s.phase === 'off') return result;
    const owner = this._owner?.();
    // Grounded/life/action bits come from Actor (including sampled remote
    // Actors). Armor and character-coating timers do not own this pose.
    if (this.s3SpawnPoseMotionEnabled === false || this.s3HitSpawnMotionEnabled === false || !this.visible || this.dance || !this.kidForm || owner?.alive === false || this.grounded || owner?.grounded || owner?.specialActive || owner?.superJumpState || frame?.firing || frame?.charge > 0 || frame?.subAim || frame?.rolling || owner?.weaponRunner?.dodge) {
      clear(this, 'state-interruption'); return result;
    }
    const cfg = SPAWN_POSE_CALIBRATION[s.family];
    // The existing native timer is advanced by fixed simulation, and its
    // spawn trigger already travels on NetMatch's timestamped event timeline.
    // No render-delta clock or local-only branch is introduced.
    s.age = Math.max(0, this.tr[timers.T_SPAWN]);
    const f = s.age * 60;
    if (f + 1e-5 >= cfg.endFrame) { clear(this, 'recovered'); return result; }
    s.phase = f + 1e-5 < cfg.peakFrame ? 'launch' : f + 1e-5 < cfg.recoverFrame ? 'flight' : 'recovery';
    s.weight = smooth(f / cfg.peakFrame) * (1-smooth((f-cfg.recoverFrame)/(cfg.endFrame-cfg.recoverFrame)));
    return result;
  };
  C._poseSpawn = function (P, st) {
    if (this.s3HitSpawnMotionEnabled === false) return spawn.call(this, P, st);
    const s = states.get(this);
    if (this.s3SpawnPoseMotionEnabled === false || !s || s.phase === 'off' || s.weight <= 0) return;
    // Native air/weapon layers supplied the pose; adjust only targets before
    // the one native IK solve. Never write bone matrices, detach a hand,
    // commandeer LTW, or write gameplay position, velocity or projectile data.
    for (const [start, values] of tables[s.family])
      for (let i=0; i<values.length; i++) P[start+i] += values[i]*s.weight;
  };
  C.setWeapon = function (kind, ...args) {
    const old = this.weaponKind, result = setWeapon.call(this, kind, ...args);
    if (this.weaponKind !== old) clear(this, 'weapon-change');
    return result;
  };
  C.setVisible = function (value) { if (!value) clear(this, 'hidden'); return visible.call(this, value); };
  C.dispose = function (...args) { clear(this, 'disposed'); states.delete(this); return dispose.apply(this, args); };
  if (Actor && !Object.hasOwn(Actor.prototype, INSTALLED)) {
    const reset = Actor.prototype.reset;
    Object.defineProperty(Actor.prototype, INSTALLED, { value: true });
    Actor.prototype.reset = function (...args) { if (this.character) clear(this.character, 'reset'); return reset.apply(this, args); };
  }
}
