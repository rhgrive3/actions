import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptIssue405 } from '../issue-405-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

async function createFixture({ apply405 = true } = {}) {
  const context = vm.createContext({ console, performance });
  const modules = new Map();

  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }

  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    let source = file.startsWith(UPSTREAM + path.sep)
      ? adaptSource(relative, fs.readFileSync(file, 'utf8'))
      : fs.readFileSync(file, 'utf8');

    if (apply405 && file.startsWith(UPSTREAM + path.sep)) {
      source = adaptIssue405(relative, source);
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }

  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture-405.mjs') });

  await root.link((spec, from) => load(resolve(spec, from.identifier)));
  await root.evaluate();
  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player);
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) {
    api[install](api, profile);
  }
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.time = 0;
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true };
  class Character {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {}
  }
  function make(weapon = 'shooter') {
    const a = new api.Actor({ team: 0, name: 'fixture-405', weapon, CharacterClass: Character });
    a.grounded = true; a.ground.hit = true; a.ground.face = 0;
    a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
    return a;
  }
  return { ...api, profile, make };
}

// -----------------------------------------------------------------------------
// 1. MAIN NEGATIVE COUNTEREXAMPLE: Unpatched baseline exhibits 78/58 ≈ 1.345x ratio;
//    patched build exhibits exactly 1.00 deceleration ratio.
// -----------------------------------------------------------------------------
test('Issue #405 negative counterexample: unpatched exhibits 78/58=1.345x reversal ratio, patched aligns to 1.00', async () => {
  // A. Unpatched run (negative counterexample demonstrating Issue #405 defect)
  {
    const fUnpatched = await createFixture({ apply405: false });
    const aNeutral = fUnpatched.make('shooter');
    const aReverse = fUnpatched.make('shooter');
    const topSpeed = fUnpatched.PLAYER.runSpeed; // 5.76 WU/s from S3 profile

    // Setup initial running state: moving forward along +Z at top speed
    aNeutral.vel.set(0, 0, topSpeed);
    aReverse.vel.set(0, 0, topSpeed);

    // Case 1: Release stick (neutral: move = (0, 0))
    aNeutral.intent.move.set(0, 0, 0);
    aNeutral._horizontal(1 / 60, false, false);
    const deltaVNeutral = topSpeed - aNeutral.vel.z;

    // Case 2: Exact 180° reversal (move = (0, -1))
    aReverse.intent.move.set(0, 0, -1);
    aReverse._horizontal(1 / 60, false, false);
    const deltaVReverse = topSpeed - aReverse.vel.z;

    const ratioUnpatched = deltaVReverse / deltaVNeutral;
    // Expected unpatched: 58/60 neutral vs 78/60 reverse -> ratio = 78/58 ≈ 1.344827...
    assert.ok(Math.abs(deltaVNeutral - 58 / 60) < 1e-6, `Neutral deltaV: ${deltaVNeutral}`);
    assert.ok(Math.abs(deltaVReverse - 78 / 60) < 1e-6, `Reverse deltaV: ${deltaVReverse}`);
    assert.ok(Math.abs(ratioUnpatched - 78 / 58) < 1e-6, `Unpatched ratio was ${ratioUnpatched}, expected 78/58`);
  }

  // B. Patched run (fix applied via issue-405-adapter)
  {
    const fPatched = await createFixture({ apply405: true });
    const aNeutral = fPatched.make('shooter');
    const aReverse = fPatched.make('shooter');
    const topSpeed = fPatched.PLAYER.runSpeed; // 5.76 WU/s

    aNeutral.vel.set(0, 0, topSpeed);
    aReverse.vel.set(0, 0, topSpeed);

    // Case 1: Release stick
    aNeutral.intent.move.set(0, 0, 0);
    aNeutral._horizontal(1 / 60, false, false);
    const deltaVNeutral = topSpeed - aNeutral.vel.z;

    // Case 2: 180° reversal
    aReverse.intent.move.set(0, 0, -1);
    aReverse._horizontal(1 / 60, false, false);
    const deltaVReverse = topSpeed - aReverse.vel.z;

    const ratioPatched = deltaVReverse / deltaVNeutral;
    assert.ok(Math.abs(deltaVNeutral - 58 / 60) < 1e-6, `Patched neutral deltaV: ${deltaVNeutral}`);
    assert.ok(Math.abs(deltaVReverse - 58 / 60) < 1e-6, `Patched reverse deltaV: ${deltaVReverse}`);
    assert.ok(Math.abs(ratioPatched - 1.00) < 1e-9, `Patched ratio is ${ratioPatched}, expected exactly 1.00`);
  }
});

// -----------------------------------------------------------------------------
// 2. ORDINARY DECELERATION: 30Hz, 60Hz, 120Hz fixed time steps & trajectory
// -----------------------------------------------------------------------------
test('Ordinary deceleration ratio is 1.00 across 30Hz, 60Hz, and 120Hz simulation rates', async () => {
  const f = await createFixture({ apply405: true });
  const topSpeed = f.PLAYER.runSpeed;

  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const aNeutral = f.make('shooter');
    const aReverse = f.make('shooter');

    aNeutral.vel.set(0, 0, topSpeed);
    aReverse.vel.set(0, 0, topSpeed);

    aNeutral.intent.move.set(0, 0, 0);
    aReverse.intent.move.set(0, 0, -1);

    aNeutral._horizontal(dt, false, false);
    aReverse._horizontal(dt, false, false);

    const deltaVNeutral = topSpeed - aNeutral.vel.z;
    const deltaVReverse = topSpeed - aReverse.vel.z;

    const expectedDelta = 58 * dt;
    assert.ok(Math.abs(deltaVNeutral - expectedDelta) < 1e-6, `Hz ${hz} neutral delta ${deltaVNeutral} vs ${expectedDelta}`);
    assert.ok(Math.abs(deltaVReverse - expectedDelta) < 1e-6, `Hz ${hz} reverse delta ${deltaVReverse} vs ${expectedDelta}`);
    assert.ok(Math.abs((deltaVReverse / deltaVNeutral) - 1.0) < 1e-9, `Hz ${hz} ratio is 1.00`);
  }
});

test('Multi-frame deceleration trajectory maintains consistent 58 WU/s² braking rate', async () => {
  const f = await createFixture({ apply405: true });
  const topSpeed = f.PLAYER.runSpeed;
  const dt = 1 / 60;
  const aReverse = f.make('shooter');
  aReverse.vel.set(0, 0, topSpeed);
  aReverse.intent.move.set(0, 0, -1);

  // Over the first 3 frames while speed is above runDecelKnee (2.2 WU/s):
  // deltaV should be exactly 58/60 per tick
  for (let frame = 1; frame <= 3; frame++) {
    const vBefore = aReverse.vel.z;
    aReverse._horizontal(dt, false, false);
    const stepDecel = vBefore - aReverse.vel.z;
    assert.ok(Math.abs(stepDecel - 58 / 60) < 1e-6, `Frame ${frame} decel: ${stepDecel}`);
  }
});

// -----------------------------------------------------------------------------
// 3. DIAGONAL & ANGLE TRANSITIONS: 90°, 120°, 130°, 150°, 180°
// -----------------------------------------------------------------------------
test('Diagonal angle transitions: carving preserved under 126°, no 1.345x jump above reverseAngle', async () => {
  const f = await createFixture({ apply405: true });
  const topSpeed = f.PLAYER.runSpeed;
  const dt = 1 / 60;

  // Under reverseAngle (~2.2 rad ≈ 126°): Carving turn
  // 90° turn: input perpendicular to velocity (vx=0, vz=5.76, input = (1, 0))
  {
    const a90 = f.make('shooter');
    a90.vel.set(0, 0, topSpeed);
    a90.intent.move.set(1, 0, 0); // 90° right
    a90._horizontal(dt, false, false);
    // Heading should rotate smoothly; speed remains near topSpeed (carving)
    const sp90 = Math.hypot(a90.vel.x, a90.vel.z);
    assert.ok(Math.abs(sp90 - topSpeed) < 1e-3, `90° carve maintains speed: ${sp90} vs ${topSpeed}`);
    assert.ok(a90.vel.x > 0, `90° carve develops lateral velocity: ${a90.vel.x}`);
  }

  // 120° turn (~2.094 rad < 2.2 rad): Heading slews without jumping to plant-and-reverse
  {
    const a120 = f.make('shooter');
    a120.vel.set(0, 0, topSpeed);
    const angle120 = (120 * Math.PI) / 180;
    a120.intent.move.set(Math.sin(angle120), 0, Math.cos(angle120));
    a120._horizontal(dt, false, false);
    const sp120 = Math.hypot(a120.vel.x, a120.vel.z);
    assert.ok(sp120 > 5.0, `120° carve remains in smooth turn: ${sp120}`);
  }

  // Above reverseAngle (> 2.2 rad ≈ 126°): Enters reverse braking branch
  // Check 130°, 150°, 180° - the vector deceleration magnitude must be D * dt (58/60), NOT 78/60
  for (const deg of [130, 150, 180]) {
    const aRev = f.make('shooter');
    aRev.vel.set(0, 0, topSpeed);
    const rad = (deg * Math.PI) / 180;
    aRev.intent.move.set(Math.sin(rad), 0, Math.cos(rad));

    const vBefore = aRev.vel.clone();
    aRev._horizontal(dt, false, false);

    // Vector change |Δv|
    const dv = Math.hypot(aRev.vel.x - vBefore.x, aRev.vel.z - vBefore.z);
    const expectedRate = 58 * dt; // 58/60 ≈ 0.96667
    assert.ok(Math.abs(dv - expectedRate) < 1e-6, `${deg}° vector deltaV is ${dv}, expected ${expectedRate} (not 78/60)`);
  }
});

// -----------------------------------------------------------------------------
// 4. OFFLINE & PRACTICE ISOLATION: Single-player practice environment
// -----------------------------------------------------------------------------
test('Offline practice isolation: rapid reversal sequences integrate predictably without network reliance', async () => {
  const f = await createFixture({ apply405: true });
  f.G.match.playing = () => true;

  const a = f.make('shooter');
  a.isLocal = true;
  a.pos.set(0, 0, 0);
  a.vel.set(0, 0, 0);
  // Restore native _integrate with collision resolve stubbed for clean open field practice
  delete a._integrate;
  a._resolve = () => {};

  const dt = 1 / 60;

  // Accelerate forward for 30 ticks
  a.intent.move.set(0, 0, 1);
  for (let i = 0; i < 30; i++) a.update(dt);
  assert.ok(a.vel.z > 5.0, `Reached speed: ${a.vel.z}`);
  const forwardZ = a.pos.z;
  assert.ok(forwardZ > 0, `Moved forward: ${forwardZ}`);

  // Rapid 180° reversal backward for 30 ticks
  a.intent.move.set(0, 0, -1);
  for (let i = 0; i < 30; i++) a.update(dt);

  // Velocity should have reversed towards negative Z
  assert.ok(a.vel.z < -4.0, `Reversed speed: ${a.vel.z}`);
  assert.ok(!Number.isNaN(a.pos.z) && !Number.isNaN(a.vel.z), 'Positions and velocities remain valid numbers');
});

// -----------------------------------------------------------------------------
// 5. OWNER VS REMOTE ISOLATION: Kinematics match between local and remote actors
// -----------------------------------------------------------------------------
test('Owner vs remote isolation: horizontal kinematics match identically', async () => {
  const f = await createFixture({ apply405: true });
  const localActor = f.make('shooter');
  const remoteActor = f.make('shooter');

  localActor.isLocal = true;
  remoteActor.isLocal = false;

  const topSpeed = f.PLAYER.runSpeed;
  localActor.vel.set(0, 0, topSpeed);
  remoteActor.vel.set(0, 0, topSpeed);

  localActor.intent.move.set(0, 0, -1);
  remoteActor.intent.move.set(0, 0, -1);

  const dt = 1 / 60;
  localActor._horizontal(dt, false, false);
  remoteActor._horizontal(dt, false, false);

  assert.equal(localActor.vel.x, remoteActor.vel.x, 'Local and remote vel.x match');
  assert.equal(localActor.vel.z, remoteActor.vel.z, 'Local and remote vel.z match');
  assert.ok(Math.abs((topSpeed - remoteActor.vel.z) - 58 / 60) < 1e-6, 'Remote decel matches 58/60');
});

// -----------------------------------------------------------------------------
// 6. NON-REGRESSION OF LOCOMOTION MODES: Swim, enemy ink, airborne
// -----------------------------------------------------------------------------
test('Non-regression: swim reversal ratio is 1.00, enemy ink scaling preserved, airborne untouched', async () => {
  const f = await createFixture({ apply405: true });
  const dt = 1 / 60;

  // A. Swim mode reversal
  {
    const aSwimNeutral = f.make('shooter');
    const aSwimReverse = f.make('shooter');
    aSwimNeutral.submerged = true;
    aSwimReverse.submerged = true;
    const swimSpeed = f.PLAYER.swimSpeed; // 9.8 WU/s

    aSwimNeutral.vel.set(0, 0, swimSpeed);
    aSwimReverse.vel.set(0, 0, swimSpeed);

    aSwimNeutral.intent.move.set(0, 0, 0);
    aSwimReverse.intent.move.set(0, 0, -1);

    // isSquid = true, onEnemy = false
    aSwimNeutral._horizontal(dt, true, false);
    aSwimReverse._horizontal(dt, true, false);

    const deltaSwimNeutral = swimSpeed - aSwimNeutral.vel.z;
    const deltaSwimReverse = swimSpeed - aSwimReverse.vel.z;

    const expectedSwimDelta = f.PLAYER.swimDecel * dt; // 42 * (1/60) = 0.7
    assert.ok(Math.abs(deltaSwimNeutral - expectedSwimDelta) < 1e-6, `Swim neutral decel: ${deltaSwimNeutral}`);
    assert.ok(Math.abs(deltaSwimReverse - expectedSwimDelta) < 1e-6, `Swim reverse decel: ${deltaSwimReverse}`);
    assert.ok(Math.abs((deltaSwimReverse / deltaSwimNeutral) - 1.0) < 1e-9, 'Swim reversal ratio is 1.00');
  }

  // B. Enemy ink slowdown factor
  {
    const aEnemy = f.make('shooter');
    const topSpeed = f.PLAYER.runSpeed;
    aEnemy.vel.set(0, 0, topSpeed);
    aEnemy.intent.move.set(0, 0, -1);

    // onEnemy = true: D = enemyInkDecel = 30; reverse rate = D * dt * 0.5 = 15 * dt
    aEnemy._horizontal(dt, false, true);

    const deltaVEnemy = topSpeed - aEnemy.vel.z;
    const expectedEnemyDelta = 30 * dt * 0.5; // 0.25
    assert.ok(Math.abs(deltaVEnemy - expectedEnemyDelta) < 1e-6, `Enemy ink reverse delta: ${deltaVEnemy} vs ${expectedEnemyDelta}`);
  }

  // C. Airborne control
  {
    const aAir = f.make('shooter');
    aAir.grounded = false;
    aAir.vel.set(0, 0, 5.0);
    aAir.intent.move.set(0, 0, -1);

    aAir._horizontal(dt, false, false);
    // In air, rate is airAccel (20) * dt = 20/60 ≈ 0.33333
    const deltaVAir = 5.0 - aAir.vel.z;
    assert.ok(Math.abs(deltaVAir - 20 * dt) < 1e-6, `Airborne deltaV: ${deltaVAir}`);
  }
});
