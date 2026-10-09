import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { production, rig, grip, gameplay } from './spawn-pose-fixture.mjs';
import {
  installWeaponHitReaction, weaponHitReactionSnapshot, selectWeaponHitMotion,
  S3_DAMAGE_MOTIONS, S3_CLASS_SUFFIX_INFERENCE, WEAPON_HIT_REACTION_CALIBRATION, WEAPON_HIT_REACTION_SOURCE,
} from '../runtime/weapon-hit-reaction.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KINDS = ['shooter', 'charger', 'roller', 'dualies', 'slosher', 'splatling', 'blaster'];
// The pinned public corpus' ten WaitDamage_/WalkDamage_ class suffixes.
const CORPUS_CLASS_SUFFIXES = ['Blower', 'Chrg', 'Mnvr', 'Rllr', 'Sber', 'Shlt', 'Shtr', 'Slsh', 'Spnr', 'Strn'];
const WARMUP = 30;

function stepFor(r, frames, dz = 0) {
  for (let i = 0; i < frames; i++) { if (dz) r.a.pos.z += dz; r.step(1 / 60); }
}

/** Pose after warm-up + an optional hit, at a fixed frame offset. */
async function poseAfter(kind, { hit = null, enabled = true, frames = 6 } = {}) {
  const api = await production();
  const r = rig(api, { kind });
  r.ch.s3WeaponHitReactionEnabled = enabled;
  try {
    stepFor(r, WARMUP);
    if (hit) r.ch.trigger('hit', { x: hit.x, z: hit.z, amp: hit.amp ?? 1 });
    stepFor(r, frames);
    assert.ok(Array.from(r.ch.P).every(Number.isFinite), 'posed channels stay finite');
    return { pose: Array.from(r.ch.P), snapshot: weaponHitReactionSnapshot(r.ch) };
  } finally { r.close(); }
}

function coreIndices(api) {
  const C = api.CHARACTER_CHANNELS;
  return [C.HIPS, C.SPINE, C.CHEST, C.NECK, C.HEAD].flatMap(b => [b, b + 1, b + 2]);
}

/** Hit-minus-no-hit trace of the torso/head core: the "universal core reaction". */
async function coreDelta(kind, enabled, dir = { x: 0, z: 1 }) {
  const api = await production();
  const withHit = await poseAfter(kind, { hit: dir, enabled });
  const withoutHit = await poseAfter(kind, { hit: null, enabled });
  const core = coreIndices(api);
  return core.map(i => withHit.pose[i] - withoutHit.pose[i]);
}

function spread(vectors) {
  let max = 0;
  for (let i = 0; i < vectors.length; i++)
    for (let j = i + 1; j < vectors.length; j++)
      for (let c = 0; c < vectors[i].length; c++)
        max = Math.max(max, Math.abs(vectors[i][c] - vectors[j][c]));
  return max;
}

test('selection uses the public S3 class/state families and keeps unknowns explicit', () => {
  assert.deepEqual(Object.keys(S3_DAMAGE_MOTIONS).sort(), [...KINDS].sort());
  for (const kind of KINDS) {
    const entry = S3_DAMAGE_MOTIONS[kind];
    assert.equal(selectWeaponHitMotion(kind, false), entry.wait);
    assert.equal(selectWeaponHitMotion(kind, true), entry.walk);
    for (const name of [entry.wait, entry.walk]) {
      assert.match(name, /^(Wait|Walk)Damage_/);
      const suffix = name.split('_')[1];
      assert.ok(CORPUS_CLASS_SUFFIXES.includes(suffix), `${name} uses a corpus class suffix`);
      assert.equal(suffix, S3_CLASS_SUFFIX_INFERENCE[kind]);
    }
    assert.equal(entry.base, kind === 'blaster' ? null : `Damage_${entry.family}`,
      'only the Blaster base entry is absent from the pinned corpus');
  }
  assert.equal(S3_DAMAGE_MOTIONS.blaster.base, null);
  assert.match(S3_DAMAGE_MOTIONS.blaster.baseStatus, /no Damage_Blower/);
  assert.equal(selectWeaponHitMotion('not-a-weapon', false), null);
  assert.equal(WEAPON_HIT_REACTION_CALIBRATION.unknownCurves, true);
  assert.match(WEAPON_HIT_REACTION_CALIBRATION.status, /unknown/);
  assert.match(WEAPON_HIT_REACTION_SOURCE.corpus, /7740d29fdded2899a7633e50647736e3723c5e9a/);
  assert.ok(WEAPON_HIT_REACTION_SOURCE.dictionaries.every(url => /ParameterIlliterate|ParamHash/.test(url)));
});

test('a hit selects the state family from the live locomotion context', async () => {
  const api = await production();
  const idle = rig(api, { kind: 'shooter' });
  try {
    stepFor(idle, WARMUP);
    idle.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
    stepFor(idle, 1);
    const snap = weaponHitReactionSnapshot(idle.ch);
    assert.equal(snap.motion, 'WaitDamage_Shtr');
    assert.equal(snap.base, 'Damage_Shtr');
    assert.equal(snap.stateFamily, 'wait');
    assert.equal(snap.moving, false);
    assert.equal(snap.active, true, 'the class shaping is actually drawn');
    assert.ok(snap.envelope > 0 && snap.envelope <= 1);
    assert.equal(snap.direction.z, 1);
    assert.ok(idle.ch.hitAcc > 0, 'the native hit springs still run unchanged');
  } finally { idle.close(); }

  const walking = rig(api, { kind: 'shooter' });
  try {
    stepFor(walking, WARMUP);
    stepFor(walking, 40, 0.06); // drive the root so the native gait engages
    assert.ok(walking.ch.gaitW > 0.25, 'fixture really walks before the hit');
    walking.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
    stepFor(walking, 1);
    const snap = weaponHitReactionSnapshot(walking.ch);
    assert.equal(snap.moving, true);
    assert.equal(snap.motion, 'WalkDamage_Shtr');
    assert.equal(snap.stateFamily, 'walk');
  } finally { walking.close(); }
});

test('the same nonlethal hit no longer yields one universal core reaction', async () => {
  const kinds = ['shooter', 'charger', 'roller'];
  const native = [], shaped = [];
  for (const kind of kinds) {
    native.push(await coreDelta(kind, false));
    shaped.push(await coreDelta(kind, true));
  }
  const nativeSpread = spread(native), shapedSpread = spread(shaped);
  assert.ok(nativeSpread < 0.01, `native core hit reaction is weapon-agnostic (${nativeSpread})`);
  assert.ok(shapedSpread > 0.02, `class/state shaping separates the families (${shapedSpread})`);
  assert.ok(shapedSpread > nativeSpread * 5, 'separation comes from this lane, not from the hold layer');
  for (let i = 0; i < kinds.length; i++) {
    const introduced = spread([shaped[i], native[i]]);
    assert.ok(introduced > 0.005, `${kinds[i]} core reaction changed (${introduced})`);
  }
});

test('opposite hit directions keep a mirrored directional response', async () => {
  const api = await production();
  const spine = coreIndices(api)[3], roll = coreIndices(api)[5];
  const front = await coreDelta('shooter', true, { x: 0, z: 1 });
  const back = await coreDelta('shooter', true, { x: 0, z: -1 });
  const side = await coreDelta('shooter', true, { x: 1, z: 0 });
  assert.ok(front[spine] * back[spine] < 0, 'torso pitch flips with the hit direction');
  assert.ok(Math.abs(side[spine]) < Math.abs(front[spine]), 'a pure side hit adds little pitch');
  assert.ok(Math.abs(side[roll]) > Math.abs(front[roll]), 'a side hit rolls the torso');
});

test('real damage drives identical gameplay with the layer on or off', async () => {
  const api = await production();
  const on = rig(api, { kind: 'charger' }), off = rig(api, { kind: 'charger' });
  off.ch.s3WeaponHitReactionEnabled = false;
  try {
    stepFor(on, WARMUP); stepFor(off, WARMUP);
    on.a.damage(20, null, 'shooter'); off.a.damage(20, null, 'shooter');
    assert.equal(on.a.hp, off.a.hp);
    assert.ok(on.a.hp < 100, 'the fixture really took damage');
    stepFor(on, 45); stepFor(off, 45);
    assert.deepEqual(gameplay(on), gameplay(off),
      'hp, ink, invulnerability, position, velocity, input and runner clocks are untouched');
    assert.equal(weaponHitReactionSnapshot(on.ch).motion, 'WaitDamage_Chrg');
    assert.equal(weaponHitReactionSnapshot(off.ch).active, false);
    // hands stay on the weapon for the whole reaction
    let worst = 0;
    for (let i = 0; i < 30; i++) {
      if (i === 0) on.ch.trigger('hit', { x: -0.7, z: 1, amp: 1.6 });
      on.step(1 / 60);
      worst = Math.max(worst, grip(on, 'R'));
      assert.ok(Array.from(on.ch.P).every(Number.isFinite));
    }
    assert.ok(worst < 0.1, `weapon grip stays attached through the reaction (${worst})`);
  } finally { on.close(); off.close(); }
});

test('local and remote actors select the same family, and render cadence does not change it', async () => {
  const api = await production();
  const pick = s => ({ kind: s.kind, motion: s.motion, base: s.base, stateFamily: s.stateFamily,
    active: s.active, moving: s.moving, amp: s.amp, envelope: s.envelope, holdRelinquish: s.holdRelinquish });
  const pair = [];
  for (const remote of [false, true]) {
    const r = rig(api, { kind: 'splatling' });
    if (remote) r.a.remote = true;
    try {
      stepFor(r, WARMUP);
      r.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
      stepFor(r, 6);
      pair.push(weaponHitReactionSnapshot(r.ch));
    } finally { r.close(); }
  }
  assert.deepEqual(pick(pair[0]), pick(pair[1]), 'replicated state selects and presents identically');
  assert.ok(pair[0].holdRelinquish > 0, 'the hold layer is actually scaled back during the reaction');

  const cadence = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api, { kind: 'roller' });
    try {
      stepFor(r, WARMUP);
      r.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
      let t = 0;
      while (t < 0.2 - 1e-9) { r.step(1 / hz); t += 1 / hz; }
      const s = weaponHitReactionSnapshot(r.ch);
      assert.equal(s.motion, 'WaitDamage_Rllr');
      assert.ok(s.active && s.envelope > 0);
      assert.ok(Array.from(r.ch.P).every(Number.isFinite));
      cadence.push(s);
    } finally { r.close(); }
  }
  for (const s of cadence) {
    // `tr` is a Float32Array, so the accumulated hit clock differs between
    // cadences only by float32 rounding — never by a rendered-frame step.
    assert.ok(Math.abs(s.age - cadence[0].age) < 1e-5, 'the reaction clock is simulation time');
    assert.ok(Math.abs(s.envelope - cadence[0].envelope) < 1e-5, 'the envelope does not depend on render cadence');
  }
});

test('reaction state retires with hide/dispose and the module stays presentation-only', async () => {
  const api = await production();
  const buildPose = api.Character.prototype._buildPose;
  installWeaponHitReaction(api, api.profile);
  installWeaponHitReaction(api, api.profile);
  assert.equal(api.Character.prototype._buildPose, buildPose, 'repeat installation is a no-op');

  const fresh = rig(api, { kind: 'shooter' });
  try {
    stepFor(fresh, 1);
    const snap = weaponHitReactionSnapshot(fresh.ch);
    assert.equal(snap.motion, null, 'no hit means no damage motion');
    assert.equal(snap.active, false, 'zero hit never enters the damage pose');
    fresh.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
    stepFor(fresh, 1);
    assert.equal(weaponHitReactionSnapshot(fresh.ch).active, true);
    fresh.ch.setVisible(false);
    assert.equal(weaponHitReactionSnapshot(fresh.ch).motion, null, 'hiding retires the reaction');
  } finally { fresh.close(); }

  const source = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/weapon-hit-reaction.mjs'), 'utf8');
  for (const forbidden of ['.hp', '.ink ', '.vel.', 'invuln', 'damage(', '.splat', 'sp[', 'collide', 'netmatch'])
    assert.ok(!source.includes(forbidden), `presentation module never touches ${forbidden}`);
  assert.ok(source.includes('T_HIT'), 'the reaction rides the native hit window');
});
