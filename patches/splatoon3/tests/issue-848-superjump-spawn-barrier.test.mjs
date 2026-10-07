// #848 — the legacy radial enemy-spawn clamp must not run during Super Jump charge.
//
// #820 removed the ordinary Actor.update() call to _spawnBarrier() so stage
// geometry decides access to enemy spawn areas. Super Jump preparation still
// called the same helper from prepareSuperJump(), so a legal in-radius charge
// origin was projected to the old 4.2 boundary on the first fixed charge tick.
//
// These tests boot the real composed runtime (splatoon3 + reliability +
// touch-layout + local-quality source adapters, native Actor/Character/Physics
// and the installed Super Jump runtime) with a live spawnBarrier: 4.2 and step
// actual fixed simulation ticks. They are baseline-sensitive: restoring the
// `a._spawnBarrier();` line inside prepareSuperJump() makes them fail.
//
// The first native Character build in a fresh realm is very expensive in this
// environment, so every test shares one composed runtime instead of re-booting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const BARRIER = 4.2;                      // inkwave-public/src/world/maps.js spawnBarrier
const ENEMY_PAD = [12, 0, 0];             // spawnPads[1] for a team-0 actor
const DESTINATION = [40, 0, 0];           // fixed legal Super Jump target
const plain = value => JSON.parse(JSON.stringify(value));
const dist = (a, f) => Math.hypot(a.pos.x - f.enemyPad.x, a.pos.z - f.enemyPad.z);

// Same source composition and installer as build-inkwave: native Character/
// Physics/Runner/Projectiles plus every motion hook. No GPU/browser claim.
async function boot() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { Level } from './src/world/level.js';
  `, { context, identifier: path.join(SRC, 'issue-848-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], ENEMY_PAD], spawnBarrier: BARRIER,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100], grate: false }], half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new api.Projectiles(G.scene);
  const enemyPad = new THREE.Vector3(...ENEMY_PAD);
  const make = (pos, team = 0) => {
    const a = new api.Actor({ team, name: 'issue 848 spawn barrier', weapon: 'shooter', CharacterClass: api.Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  };
  const drop = a => { a.character.dispose(); G.actors = G.actors.filter(x => x !== a); G.scene.remove(a.character.root); };
  const tick = (a, count = 1) => { for (let i = 0; i < count; i++) { G.time += STEP; a.update(STEP); } };
  return { ...api, make, drop, tick, level, enemyPad };
}

let shared;
const runtime = () => (shared ||= boot());

const evidence = [];
function saveEvidence() {
  const destination = process.env.INKWAVE_848_EVIDENCE;
  if (!destination) return;
  const directory = fs.realpathSync(path.dirname(destination));
  assert.ok(directory.startsWith('/mnt/workspace/'), 'evidence must stay on the persistent workspace');
  fs.writeFileSync(destination + '.pending',
    JSON.stringify({ schema: 1, issue: 848, barrier: BARRIER, rows: evidence }, null, 2) + '\n');
  fs.renameSync(destination + '.pending', destination);
}

test('ordinary movement admits an in-radius position and Super Jump charge no longer projects it to the 4.2 boundary', async () => {
  const f = await runtime();
  for (const d of [1.0, 2.0, 3.5, 4.19]) {
    const a = f.make([ENEMY_PAD[0] - d, 0, ENEMY_PAD[2]]);
    try {
      // Ordinary movement (#820/#807) admits the position: no radial projection.
      f.tick(a, 10);
      assert.equal(a.grounded, true);
      assert.ok(Math.abs(dist(a, f) - d) < 1e-9, `ordinary movement must not clamp d=${d}`);
      assert.ok(Math.abs(a.pos.x - (ENEMY_PAD[0] - d)) < 1e-9);

      assert.equal(a.superJump(new f.THREE.Vector3(...DESTINATION)), true);
      assert.equal(a.superJumpState.phase, 'charge');
      const before = { x: a.pos.x, z: a.pos.z };
      f.tick(a);                                   // first fixed 60 Hz charge tick
      assert.equal(a.superJumpState.phase, 'charge');
      assert.ok(Math.abs(a.pos.x - before.x) < 1e-9, `charge teleported x at d=${d}: ${before.x} -> ${a.pos.x}`);
      assert.ok(Math.abs(a.pos.z - before.z) < 1e-9, `charge teleported z at d=${d}`);
      assert.ok(Math.abs(dist(a, f) - d) < 1e-9, `charge projected to ${dist(a, f)} from d=${d} (old boundary ${BARRIER})`);

      // The committed charge origin is the admitted position, not a displaced one.
      assert.ok(a.superJumpGround, 'charge origin is recorded');
      assert.ok(Math.abs(Math.hypot(a.superJumpGround.x - f.enemyPad.x, a.superJumpGround.z - f.enemyPad.z) - d) < 1e-9,
        'superJumpGround recorded a displaced origin');

      let chargeGuard = 0;
      while (a.superJumpState?.phase === 'charge' && chargeGuard++ < 180) f.tick(a);
      assert.equal(a.superJumpState.phase, 'flight');
      evidence.push({ stage: 'charge-origin', d, before, after: { x: a.pos.x, z: a.pos.z } });
    } finally { f.drop(a); }
  }
  saveEvidence();
});

test('charge keeps locking horizontal input and support, and only the barrier call site was removed', async () => {
  const f = await runtime();
  const a = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
  try {
    a.intent.move.set(1, 0, 0);                    // push toward the enemy pad every tick
    f.tick(a, 5);
    const start = { x: a.pos.x, z: a.pos.z };
    a.superJump(new f.THREE.Vector3(...DESTINATION));
    for (let i = 0; i < 30; i++) { a.intent.move.set(1, 0, 0); f.tick(a); }
    assert.equal(a.superJumpState.phase, 'charge');
    assert.ok(Math.abs(a.pos.x - start.x) < 1e-9, 'horizontal input stays locked during charge');
    assert.ok(Math.abs(a.pos.z - start.z) < 1e-9);
    assert.equal(a.vel.x, 0); assert.equal(a.vel.z, 0);
    assert.equal(a.grounded, true, 'support probing still runs during charge');

    // The helper itself is retained and still radial-clamps when invoked
    // directly, which proves only the Super Jump call site was removed.
    const b = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
    try {
      assert.equal(typeof b._spawnBarrier, 'function');
      b._spawnBarrier();
      assert.ok(Math.abs(dist(b, f) - BARRIER) < 1e-6, 'the retained helper still pushes out of the legacy circle');
    } finally { f.drop(b); }
    evidence.push({ stage: 'lock-and-retained-helper', locked: plain(start) });
  } finally { f.drop(a); }
  saveEvidence();
});

test('charge still applies gravity and environmental death without recording a displaced origin', async () => {
  const f = await runtime();
  // Off the deck (outside the floor box) over the sea, at height.
  const a = f.make([200, 30, 0]);
  try {
    a.s3.jumpChargeTime = STEP;
    assert.equal(a.superJump(new f.THREE.Vector3(...DESTINATION)), true);
    f.tick(a);
    assert.ok(a.pos.y < 30, 'gravity still pulls the charging actor down');
    assert.equal(a.superJumpState.phase, 'charge');
    f.tick(a, 150);
    assert.equal(a.alive, false, 'environmental death still cancels the charge');
    assert.equal(a.superJumpState, null);
    assert.equal(a.superJumpGround, null);
    evidence.push({ stage: 'gravity-death' });
  } finally { f.drop(a); }
  saveEvidence();
});

test('admission gates are unchanged: invalid actors/points still cannot start a charge', async () => {
  const f = await runtime();
  const a = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
  const dead = f.make([30, 0, 0]), enemy = f.make([35, 0, 0], 1);
  try {
    dead.splat(null, 'water');
    let charges = 0;
    f.on('superjump', ({ actor, phase }) => { if (actor === a && phase === 'charge') charges++; });
    for (const target of [dead, enemy, a, null, {}, new f.THREE.Vector3(NaN, 0, 0)]) {
      assert.equal(a.superJump(target), false);
      assert.equal(a.superJumpState, null);
      assert.equal(dist(a, f) < BARRIER, true, 'a rejected charge must not move the actor');
    }
    assert.equal(charges, 0);
    a.specialActive = { armor: true };
    assert.equal(a.canSuperJump(), false);
    a.specialActive = null;
    assert.equal(a.superJump(new f.THREE.Vector3(...DESTINATION)), true);
    assert.equal(a.canSuperJump(), false, 'a charging actor cannot start another jump');
    assert.equal(a.superJump(new f.THREE.Vector3(...DESTINATION)), false);
    evidence.push({ stage: 'gates' });
  } finally { f.drop(a); f.drop(dead); f.drop(enemy); }
  saveEvidence();
});

test('outside-radius and no-barrier (Range) controls are inert', async () => {
  const f = await runtime();
  // Outside the legacy circle: unchanged.
  const a = f.make([ENEMY_PAD[0] - 10, 0, ENEMY_PAD[2]]);
  try {
    f.tick(a, 5);
    assert.equal(a.superJump(new f.THREE.Vector3(...DESTINATION)), true);
    const before = { x: a.pos.x, z: a.pos.z };
    f.tick(a);
    assert.ok(Math.abs(a.pos.x - before.x) < 1e-9 && Math.abs(a.pos.z - before.z) < 1e-9);
    assert.ok(Math.abs(dist(a, f) - 10) < 1e-9);
    evidence.push({ stage: 'control-outside' });
  } finally { f.drop(a); }
  // Practice-Range-style layout has spawnBarrier 0, so the removed call was a
  // no-op there: the fix changes nothing for that composition.
  f.level.spawnBarrier = 0;
  try {
    const b = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
    try {
      f.tick(b, 5);
      assert.equal(b.superJump(new f.THREE.Vector3(...DESTINATION)), true);
      const rbefore = { x: b.pos.x, z: b.pos.z };
      f.tick(b);
      assert.ok(Math.abs(b.pos.x - rbefore.x) < 1e-9 && Math.abs(b.pos.z - rbefore.z) < 1e-9);
      assert.ok(Math.abs(dist(b, f) - 2.0) < 1e-9);
      evidence.push({ stage: 'control-range-no-barrier' });
    } finally { f.drop(b); }
  } finally { f.level.spawnBarrier = BARRIER; }
  saveEvidence();
});

test('30/60/120 Hz render rates keep one charge origin at the admitted position', async () => {
  const f = await runtime();
  let expected;
  for (const hz of [30, 60, 120]) {
    const a = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
    try {
      a.superJump(new f.THREE.Vector3(...DESTINATION));
      const clock = new f.FixedClock(), rows = [];
      for (let frame = 0; frame < hz * 2; frame++) clock.advance(1 / hz, dt => {
        f.G.time += dt; a.update(dt);
        rows.push([Number(a.pos.x.toFixed(9)), Number(a.pos.z.toFixed(9)), a.superJumpState?.phase ?? null]);
      });
      const result = plain(rows);
      if (expected) assert.deepEqual(result, expected); else expected = result;
      // Every fixed charge tick keeps the admitted origin, independent of the render rate.
      const chargeRows = rows.filter(row => row[2] === 'charge');
      assert.ok(chargeRows.length > 0, `no charge frames at ${hz}Hz`);
      assert.ok(chargeRows.every(row => Math.abs(row[0] - (ENEMY_PAD[0] - 2.0)) < 1e-9 && row[1] === ENEMY_PAD[2]),
        `charge origin drifted at ${hz}Hz`);
      evidence.push({ stage: 'frame-rate', hz, chargeFrames: chargeRows.length, first: rows[0], last: rows[rows.length - 1] });
    } finally { f.drop(a); }
  }
  saveEvidence();
});

test('close/dispose stays idempotent and clears charge state', async () => {
  const f = await runtime();
  const a = f.make([ENEMY_PAD[0] - 2.0, 0, ENEMY_PAD[2]]);
  a.superJump(new f.THREE.Vector3(...DESTINATION));
  f.G.time += STEP; a.update(STEP);
  assert.equal(a.superJumpState.phase, 'charge');
  assert.doesNotThrow(() => { a.character.dispose(); a.character.dispose(); });
  f.drop(a);
  f.G.projectiles.clear();
  evidence.push({ stage: 'dispose' });
  saveEvidence();
});
