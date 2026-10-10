// Ordinary weapon-family jump presentation (#1116). Public resource names and
// class/state structure identify candidate families only; they do not prove
// retail clip selection or Nintendo joint curves. Every pose profile below is
// explicitly local INKWAVE calibration in the native kid rig's space.
import { specialMotionAllowsFootPlant } from './special-motion.mjs';
const GUARD = Symbol.for('inkwave.splatoon3.jump-motion.v1');
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const mix = (a, b, w) => a + (b - a) * w;
const CANCEL_EVENTS = new Set(['land', 'spawn', 'throw', 'slosh', 'flick', 'dodge', 'special_leap', 'special_slam',
  'movement_cancel', 'squidroll', 'squidsurge', 'squidsurge_top']);
function foot(P, position, rotation, side, height, rear, pitch, tuck, weight, calibration) {
  P[position] = mix(P[position], side * calibration.ankleWidth, weight);
  P[position + 1] = mix(P[position + 1], mix(.16, height, tuck), weight);
  P[position + 2] = mix(P[position + 2], mix(-.04, rear, tuck), weight);
  P[rotation] = mix(P[rotation], mix(.2, pitch, tuck), weight);
  P[rotation + 1] = mix(P[rotation + 1], .10 * side, weight);
  P[rotation + 2] = mix(P[rotation + 2], 0, weight);
}

// #1116: public S3 animation-name corpus distinguishes family resources.
// A name is a catalog hint, NOT proof that gameplay selects that clip or proof
// of its FSKA joint tracks. This table intentionally does not invent curves.
export const JUMP_REFERENCE_CANDIDATES = Object.freeze({
  shooter: 'Jump_Shtr00', roller: 'Jump_Rllr00', dualies: 'Jump_Mnvr00',
  slosher: 'Jump_Slsh00', splatling: 'Jump_Spnr00', stringer: 'Jump_Strn00',
  brella: 'Jump_Shlt00', splatana: 'Jump_Sber00', fallback: 'Jump_Nrml00',
});
export function jumpReferenceCandidate(weaponKind) {
  return JUMP_REFERENCE_CANDIDATES[weaponKind] || JUMP_REFERENCE_CANDIDATES.fallback;
}

// #1116: the same pinned index names JumpShoot_* clips for the firing/charging
// air state of Shooter, Roller, Splatling and Charger only. Dualies, Slosher,
// Normal and Blaster have no name there, so they keep the ordinary candidate.
// Which Charger/Shooter variant plays for which shot or charge level is
// unverified; every variant is listed and none is selected here.
export const JUMP_SHOOT_REFERENCE_CANDIDATES = Object.freeze({
  shooter: Object.freeze(['JumpShoot_Shtr00', 'JumpShoot_Shtr01', 'JumpShoot_Shtr02']),
  roller: Object.freeze(['JumpShoot_Rllr00']),
  splatling: Object.freeze(['JumpShoot_Spnr00']),
  charger: Object.freeze(['JumpShoot_Chrg00', 'JumpShoot_Chrg01', 'JumpShoot_Chrg02']),
});
export function jumpShootReferenceCandidates(weaponKind) {
  const names = JUMP_SHOOT_REFERENCE_CANDIDATES[weaponKind];
  return names ? [...names] : null;
}

// These are INKWAVE-local rig calibrations, not sampled S3 curves. The public
// animation index supplies family/resource structure; visible family variation
// is authored and calibrated here until lawfully sourced joint tracks exist.
export const JUMP_MOTION_CALIBRATION = Object.freeze({
  ankleWidth: .10, leftHeight: .35, rightHeight: .33,
  leftRear: -.20, rightRear: -.22, leftPitch: .95, rightPitch: 1.02,
});
const LOCAL_POSE_CALIBRATIONS = Object.freeze({
  shooter: JUMP_MOTION_CALIBRATION,
  roller: Object.freeze({ ankleWidth: .12, leftHeight: .36, rightHeight: .34,
    leftRear: -.24, rightRear: -.26, leftPitch: 1.02, rightPitch: 1.08 }),
  dualies: Object.freeze({ ankleWidth: .09, leftHeight: .37, rightHeight: .35,
    leftRear: -.18, rightRear: -.20, leftPitch: .89, rightPitch: .96 }),
  slosher: Object.freeze({ ankleWidth: .105, leftHeight: .33, rightHeight: .31,
    leftRear: -.23, rightRear: -.25, leftPitch: .92, rightPitch: 1.00 }),
  splatling: Object.freeze({ ankleWidth: .115, leftHeight: .37, rightHeight: .35,
    leftRear: -.22, rightRear: -.24, leftPitch: 1.00, rightPitch: 1.07 }),
  normal: Object.freeze({ ankleWidth: .095, leftHeight: .32, rightHeight: .32,
    leftRear: -.18, rightRear: -.19, leftPitch: .88, rightPitch: .94 }),
});

// INKWAVE's current published profile has seven playable weapon kinds. Five
// select named ordinary-jump families from the pinned public index; Charger
// and Blaster select its shared Normal candidate. This selects local pose
// handling only; it does not load or claim to play the named Nintendo clip.
const FAMILY = (poseProfile, resourceCandidate) => Object.freeze({ poseProfile, resourceCandidate });
const JUMP_PRESENTATION_BY_KIND = Object.freeze({
  shooter: FAMILY('shooter', 'Jump_Shtr00'),
  roller: FAMILY('roller', 'Jump_Rllr00'),
  dualies: FAMILY('dualies', 'Jump_Mnvr00'),
  slosher: FAMILY('slosher', 'Jump_Slsh00'),
  splatling: FAMILY('splatling', 'Jump_Spnr00'),
  charger: FAMILY('normal', 'Jump_Nrml00'),
  blaster: FAMILY('normal', 'Jump_Nrml00'),
});
export function jumpPresentationFamily(weaponKind) {
  return JUMP_PRESENTATION_BY_KIND[weaponKind] || null;
}
export function jumpFamilyAdmitted(weaponKind) {
  return jumpPresentationFamily(weaponKind) !== null;
}

export function jumpMotionSnapshot(ch) {
  const s = ch?.[GUARD]?.states.get(ch);
  if (!s) return null;
  const active = s.started !== null, firing = active && s.firing;
  const ordinary = s.family?.resourceCandidate ?? jumpReferenceCandidate(s.weaponKind);
  // The pose values are shared by both action states; only the named catalog
  // candidate differs, and only where the public index names a firing clip.
  const shootNames = firing ? jumpShootReferenceCandidates(s.weaponKind) : null;
  return { active, age: active ? Math.max(0, ch.t - s.started) : null,
    phase: s.phase, weight: s.weight, familyKind: s.weaponKind,
    presentationProfile: s.family?.poseProfile ?? null,
    catalogCandidate: ordinary,
    actionState: active ? (firing ? 'firing' : 'ordinary') : null,
    selectedCatalogCandidates: active ? (shootNames ?? [ordinary]) : [],
    calibrationSource: 'local-inkwave-kid-rig', referenceCurveVerified: false };
}

export function installJumpMotion({ Character, Actor, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T || typeof Character.prototype._poseAir !== 'function')
    throw new Error('Jump motion requires the native Character, air hook and exact pose/timer exports');
  for (const name of ['FOOTL', 'FOOTR', 'FOOTLR', 'FOOTRR'])
    if (!Number.isInteger(C[name])) throw new Error(`Missing native jump channel ${name}`);
  for (const name of ['T_FLICK', 'T_THROW', 'T_SLOSH', 'T_SPAWN', 'T_LEAP', 'T_SLAM', 'T_DODGE'])
    if (!Number.isInteger(T[name])) throw new Error(`Missing native action timer ${name}`);
  const proto = Character.prototype;
  // A per-prototype shared symbol also guards duplicate module realms.
  if (Object.hasOwn(proto, GUARD)) return;
  const states = new WeakMap();
  Object.defineProperty(proto, GUARD, { value: { states } });
  const state = ch => {
    let s = states.get(ch);
    if (!s) { s = { started: null, phase: null, weight: 0, allowed: false, firing: false, family: null, weaponKind: null }; states.set(ch, s); }
    return s;
  };
  const clear = ch => { const s = states.get(ch); if (s) { s.started = null; s.phase = null; s.weight = 0; s.allowed = false; s.firing = false; } };
  const forget = ch => { clear(ch); const s = states.get(ch); if (s) { s.family = null; s.weaponKind = null; } };
  const timerBusy = ch => ch.tr[T.T_THROW] < .62 || ch.tr[T.T_SLOSH] < .66
    || ch.tr[T.T_FLICK] < .7 || ch.tr[T.T_SPAWN] < 1.4
    || !specialMotionAllowsFootPlant(ch, ch.tr[T.T_LEAP] >= 1.9 && ch.tr[T.T_SLAM] >= 1.4)
    || ch.tr[T.T_DODGE] < ch.dodgeDur + .3;
  const shown = ch => {
    for (let p = ch.root; p; p = p.parent) if (p.visible === false) return false;
    return true;
  };
  const interrupted = (ch, input) => {
    const a = ch._owner(), runner = ch._runner(input);
    return ch.s3JumpMotionEnabled === false || (input?.form || 'kid') !== 'kid'
      || a?.alive === false || a?.specialActive || a?.superJumpState || input?.alive === false
      || !shown(ch) || ch.dance || ch.wDance > .001 || ch.formT < .5
      || !jumpFamilyAdmitted(ch.weaponKind)
      || input?.subAim || runner?.aimingSub || runner?.dodge || runner?.s3Turret
      || ch.wSub > .001 || ch.bombHeld || timerBusy(ch);
  };
  const trigger = proto.trigger, update = proto.update, poseAir = proto._poseAir;
  const setWeapon = proto.setWeapon, dispose = proto.dispose;
  proto.trigger = function (name, arg) {
    const result = trigger.call(this, name, arg);
    if (name === 'jump') {
      const s = state(this); s.started = this.t; s.phase = null; s.weight = 0;
      s.weaponKind = this.weaponKind; s.family = jumpPresentationFamily(this.weaponKind);
    }
    else if (CANCEL_EVENTS.has(name)) clear(this);
    return result;
  };
  proto.update = function (dt, input) {
    const s = state(this);
    // Evaluate interruptions even when the native hidden-character path skips
    // posing. Never advance our own clock or write a native gameplay clock.
    if (interrupted(this, input) || s.started !== null && s.weaponKind !== this.weaponKind
      || ((input?.grounded ?? true) && this.t > (s.started ?? this.t))) clear(this);
    s.allowed = s.started !== null && s.family !== null && s.weaponKind === this.weaponKind && !(input?.grounded ?? true);
    s.firing = s.started !== null && input?.firing === true;
    s.phase = null; s.weight = 0;
    return update.call(this, dt, input);
  };
  proto._poseAir = function (P, dt, air) {
    const result = poseAir.call(this, P, dt, air), s = states.get(this);
    if (!s?.allowed || !s.family || !this.kidForm || this.grounded) return result;
    const age = Math.max(0, this.t - s.started), vy = this.vyS;
    // Reuse the native launch, apex, ground reach and long-fall envelopes.
    // This keeps takeoff extension and pre-contact reach with their owners.
    const up = smooth(-1.5, 4, vy), apex = 1 - smooth(.6, 3.2, Math.abs(vy));
    const launch = age < .3 ? 1 - smooth(.03, .2, age) : 0;
    const reach = (1 - up) * smooth(.95, .15, this.gnd);
    const longFall = smooth(.4, 1, this.airT) * (1 - up) * (1 - reach);
    const tuck = Math.max(apex, up * .85);
    const w = clamp(air) * (1 - launch) * (1 - reach) * (1 - longFall);
    s.weight = w; s.phase = launch > .5 ? 'takeoff' : vy > .6 ? 'rise' : vy < -.6 ? 'fall' : 'apex';
    const v = LOCAL_POSE_CALIBRATIONS[s.family.poseProfile];
    foot(P, C.FOOTL, C.FOOTLR, 1, v.leftHeight, v.leftRear, v.leftPitch, tuck, w, v);
    foot(P, C.FOOTR, C.FOOTRR, -1, v.rightHeight, v.rightRear, v.rightPitch, tuck, w, v);
    return result;
  };
  proto.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) forget(this);
    return setWeapon.apply(this, args);
  };
  proto.dispose = function (...args) { states.delete(this); return dispose.apply(this, args); };
  if (Actor) {
    for (const name of ['reset', 'splat']) {
      const original = Actor.prototype[name];
      Actor.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (name === 'reset' || !this.alive) forget(this.character);
        return result;
      };
    }
  }
}
