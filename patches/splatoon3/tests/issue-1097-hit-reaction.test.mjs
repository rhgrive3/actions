import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { production, rig, grip, gameplay } from './spawn-pose-fixture.mjs';
import { fixture as composedFixture } from './source-fixture.mjs';
import { installWeaponHitReaction } from '../runtime/weapon-hit-reaction.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KINDS = ['shooter', 'charger', 'roller', 'dualies', 'slosher', 'splatling', 'blaster'];
const SUFFIX = { shooter: 'Shtr', charger: 'Chrg', roller: 'Rllr', dualies: 'Mnvr', slosher: 'Slsh', splatling: 'Spnr', blaster: 'Blower' };
const HOLD = { shooter: .25, charger: .50, roller: .45, dualies: .15, slosher: .30, splatling: .45, blaster: .35 };
const SPINE = { shooter: -.10, charger: -.13, roller: .15, dualies: -.06, slosher: -.04, splatling: -.12, blaster: -.10 };
// The pinned public corpus' ten WaitDamage_/WalkDamage_ class suffixes.
const CORPUS_CLASS_SUFFIXES = ['Blower', 'Chrg', 'Mnvr', 'Rllr', 'Sber', 'Shlt', 'Shtr', 'Slsh', 'Spnr', 'Strn'];
const WARMUP = 30;
const HIT_INSTALL = Symbol.for('inkwave.s3.weapon-hit-reaction.install.v1');

// Test-only view of installed state; diagnostics stay outside the cached module.
function weaponHitReactionSnapshot(ch) {
  const s = ch?.constructor?.prototype[HIT_INSTALL]?.states.get(ch);
  const kind = s && s.k >= 0 ? ch.weaponKind : null, moving = !!s?.m;
  return {
    enabled: ch.s3WeaponHitReactionEnabled !== false, active: !!s?.on, kind,
    motion: kind ? `${moving ? 'Walk' : 'Wait'}Damage_${SUFFIX[kind]}` : null,
    base: kind && kind !== 'blaster' ? `Damage_${SUFFIX[kind]}` : null,
    stateFamily: kind ? (moving ? 'walk' : 'wait') : null,
    moving, amp: s?.a ?? 1, direction: { x: s?.x ?? 0, z: s?.z ?? 1 },
    age: s?.t ?? Infinity, envelope: s?.e ?? 0, holdRelinquish: (s?.e ?? 0) * (HOLD[kind] ?? 0),
    unknownCurves: true,
  };
}

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

test('selection uses the public S3 class/state families and keeps unknowns explicit', async () => {
  const api = await production();
  for (const kind of KINDS) {
    const r = rig(api, { kind }), control = rig(api, { kind });
    control.ch.s3WeaponHitReactionEnabled = false;
    try {
      stepFor(r, WARMUP); stepFor(control, WARMUP);
      r.ch.trigger('hit', { x: 0, z: 1, amp: 1 }); control.ch.trigger('hit', { x: 0, z: 1, amp: 1 });
      stepFor(r, 1); stepFor(control, 1);
      const snap = weaponHitReactionSnapshot(r.ch);
      assert.equal(snap.motion, `WaitDamage_${SUFFIX[kind]}`);
      assert.equal(snap.base, kind === 'blaster' ? null : `Damage_${SUFFIX[kind]}`,
        'only the Blaster base entry is absent from the pinned corpus');
      assert.equal(snap.active, true);
      for (const name of [snap.motion, `WalkDamage_${SUFFIX[kind]}`]) {
        assert.match(name, /^(Wait|Walk)Damage_/);
        assert.ok(CORPUS_CLASS_SUFFIXES.includes(name.split('_')[1]), `${name} uses a corpus class suffix`);
      }
      assert.equal(snap.unknownCurves, true);
      assert.ok(Array.from(r.ch.P).every(Number.isFinite), `${kind} hit pose channels stay finite`);
      const delta = r.ch.P[api.CHARACTER_CHANNELS.SPINE] - control.ch.P[api.CHARACTER_CHANNELS.SPINE];
      assert.ok(Math.abs(delta / snap.envelope - SPINE[kind]) < 0.002, `${kind} uses its class-specific spine profile`);
    } finally { r.close(); control.close(); }
  }
  const unknown = rig(api, { kind: 'shooter' });
  try {
    unknown.ch.weaponKind = 'not-a-weapon'; unknown.ch.trigger('hit', { x: 0, z: 1 }); stepFor(unknown, 1);
    assert.equal(weaponHitReactionSnapshot(unknown.ch).motion, null);
    assert.equal(weaponHitReactionSnapshot(unknown.ch).active, false);
  } finally { unknown.close(); }
  const reference = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/reference/weapon-hit-reaction-comparison-2026-10-09.md'), 'utf8');
  assert.match(reference, /7740d29fdded2899a7633e50647736e3723c5e9a/);
  assert.ok(reference.includes('ParameterIlliterate') && reference.includes('ParamHash'));
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

test('native solver feedback objects keep their identities during hit presentation', async () => {
  const api = await production(), r = rig(api, { kind: 'dualies' });
  try {
    stepFor(r, WARMUP);
    r.ch.trigger('hit', { x: 0.6, z: 0.8, amp: 1 });
    stepFor(r, 1);
    const refs = [r.ch.ikErr, r.ch._fL, r.ch._fR, r.ch._fLq, r.ch._fRq, r.ch._headQW,
      ...r.ch.feet.map(f => f.disp)];
    stepFor(r, 6);
    assert.equal(weaponHitReactionSnapshot(r.ch).active, true);
    const after = [r.ch.ikErr, r.ch._fL, r.ch._fR, r.ch._fLq, r.ch._fRq, r.ch._headQW,
      ...r.ch.feet.map(f => f.disp)];
    after.forEach((value, i) => assert.strictEqual(value, refs[i], 'render feedback object identity is stable'));
  } finally { r.close(); }
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}

test('composed Actor/WeaponRunner/Projectiles keep gameplay muzzle and hitscan parity under hit presentation', async () => {
  const f = await composedFixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: `
      export { Character, CHARACTER_CHANNELS, CHARACTER_TIMERS } from './inkwave-public/src/game/character.js';
    ` });
  const { G, Actor, Character, Projectiles, PLAYER, WEAPONS, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = null; G.actors = []; G.time = 0;
  G.level = { blocks: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 40)], groundHeight: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.physics.los = () => true;
  G.physics.groundProbe = (_x, _y, _z, _up, _down, _radius, hit) => { hit.hit = false; return hit; };
  let current = null;
  G.physics.raycast = (origin, direction, distance, hit) => {
    if (current) current.trace.rays.push({ origin: origin.toArray(), direction: direction.toArray(), distance });
    hit.hit = false; // no world contact and no enemy actor: explicit miss control
    return hit;
  };
  G.projectiles = new Projectiles(G.scene);
  // Warm the real beam pool before seeded A/B runs so first-use Three.js UUID
  // allocations cannot shift one side's gameplay random stream.
  const warmBeam = G.projectiles._beamMesh();
  warmBeam.visible = false; G.projectiles.beamPool.push(warmBeam);

  const wrapped = [];
  const wrap = (proto, name, make) => {
    const original = proto[name];
    proto[name] = make(original);
    wrapped.push(() => { proto[name] = original; });
  };
  for (const name of ['getMuzzle', 'getMuzzleHand', 'getAimMuzzle']) {
    wrap(Character.prototype, name, original => function (out, ...args) {
      const result = original.call(this, out, ...args);
      if (current?.actor?.character === this) current.trace.calls.push({ method: `Character.${name}`,
        frame: current.frame, hand: name === 'getMuzzleHand' ? (args[0] ?? 0) : null,
        result: typeof result === 'boolean' ? result : null, value: out.toArray() });
      return result;
    });
  }
  for (const name of ['_muzzle', '_muzzleHand']) {
    wrap(Projectiles.prototype, name, original => function (actor, ...args) {
      const result = original.call(this, actor, ...args);
      if (current?.actor === actor) current.trace.calls.push({ method: `Projectiles.${name}`,
        frame: current.frame, hand: name === '_muzzleHand' ? args[0] : null, value: result.toArray() });
      return result;
    });
  }
  const removeListener = f.on('weapon:fire', event => {
    if (current?.actor !== event.actor) return;
    current.trace.events.push({ frame: current.frame, weapon: event.weapon,
      hand: Number.isInteger(event.hand) ? event.hand : null, muzzle: event.muzzle.toArray(), direction: event.dir.toArray(),
      active: weaponHitReactionSnapshot(event.actor.character)?.active === true });
  });

  const kinds = ['shooter', 'charger', 'roller', 'dualies', 'slosher', 'splatling', 'blaster'];
  const dtFor = hz => 1 / hz;
  function createActor(kind, enabled, remote) {
    const a = new Actor({ team: 0, name: `#1097-${kind}-same-seed`, weapon: kind, CharacterClass: Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; a.character.s3WeaponHitReactionEnabled = enabled;
    a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.yaw = a.aimYaw = 0; a.aimPitch = 0.22;
    a.aimDir.set(0, Math.sin(a.aimPitch), Math.cos(a.aimPitch)); a.aimPoint.set(0, 1.6, 40);
    a.form = 'kid'; a.kidT = 10; a.grounded = true; a.ground.hit = true; a.ground.face = 0;
    a.ink = PLAYER.inkMax; a.lastFire = 99; a.lastDamage = 99; a.invuln = 0; a.remote = remote; a.netTurnRate = 0;
    a._integrate = () => {}; a._spawnBarrier = () => {}; a._updateClimb = () => {};
    a.character.root.position.copy(a.pos); a.character.root.updateMatrixWorld(true);
    G.scene.add(a.character.root); G.actors.push(a);
    return a;
  }

  function run(kind, hz, { enabled, hit = true, remote = false }) {
    const dt = dtFor(hz), w = WEAPONS[kind], ps = G.projectiles;
    ps.clear(); G.actors.length = 0; G.time = 0; current = null;
    const a = createActor(kind, enabled, remote);
    // Character/three.js construction uses Math.random for non-gameplay IDs.
    // Reset after construction so both A/B runs give the real weapon path the
    // same gameplay random stream even when shared asset caches are warm.
    const random = seededRandom(0x1097);
    f.setRandom(random);
    const trace = { events: [], calls: [], rounds: [], rays: [], hp: null, state: [] };
    let frame = 0;
    const step = fire => {
      a.intent.fire = fire;
      G.time += dt;
      const before = new Set(ps.list);
      current = { actor: a, trace, frame };
      a.update(dt);
      a.character.root.updateMatrixWorld(true); a.character.skeleton.update();
      for (const p of ps.list) if (!before.has(p) && p.owner === a)
        trace.rounds.push({ frame, type: p.type, pos: p.pos.toArray(), velocity: p.vel.toArray(), seed: p.seed });
      const hooks = Character.prototype[Symbol.for('inkwave.s3.weapon-hit-reaction.install.v1')];
      const reactionState = hooks?.states.get(a.character);
      trace.state.push({ hp: a.hp, ink: a.ink, pos: a.pos.toArray(), velocity: a.vel.toArray(),
        cooldown: a.weaponRunner.cooldown, charge: a.weaponRunner.charge, hand: a.weaponRunner.hand,
        randomCalls: random.calls, basePose: Array.from(reactionState?.basePose || []),
        hipDrop: a.character.hipDrop, ikErr: [...a.character.ikErr], ikErrPre: a.character.ikErrPre,
        feetDisp: a.character.feet.map(foot => foot.disp.toArray().map(value => +value.toFixed(12))) });
      current = null; frame++;
    };
    const damage = () => { if (hit) a.damage(12, null, 'weapon'); };
    try {
      for (let i = 0; i < 30; i++) step(false);
      if (kind === 'charger' || kind === 'splatling') {
        while (a.weaponRunner.charge < 0.88 && frame < 150) step(true);
        damage(); step(true); step(true);
        step(false); // Charger releases its hitscan; Splatling starts its real stream.
        if (kind === 'splatling' && trace.events.length === 0) step(false);
      } else if (kind === 'roller') {
        step(true); // admit the real Runner flick
        while (a.weaponRunner.flick >= 0 && a.weaponRunner.flick < w.flickWindup - dt * 2 && frame < 150) step(false);
        damage(); step(false); step(false);
      } else if (kind === 'slosher') {
        step(true); // start the real Runner heave
        damage(); step(true); step(true);
      } else {
        damage(); step(false); step(false);
      }
      const wanted = kind === 'dualies' ? 2 : 1;
      while (trace.events.length < wanted && frame < 220)
        step(kind === 'charger' || kind === 'roller' ? false : true);
      trace.hp = a.hp;
      trace.randomCalls = random.calls;
      trace.reaction = weaponHitReactionSnapshot(a.character);
      assert.equal(trace.events.length >= wanted, true, `${kind} Runner emitted real fire through Projectiles at ${hz}Hz`);
      if (hit) {
        assert.ok(trace.hp < PLAYER.hp, `${kind} receives the real nonlethal damage at ${hz}Hz`);
        if (enabled) assert.ok(trace.events.some(e => e.active),
          `${kind} fire overlaps an active hit presentation at ${hz}Hz: ${JSON.stringify(trace.reaction)}`);
        else assert.ok(trace.events.every(e => !e.active), `${kind} control keeps the class layer disabled`);
      }
      else assert.equal(trace.reaction.active, false, `${kind} miss control never creates a hit reaction`);
      if (kind === 'dualies') assert.deepEqual(new Set(trace.events.slice(0, wanted).map(e => e.hand)), new Set([0, 1]),
        'the composed Dualies case emits both native hands');
      if (kind === 'charger') assert.ok(trace.rays.length > 0, 'the real Charger hitscan raycast runs');
      return trace;
    } finally {
      current = null; G.actors.length = 0; ps.clear(); a.character.dispose(); G.scene.remove(a.character.root);
    }
  }

  function gameplayOnly(trace) {
    return { events: trace.events.map(({ active, ...event }) => event), calls: trace.calls, rounds: trace.rounds,
      rays: trace.rays, hp: trace.hp, state: trace.state.map(({ randomCalls, ...state }) => state) };
  }
  try {
    // All seven families at every requested input/render interval. The same
    // name, style, and deterministic random stream make these real A/B traces.
    for (const hz of [30, 60, 120]) for (const kind of kinds) {
      const base = run(kind, hz, { enabled: false, hit: true });
      const posed = run(kind, hz, { enabled: true, hit: true });
      assert.deepEqual(gameplayOnly(posed), gameplayOnly(base), `${kind} gameplay muzzle/projectile parity at ${hz}Hz`);
      assert.equal(posed.randomCalls, base.randomCalls, `${kind} random stream parity at ${hz}Hz`);
    }
    // Remote pose and no-hit/miss controls exercise the distinct hitscan and
    // both-hand accessors without multiplying the exhaustive family matrix.
    for (const kind of ['shooter', 'charger', 'dualies']) {
      const remoteBase = run(kind, 60, { enabled: false, hit: true, remote: true });
      const remotePosed = run(kind, 60, { enabled: true, hit: true, remote: true });
      assert.deepEqual(gameplayOnly(remotePosed), gameplayOnly(remoteBase), `${kind} remote gameplay parity`);
    }
    for (const kind of ['charger', 'dualies']) {
      const missBase = run(kind, 60, { enabled: false, hit: false });
      const missPosed = run(kind, 60, { enabled: true, hit: false });
      assert.deepEqual(gameplayOnly(missPosed), gameplayOnly(missBase), `${kind} no-hit/miss control`);
    }
  } finally {
    removeListener?.();
    for (const restore of wrapped.reverse()) restore();
    f.restoreRandom();
  }
});
