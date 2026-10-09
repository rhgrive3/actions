// Issue #1097 — weapon-class hit reaction presentation (render layer only).
//
// Primary public Splatoon 3 animation-name data partitions damage motions by
// weapon family and by locomotion state, e.g. `Damage_Shtr` / `WaitDamage_Shtr`
// / `WalkDamage_Shtr`, `Damage_Chrg`, `Damage_Rllr`, `Damage_Mnvr`,
// `Damage_Slsh`, `Damage_Spnr`. INKWAVE previously had no weapon-class/state
// selection at all: every humanoid class received the same universal hit
// springs and only the ordinary hold differed afterwards.
//
// This module adds that missing selection and an additive class/state damage
// shaping on top of the untouched native hit window. It writes pose channels
// (`Character.P`) and its own per-character state only: no spring impulse, no
// timer, no HP/ink/knockback, no collision, no weapon cadence, no networking.
//
// What the public names do NOT prove: the retail 11.3.0 skeletal curves, the
// runtime chooser/blend law, per-family onset/peak/recovery frame counts and
// exact joint angles. Names alone never establish an exact pose, so every
// numeric value below is INKWAVE presentation calibration and is reported as
// unverified against the console. See
// `patches/splatoon3/reference/weapon-hit-reaction-comparison-2026-10-09.md`.

const INSTALL = Symbol.for('inkwave.s3.weapon-hit-reaction.install.v1');

const clamp = (x, lo, hi) => (x > hi ? hi : x < lo ? lo : x);
const clamp01 = x => (x > 1 ? 1 : x < 0 ? 0 : x);
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** Frozen provenance of the public S3 name data this selection is built from. */
export const WEAPON_HIT_REACTION_SOURCE = Object.freeze({
  baseline: 'Splatoon 3 Ver. 11.3.0',
  corpus: 'https://github.com/Flexlion/flexlion.github.io/blob/7740d29fdded2899a7633e50647736e3723c5e9a/assets/animations.txt',
  corpusIdentifiers: Object.freeze(['Damage_Chrg', 'Damage_Mnvr', 'Damage_Rllr', 'Damage_Sber', 'Damage_Shlt',
    'Damage_Shtr', 'Damage_Slsh', 'Damage_Spnr', 'Damage_Strn', 'WaitDamage_Blower', 'WalkDamage_Blower']),
  dictionaries: Object.freeze([
    'https://github.com/ashbinary/ParameterIlliterate/blob/1beaa8fa847f46fb014cfd42ed2bb9754ee8ce4e/ParameterIlliterate/ParamDictionary.txt',
    'https://github.com/tkgstrator/ParamHash/blob/6a274f560cfeb774b83498b153fb745ab443b453/splam/param.csv',
  ]),
  dictionaryCorroboration: 'both independent dictionaries contain Damage_Chrg / WaitDamage_Chrg / WalkDamage_Chrg and Damage_Rllr / WaitDamage_Rllr / WalkDamage_Rllr; they do not carry the remaining class entries',
  status: 'animation-name evidence only; retail skeletal curves, chooser blend law and per-family frame timing unknown',
});

/**
 * INKWAVE weapon class → public S3 damage motion families.
 * `base`/`wait`/`walk` are catalogue identifiers, not measured poses.
 * The corpus carries no base `Damage_*` entry for the Blaster family, so its
 * `base` stays null on purpose instead of being invented.
 */
export const S3_DAMAGE_MOTIONS = Object.freeze({
  shooter: Object.freeze({ kind: 'shooter', family: 'Shtr', base: 'Damage_Shtr', wait: 'WaitDamage_Shtr', walk: 'WalkDamage_Shtr' }),
  charger: Object.freeze({ kind: 'charger', family: 'Chrg', base: 'Damage_Chrg', wait: 'WaitDamage_Chrg', walk: 'WalkDamage_Chrg' }),
  roller: Object.freeze({ kind: 'roller', family: 'Rllr', base: 'Damage_Rllr', wait: 'WaitDamage_Rllr', walk: 'WalkDamage_Rllr' }),
  dualies: Object.freeze({ kind: 'dualies', family: 'Mnvr', base: 'Damage_Mnvr', wait: 'WaitDamage_Mnvr', walk: 'WalkDamage_Mnvr' }),
  slosher: Object.freeze({ kind: 'slosher', family: 'Slsh', base: 'Damage_Slsh', wait: 'WaitDamage_Slsh', walk: 'WalkDamage_Slsh' }),
  splatling: Object.freeze({ kind: 'splatling', family: 'Spnr', base: 'Damage_Spnr', wait: 'WaitDamage_Spnr', walk: 'WalkDamage_Spnr' }),
  blaster: Object.freeze({
    kind: 'blaster', family: 'Blower', base: null, wait: 'WaitDamage_Blower', walk: 'WalkDamage_Blower',
    baseStatus: 'the pinned corpus has no Damage_Blower / Damage_Blst entry; Blower is the locomotion/damage suffix for this class by elimination over the ten class suffixes (Blst appears only in amiibo/emote/shop names)',
  }),
});

/**
 * Class-family suffix ownership in the pinned corpus is inferred by set
 * completeness: the ten `WaitDamage_*` / `WalkDamage_*` class suffixes are
 * Blower, Chrg, Mnvr, Rllr, Sber, Shlt, Shtr, Slsh, Spnr, Strn — exactly the
 * ten S3 weapon classes — while `Brsh` carries locomotion but no damage entry.
 * This is naming evidence, not a proven identity with a retail skeleton.
 */
export const S3_CLASS_SUFFIX_INFERENCE = Object.freeze({
  shooter: 'Shtr', charger: 'Chrg', roller: 'Rllr', dualies: 'Mnvr', slosher: 'Slsh',
  splatling: 'Spnr', blaster: 'Blower',
  method: 'set completeness over the ten WaitDamage_/WalkDamage_ class suffixes; not a ROMFS skeleton inspection',
});

// Per-class additive shaping. Positive pitch = forward (the native ready/lean
// convention in `character.js`). Direction-independent entries describe what the
// family always does with its weapon; pitch/yaw/roll are scaled by the hit
// direction in `applyPresentation()`. These are INKWAVE shape choices, not
// Nintendo joint angles.
const SHAPES = Object.freeze({
  shooter: Object.freeze({ spine: -0.10, chest: -0.12, head: -0.15, neck: -0.05, yaw: 0.06, roll: 0.05, hips: -0.03, pelvis: -0.01, clav: 0.05, armL: -0.04, armR: -0.06, anchorY: -0.04, anchorP: 0.06, anchorR: 0.03, hold: 0.25, walkScale: 0.85 }),
  charger: Object.freeze({ spine: -0.13, chest: -0.15, head: -0.18, neck: -0.06, yaw: 0.05, roll: 0.06, hips: -0.04, pelvis: -0.02, clav: 0.08, armL: 0.05, armR: 0.11, anchorY: -0.13, anchorP: 0.18, anchorR: 0.10, hold: 0.50, walkScale: 0.80 }),
  roller: Object.freeze({ spine: 0.15, chest: 0.12, head: 0.09, neck: 0.04, yaw: -0.05, roll: -0.04, hips: 0.06, pelvis: -0.02, clav: 0.06, armL: 0.10, armR: 0.12, anchorY: -0.15, anchorP: -0.10, anchorR: -0.04, hold: 0.45, walkScale: 0.90 }),
  dualies: Object.freeze({ spine: -0.06, chest: -0.08, head: -0.10, neck: -0.03, yaw: 0.18, roll: 0.12, hips: -0.02, pelvis: -0.01, clav: 0.04, armL: -0.05, armR: -0.05, anchorY: -0.03, anchorP: 0.04, anchorR: -0.06, hold: 0.15, walkScale: 0.90 }),
  slosher: Object.freeze({ spine: -0.04, chest: 0.10, head: -0.08, neck: -0.03, yaw: 0.10, roll: -0.15, hips: 0.02, pelvis: -0.01, clav: 0.10, armL: -0.18, armR: 0.05, anchorY: -0.07, anchorP: 0.06, anchorR: 0.08, hold: 0.30, walkScale: 0.85 }),
  splatling: Object.freeze({ spine: -0.12, chest: -0.10, head: -0.14, neck: -0.05, yaw: 0.04, roll: 0.05, hips: -0.05, pelvis: -0.02, clav: 0.16, armL: 0.08, armR: 0.08, anchorY: -0.11, anchorP: -0.06, anchorR: 0.04, hold: 0.45, walkScale: 0.85 }),
  blaster: Object.freeze({ spine: -0.10, chest: -0.14, head: -0.15, neck: -0.05, yaw: 0.07, roll: 0.05, hips: -0.03, pelvis: -0.01, clav: 0.07, armL: -0.03, armR: -0.04, anchorY: -0.09, anchorP: 0.12, anchorR: 0.05, hold: 0.35, walkScale: 0.85 }),
});

/** Public S3 state family for the current locomotion context. */
export function selectWeaponHitMotion(kind, moving) {
  const entry = S3_DAMAGE_MOTIONS[kind];
  if (!entry) return null;
  return moving ? entry.walk : entry.wait;
}

function envelope(age, cfg) {
  if (!Number.isFinite(age) || age < 0 || age >= cfg.release) return 0;
  const held = clamp01((age - cfg.hold) / (cfg.release - cfg.hold));
  return Math.min(1, age / cfg.attack) * (1 - smooth(held));
}

function stateOf(ch) {
  const hooks = ch?.[INSTALL];
  return hooks ? hooks.states.get(ch) : null;
}

function stateFor(ch) {
  const hooks = ch[INSTALL];
  let s = hooks.states.get(ch);
  if (!s) {
    s = { kind: null, motion: null, base: null, stateFamily: null, moving: false, amp: 1,
      dirX: 0, dirZ: 1, age: Infinity, envelope: 0, hold: 0, applied: false, preHold: null };
    hooks.states.set(ch, s);
  }
  return s;
}

/** Live selection/presentation state for one Character; `motion` is the public S3 state family. */
export function weaponHitReactionSnapshot(ch) {
  const s = stateOf(ch);
  if (!s) return null;
  return {
    enabled: ch.s3WeaponHitReactionEnabled !== false,
    active: s.applied, kind: s.kind, motion: s.motion, base: s.base, stateFamily: s.stateFamily,
    moving: s.moving, amp: s.amp, direction: { x: s.dirX, z: s.dirZ },
    age: s.age, envelope: s.envelope, holdRelinquish: s.hold,
    unknownCurves: WEAPON_HIT_REACTION_CALIBRATION.unknownCurves,
    status: WEAPON_HIT_REACTION_CALIBRATION.status,
    source: WEAPON_HIT_REACTION_SOURCE.corpus,
  };
}

function select(ch, arg) {
  const s = stateFor(ch);
  const entry = S3_DAMAGE_MOTIONS[ch.weaponKind] || null;
  const moving = (ch.gaitW || 0) > WEAPON_HIT_REACTION_CALIBRATION.locomotionThreshold;
  let x = 0, z = 1, amp = 1;
  if (arg && typeof arg === 'object') {
    x = +arg.x || 0; z = +arg.z || 0;
    const l = Math.hypot(x, z);
    if (l > 1e-4) { x /= l; z /= l; } else { z = 1; }
    amp = clamp(arg.amount ?? arg.amp ?? 1, 0.3, 1.6);
  } else if (typeof arg === 'number' && Number.isFinite(arg)) amp = clamp(arg, 0.3, 1.4);
  s.kind = ch.weaponKind;
  s.motion = entry ? selectWeaponHitMotion(ch.weaponKind, moving) : null;
  s.base = entry ? entry.base : null;
  s.stateFamily = entry ? (moving ? 'walk' : 'wait') : null;
  s.moving = moving; s.amp = amp; s.dirX = x; s.dirZ = z;
  s.age = 0; s.envelope = 0; s.hold = 0; s.applied = false; s.preHold = null;
}

function eligible(ch, s) {
  return ch.s3WeaponHitReactionEnabled !== false && !!s.motion && ch.kidForm && !ch.dance
    && !!ch.root.visible && ch._owner()?.alive !== false;
}


/**
 * Presentation calibration only. The envelope rides inside the native `T_HIT`
 * window; the native hit springs themselves are untouched. Onset/peak/recovery
 * here are INKWAVE visual values, NOT measured per-family S3 timings.
 */
export const WEAPON_HIT_REACTION_CALIBRATION = Object.freeze({
  attack: 0.04, hold: 0.10, release: 0.60, locomotionThreshold: 0.25,
  unknownCurves: true,
  status: 'INKWAVE visual calibration inside the native hit window; retail 11.3.0 damage skeletal curves, chooser/blend law and per-family onset/peak/recovery timing are unknown',
});

function applyPresentation(ch, timers, channels) {
  const s = stateFor(ch);
  const cfg = WEAPON_HIT_REACTION_CALIBRATION;
  s.age = ch.tr[timers.T_HIT];
  const env = eligible(ch, s) ? envelope(s.age, cfg) : 0;
  s.envelope = env; s.applied = false; s.hold = 0;
  if (env <= 0) return;
  const shape = SHAPES[s.kind];
  if (!shape) return;
  const P = ch.P, C = channels;
  const w = env * shape.hold;
  s.hold = w;
  // The reference damage pose owns the weapon trajectory: the ordinary
  // hold/aim layer written by `_poseWeapon` is scaled back for this family
  // instead of being merely shaken. Anchor/pole channels only, applied before
  // the class shaping so the damage carriage itself stays fully present.
  if (s.preHold && w > 0.001) {
    for (const base of [C.ANC, C.ANCR, C.ANL, C.ANLR, C.POLER, C.POLEL]) {
      for (let i = base; i < base + 3; i++) {
        const before = s.preHold[i];
        P[i] = before + (P[i] - before) * (1 - w);
      }
    }
  }
  const k = env * s.amp * (s.moving ? shape.walkScale : 1);
  const hz = clamp(s.dirZ, -1, 1), hx = clamp(s.dirX, -1, 1);
  // Directional core: a frontal hit pitches the torso back, a rear hit pitches
  // it forward, side hits roll/twist away — mirrored by the hit vector sign.
  P[C.SPINE] += shape.spine * hz * k; P[C.SPINE + 1] += shape.yaw * hx * k; P[C.SPINE + 2] += shape.roll * hx * k;
  P[C.CHEST] += shape.chest * hz * k; P[C.CHEST + 1] += shape.yaw * 0.6 * hx * k; P[C.CHEST + 2] += shape.roll * 0.6 * hx * k;
  P[C.NECK] += shape.neck * hz * k; P[C.HEAD] += shape.head * hz * k; P[C.HEAD + 1] += shape.yaw * 0.8 * hx * k;
  P[C.HIPS] += shape.hips * hz * k; P[C.HIPS_P + 1] += shape.pelvis * k;
  // Family carriage: clavicle brace, arm posture and weapon drop do not depend
  // on where the hit came from — that is the weapon-class difference.
  P[C.CLAVL + 2] += shape.clav * k; P[C.CLAVR + 2] -= shape.clav * k;
  P[C.UARML] += shape.armL * k; P[C.UARMR] += shape.armR * k;
  const ay = shape.anchorY * k, az = shape.anchorP * k, rx = shape.anchorR * k;
  P[C.ANC + 1] += ay; P[C.ANC + 2] += az; P[C.ANCR] += rx;
  if (ch.dual) { P[C.ANL + 1] += ay; P[C.ANL + 2] += az; P[C.ANLR] += rx; }
  s.applied = true;
}

export function installWeaponHitReaction(api, _profile) {
  const { Character, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T } = api;
  if (!Character || !C || !Number.isInteger(T?.T_HIT))
    throw new Error('Weapon-class hit reaction requires the native Character, pose channels and T_HIT timer');
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALL)) return; // another module realm already installed it
  const states = new WeakMap();
  Object.defineProperty(proto, INSTALL, { value: { states } });
  const trigger = proto.trigger, buildPose = proto._buildPose, poseWeapon = proto._poseWeapon,
    setWeapon = proto.setWeapon, setVisible = proto.setVisible, dispose = proto.dispose;
  proto.trigger = function (name, ...args) {
    const result = trigger.call(this, name, ...args);
    // Selection happens once, at the hit, from the weapon class and locomotion
    // state that both local and remote actors replicate.
    if (name === 'hit') select(this, args[0]);
    return result;
  };
  proto._poseWeapon = function (dt, s) {
    const value = stateOf(this);
    if (value?.motion && eligible(this, value) && this.tr[T.T_HIT] < WEAPON_HIT_REACTION_CALIBRATION.release) {
      value.preHold ||= new Float32Array(this.P.length);
      value.preHold.set(this.P);
    }
    return poseWeapon.call(this, dt, s);
  };
  proto._buildPose = function (dt, s) {
    const result = buildPose.call(this, dt, s);
    applyPresentation(this, T, C);
    return result;
  };
  proto.setWeapon = function (...args) {
    const value = stateOf(this);
    const result = setWeapon.apply(this, args);
    // A weapon swap mid-reaction re-selects from the new class, as S3 would.
    if (value?.motion && args[0] !== value.kind) select(this, null);
    return result;
  };
  proto.setVisible = function (value) {
    if (!value) { const s = stateOf(this); if (s) { s.motion = null; s.applied = false; s.hold = 0; s.preHold = null; } }
    return setVisible.call(this, value);
  };
  proto.dispose = function (...args) {
    const s = stateOf(this);
    if (s) { s.motion = null; s.applied = false; s.hold = 0; s.preHold = null; }
    return dispose.apply(this, args);
  };
}

