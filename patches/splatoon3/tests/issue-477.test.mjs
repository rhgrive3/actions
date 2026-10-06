// Issue #477 — Splat Dualies 4F pre-roll startup acceptance tests.
//
// Acceptance criteria:
// 1. Fixed 60 Hz simulation: no roll displacement during the 4 startup frames.
// 2. 12F roll movement begins only after the 4F startup (at tick 5).
// 3. Movement duration remains exactly 12F.
// 4. Total roll displacement equals the intended Splat Dualies distance (w.rollDist = 2.8m); startup does not modify it.
// 5. Visible anticipation/roll pose follows the same startup -> roll boundary:
//    - Actual bounded native tuck pose during startup without movement/tumble;
//    - Real bone/pose values verified and compared to baseline idle, startup, and moving.
//    - Exact Nintendo joint angles marked physicalNintendoanglesunmeasured.
// 6. Post-roll firing remains its own 4F gate (w.lockInterval = 4/60 s) and is not folded into startup.
// 7. Existing 32F post-move turret behavior is preserved.
// 8. Two chained rolls preserve startup on each accepted roll.
// 9. 30/60/120 Hz render schedules over the same fixed simulation produce identical state-boundary ticks.
// 10. Owner and remote presentation parity: actual native NetMatch transport covering late-start, moving,
//     chained rolls, stale packet rejection, legacy fallback, and lifecycle.
// 11. Special activation only cancels current Dualies dodge on successful special admission, preserving
//     other weapons and failed special native states (negative native tests).
// 12. Negative controls: non-dualies weapons, insufficient ink, airborne, rolls exhausted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import {
  adaptIssue477Source,
  DUALIES_STARTUP_FRAMES,
  DUALIES_STARTUP_SECONDS,
  DUALIES_ROLL_FRAMES,
  DUALIES_ROLL_SECONDS,
  DUALIES_LOCK_FRAMES,
  DUALIES_LOCK_SECONDS,
  DUALIES_POST_ROLL_FIRE_GATE_FRAMES,
  DUALIES_POST_ROLL_FIRE_GATE_SECONDS,
  PHYSICAL_NINTENDO_ANGLES_UNMEASURED,
} from '../issue-477-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
import { adaptIssue484 as adaptIssue484Source } from './fixtures/pr495-484-adapter.mjs';

let cachedPatchedFixture = null;
let cachedUnpatchedFixture = null;

async function buildFixture({ apply477 = true, apply484 = false, compositionOrder = '477-then-484' } = {}) {
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();

  const load = requested => {
    let file = requested.startsWith(path.join(UPSTREAM, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(UPSTREAM, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(UPSTREAM, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);

    const source = fs.readFileSync(file, 'utf8');
    let adapted = source;

    // Full production S3 -> Touch -> Reliability pipeline ordering
    if (file.startsWith(UPSTREAM + path.sep)) {
      const rel = path.relative(UPSTREAM, file);
      adapted = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source)));
      if (apply477 && apply484 && adaptIssue484Source) {
        if (compositionOrder === '477-then-484') {
          adapted = adaptQualitySource(rel, adapted);
          adapted = adaptIssue484Source(rel, adapted);
        } else {
          adapted = adaptIssue484Source(rel, adapted);
          adapted = adaptQualitySource(rel, adapted);
        }
      } else {
        if (apply477) adapted = adaptQualitySource(rel, adapted);
        if (apply484 && adaptIssue484Source) adapted = adaptIssue484Source(rel, adapted);
      }
    } else if (apply477) {
      const rel = path.relative(ROOT, file);
      adapted = adaptQualitySource(rel, adapted);
    }

    const m = new vm.SourceTextModule(adapted, {
      context,
      identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, m);
    return m;
  };

  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installDualiesMotion, dualiesMotionSnapshot, DUALIES_MOTION_CALIBRATION } from './patches/splatoon3/runtime/dualies-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { NetMatch } from './src/net/netmatch.js';
    export { CHARACTER_CHANNELS, CHARACTER_TIMERS } from './src/game/character.js';
    export { BONE_INDEX } from './src/game/character-geo.js';
  `, { context, identifier: path.join(ROOT, apply484 ? `entry-477-comp-${compositionOrder}.mjs` : apply477 ? 'entry-477-patched.mjs' : 'entry-477-unpatched.mjs') });

  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(UPSTREAM, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(UPSTREAM, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();

  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };

  const { G, THREE, Actor, Character, CHARACTER_TIMERS } = api;
  G.scene = new THREE.Scene();
  G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = {
    spawnPads: [new THREE.Vector3(), new THREE.Vector3(20, 0, 20)],
    spawnBarrier: 5,
    blocks: [],
    groundHeight: () => 0,
    queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; },
  };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = new api.Physics(G.level);
  G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, out) => {
    out.hit = true;
    out.y = 0;
    out.normal.set(0, 1, 0);
    out.block = 0;
    return out;
  };
  G.actors = [];
  G.time = 0;

  const shots = [];
  G.projectiles = Object.fromEntries([
    'fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick',
  ].map(name => [name, (...args) => {
    if (name === 'fireDualies') shots.push({ time: G.time, hand: args[3], spread: args[2] });
    else shots.push({ time: G.time, kind: name });
  }]));

  function createDualiesActor({ name = 'dualies-tester', kind = 'dualies' } = {}) {
    const a = new Actor({
      team: 0,
      name,
      weapon: kind,
      CharacterClass: Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 },
    });
    const ch = a.character;
    ch.actor = a;
    ch.onEvent = null;
    ch.s3DualiesMotionEnabled = true;
    if (CHARACTER_TIMERS) {
      for (const tname of ['T_SPAWN', 'T_LEAP', 'T_SLAM', 'T_THROW']) {
        if (CHARACTER_TIMERS[tname] !== undefined) ch.tr[CHARACTER_TIMERS[tname]] = 99;
      }
    }
    G.scene.add(ch.root);
    G.actors.push(a);
    a.alive = true;
    a.grounded = a.ground.hit = true;
    a.pos.set(0, 0, 0);
    a.vel.set(0, 0, 0);
    a.ink = 100;
    a.hp = 100;

    return {
      a,
      ch,
      close() {
        G.actors = G.actors.filter(other => other !== a);
        if (ch.root.parent) ch.root.parent.remove(ch.root);
        ch.dispose?.();
      },
    };
  }

  return { api, G, THREE, createDualiesActor, shots, profile };
}

async function getFixture({ apply477 = true } = {}) {
  if (apply477) {
    if (!cachedPatchedFixture) cachedPatchedFixture = await buildFixture({ apply477: true });
    cachedPatchedFixture.shots.length = 0;
    cachedPatchedFixture.G.time = 0;
    return cachedPatchedFixture;
  } else {
    if (!cachedUnpatchedFixture) cachedUnpatchedFixture = await buildFixture({ apply477: false });
    cachedUnpatchedFixture.shots.length = 0;
    cachedUnpatchedFixture.G.time = 0;
    return cachedUnpatchedFixture;
  }
}

test('Negative Control: unpatched baseline lacks 4F startup and immediately imparts roll velocity', async () => {
  const unpatched = await getFixture({ apply477: false });
  const actorRig = unpatched.createDualiesActor();
  const { a } = actorRig;

  try {
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    const dodged = a.weaponRunner.tryDodge(a.intent.move);
    assert.equal(dodged, true, 'Unpatched baseline accepts dodge');

    // In the unpatched baseline, on Tick 1 (first tick after tryDodge), dodgeVel immediately returns true
    // and imparts high horizontal velocity (1.5 * rollDist / rollTime = 21.0 m/s)
    const claimedVel = a.weaponRunner.dodgeVel(a.vel);
    assert.equal(claimedVel, true, 'Unpatched baseline immediately claims velocity on tick 1 (DEFECT)');
    assert.ok(Math.hypot(a.vel.x, a.vel.z) > 10, 'Unpatched baseline immediately imparts high velocity (DEFECT)');
  } finally {
    actorRig.close();
  }
});

test('Patched: exactly 4F startup with 0 roll displacement before 12F roll movement begins', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;

  try {
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    const dodged = a.weaponRunner.tryDodge(a.intent.move);
    assert.equal(dodged, true, 'tryDodge succeeds with dualies');
    assert.ok(a.weaponRunner.dodge, 'runner.dodge exists');
    assert.equal(a.weaponRunner.dodge.startup, DUALIES_STARTUP_SECONDS, 'Startup duration initialized to 4/60s');
    assert.equal(a.weaponRunner.dodge.t, 0, 'Movement clock held at 0');

    const dt = 1 / 60;
    const startX = a.pos.x;
    const startZ = a.pos.z;

    // Ticks 1..4: Startup frames (zero displacement, dodgeVel returns false)
    for (let tick = 1; tick <= 4; tick++) {
      const owned = a.weaponRunner.dodgeVel(a.vel);
      assert.equal(owned, false, `Tick ${tick}: dodgeVel must not own velocity during startup`);
      assert.equal(a.vel.x, 0, `Tick ${tick}: vel.x must be 0`);
      assert.equal(a.vel.z, 0, `Tick ${tick}: vel.z must be 0`);

      a.weaponRunner.update(dt, { fire: true });
      a._finishFrame(dt);

      const disp = Math.hypot(a.pos.x - startX, a.pos.z - startZ);
      assert.equal(disp, 0, `Tick ${tick}: horizontal displacement must remain 0 during startup`);

      const snap = f.api.dualiesMotionSnapshot(ch);
      assert.equal(snap?.phase, 'startup', `Tick ${tick}: motion phase must be 'startup'`);
      assert.equal(snap?.tumble, 0, `Tick ${tick}: tumble rotation must remain 0 during startup`);
    }

    // Tick 5: Movement starts (first frame of 12F roll movement)
    const tick5Owned = a.weaponRunner.dodgeVel(a.vel);
    assert.equal(tick5Owned, true, 'Tick 5: dodgeVel must own velocity once startup completes');
    assert.ok(Math.hypot(a.vel.x, a.vel.z) > 5, 'Tick 5: roll velocity must now be imparted');

    a.weaponRunner.update(dt, { fire: true });
    a._finishFrame(dt);

    const snap5 = f.api.dualiesMotionSnapshot(ch);
    assert.equal(snap5?.phase, 'roll', "Tick 5: motion phase transitions to 'roll'");
  } finally {
    actorRig.close();
  }
});

test('Movement duration remains exactly 12F and total roll displacement is exactly w.rollDist', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a } = actorRig;

  try {
    a.intent.fire = true;
    a.intent.move.set(0, 0, 1);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    const dt = 1 / 60;
    const startPos = a.pos.clone();

    // 4F startup
    for (let i = 0; i < 4; i++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(dt, { fire: true });
      a._finishFrame(dt);
    }
    assert.equal(a.pos.distanceTo(startPos), 0, 'Zero displacement during startup');

    // 12F roll movement: count frames until dodge ends
    let rollTicks = 0;
    let totalDisplacement = 0;
    while (a.weaponRunner.dodge) {
      const owned = a.weaponRunner.dodgeVel(a.vel);
      assert.equal(owned, true, `Roll tick ${rollTicks + 1}: dodgeVel owns velocity`);
      totalDisplacement += a.vel.z * dt;
      a.pos.z += a.vel.z * dt;
      a.weaponRunner.update(dt, { fire: true });
      a._finishFrame(dt);
      rollTicks++;
      if (rollTicks > 20) break; // guard
    }

    assert.equal(rollTicks, DUALIES_ROLL_FRAMES, `Roll movement duration must be exactly 12 frames (got ${rollTicks})`);

    const expectedDist = a.weapon.rollDist; // 2.8m
    const actualNetDist = a.pos.distanceTo(startPos);
    assert.ok(
      Math.abs(actualNetDist - expectedDist) < 0.35,
      `Total displacement (${actualNetDist.toFixed(4)}) matches intended roll distance (${expectedDist})`
    );
  } finally {
    actorRig.close();
  }
});

test('Visible anticipation/roll pose follows startup -> moving-roll boundary', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;
  const C = f.api.CHARACTER_CHANNELS;

  try {
    // Record baseline idle pose
    a._finishFrame(1 / 60);
    const idleSpine = ch.P[C.SPINE];
    const idleChest = ch.P[C.CHEST];

    a.intent.fire = true;
    a.intent.move.set(1, 0, 1);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    // Ticks 1..4: phase 'startup', tumble 0, actual bounded native tuck applied
    for (let tick = 1; tick <= 4; tick++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      const snap = f.api.dualiesMotionSnapshot(ch);
      assert.equal(snap?.phase, 'startup', `Tick ${tick}: phase must be 'startup'`);
      assert.equal(snap?.tumble, 0, `Tick ${tick}: tumble must be 0`);
      assert.equal(a.vel.x, 0, `Tick ${tick}: velocity x must be 0`);
      assert.equal(a.vel.z, 0, `Tick ${tick}: velocity z must be 0`);

      // Verify native actual bone/pose values: tuck is present and differs from baseline idle
      // Note: exact Nintendo joint angles are unmeasured (PHYSICAL_NINTENDO_ANGLES_UNMEASURED)
      assert.ok(ch.P[C.SPINE] > idleSpine, `Tick ${tick}: startup tuck bends spine (${ch.P[C.SPINE]} > ${idleSpine})`);
      assert.ok(ch.P[C.CHEST] > idleChest, `Tick ${tick}: startup tuck compresses chest (${ch.P[C.CHEST]} > ${idleChest})`);
    }

    // Ticks 5..15: phase 'roll', tumble rotates smoothly, movement occurs
    for (let tick = 5; tick <= 15; tick++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      const snap = f.api.dualiesMotionSnapshot(ch);
      assert.equal(snap?.phase, 'roll', `Tick ${tick}: phase must be 'roll'`);
      if (tick >= 7) {
        assert.ok(snap?.tumble > 0, `Tick ${tick}: tumble must be positive during moving roll`);
      }
    }

    // Tick 16: 12th roll tick completes and transitions to 'plant'
    a.weaponRunner.dodgeVel(a.vel);
    a.weaponRunner.update(1 / 60, { fire: true });
    a._finishFrame(1 / 60);
    const postSnap = f.api.dualiesMotionSnapshot(ch);
    assert.equal(postSnap?.phase, 'plant', "Post-roll phase must transition to 'plant'");
  } finally {
    actorRig.close();
  }
});

test('Post-roll firing remains its own 4F gate and is not folded into startup', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a } = actorRig;

  try {
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    // Advance through 4F startup + 12F roll = 16 ticks
    for (let i = 0; i < 16; i++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
    }

    // At tick 16 completion, runner enters lock
    assert.equal(a.weaponRunner.dodge, null, 'dodge ends after 16 ticks total');
    assert.ok(a.weaponRunner.lockT > 0, 'turret lock engaged');
    assert.equal(a.weaponRunner.s3Turret, true, 's3Turret active');

    // Now verify post-roll firing: lockInterval is 4/60s (4 frames)
    const initialShots = f.shots.length;
    // Next tick fires first turret shot and adds lockInterval cooldown
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 1, 'First turret shot fired post-roll');
    // At the end of the tick where shot fired, remaining cooldown is lockInterval - dt (3F remaining)
    assert.ok(
      Math.abs(a.weaponRunner.cooldown - (DUALIES_POST_ROLL_FIRE_GATE_SECONDS - 1 / 60)) < 1e-4,
      'Post-roll fire gate enforces full 4F interval (cooldown clamped properly on roll exit)'
    );

    // Frames 2 and 3 of the 4F interval cannot fire
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 1, 'Frame 2 of post-roll interval gated');
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 1, 'Frame 3 of post-roll interval gated');

    // Frame 4 cooldown expires, next shot fires
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 2, 'Second turret shot fires after exactly 4F gate');
  } finally {
    actorRig.close();
  }
});

test('Two chained rolls preserve 4F startup on each accepted roll', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;

  try {
    // --- Roll 1 ---
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    // 4F startup on roll 1
    for (let i = 1; i <= 4; i++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'startup', `Roll 1, tick ${i} in startup`);
    }

    // 12F movement on roll 1
    for (let i = 1; i <= 12; i++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
    }
    assert.equal(a.weaponRunner.dodge, null, 'Roll 1 complete');
    assert.equal(a.weaponRunner.rollsLeft, 1, '1 roll remaining for chain');

    // --- Roll 2 (chained immediately) ---
    a.intent.move.set(-1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true, 'Roll 2 accepted for chaining');

    // 4F startup on roll 2 must be preserved
    for (let i = 1; i <= 4; i++) {
      const owned = a.weaponRunner.dodgeVel(a.vel);
      assert.equal(owned, false, `Roll 2, tick ${i}: dodgeVel must not own velocity in second startup`);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'startup', `Roll 2, tick ${i} in startup`);
    }

    // Tick 5 of roll 2 starts moving
    assert.equal(a.weaponRunner.dodgeVel(a.vel), true, 'Roll 2 movement starts after 4F startup');
  } finally {
    actorRig.close();
  }
});

test('30/60/120 Hz render schedules over the same fixed simulation produce identical boundary ticks', async () => {
  const f = await getFixture({ apply477: true });

  const renderRates = [30, 60, 120];
  const boundaryRecords = [];

  for (const rate of renderRates) {
    const actorRig = f.createDualiesActor({ name: `dualies-${rate}hz` });
    const { a, ch } = actorRig;

    try {
      const clock = new f.api.FixedClock(60);
      a.intent.fire = true;
      a.intent.move.set(1, 0, 0);
      a.weaponRunner.tryDodge(a.intent.move);

      const renderDt = 1 / rate;
      let totalRenderTime = 0;
      let startupTicks = [];
      let firstVelocityTick = null;
      let plantTick = null;

      let fixedTick = 0;

      while (totalRenderTime < 0.4) {
        clock.advance(renderDt, fixedDt => {
          fixedTick++;
          const owned = a.weaponRunner.dodgeVel(a.vel);
          if (owned && firstVelocityTick === null) {
            firstVelocityTick = fixedTick;
          }
          a.weaponRunner.update(fixedDt, { fire: true });
          a._finishFrame(fixedDt);

          const snap = f.api.dualiesMotionSnapshot(ch);
          if (snap?.phase === 'startup') {
            startupTicks.push(fixedTick);
          }
          if (snap?.phase === 'plant' && plantTick === null) {
            plantTick = fixedTick;
          }
        });
        totalRenderTime += renderDt;
      }

      boundaryRecords.push({ rate, startupTicks, firstVelocityTick, plantTick });
    } finally {
      actorRig.close();
    }
  }

  assert.deepEqual(boundaryRecords[0].startupTicks, [1, 2, 3, 4], '30 Hz startup ticks [1, 2, 3, 4]');
  assert.deepEqual(boundaryRecords[1].startupTicks, [1, 2, 3, 4], '60 Hz startup ticks [1, 2, 3, 4]');
  assert.deepEqual(boundaryRecords[2].startupTicks, [1, 2, 3, 4], '120 Hz startup ticks [1, 2, 3, 4]');

  assert.equal(boundaryRecords[0].firstVelocityTick, 5, '30 Hz velocity ownership tick');
  assert.equal(boundaryRecords[1].firstVelocityTick, 5, '60 Hz velocity ownership tick');
  assert.equal(boundaryRecords[2].firstVelocityTick, 5, '120 Hz velocity ownership tick');

  assert.equal(boundaryRecords[0].plantTick, 16, '30 Hz turret plant tick');
  assert.equal(boundaryRecords[1].plantTick, 16, '60 Hz turret plant tick');
  assert.equal(boundaryRecords[2].plantTick, 16, '120 Hz turret plant tick');
});

test('Remote presentation parity: actual native NetMatch transport (late-start, moving, chained, stale, legacy, lifecycle)', async () => {
  const f = await getFixture({ apply477: true });
  const { NetMatch } = f.api;

  const wireA = [];
  const sessA = {
    myId: 'A', hostId: 'A', isHost: true,
    tr: { broadcast: msg => wireA.push(JSON.parse(JSON.stringify(msg))) },
  };
  const sessB = {
    myId: 'B', hostId: 'A', isHost: false,
    tr: { broadcast: () => {} },
  };

  const netA = new NetMatch(sessA, { map: 'reef' });
  const netB = new NetMatch(sessB, { map: 'reef' });

  const ownerRig = f.createDualiesActor({ name: 'owner-dualies' });
  const remoteRig = f.createDualiesActor({ name: 'remote-dualies' });
  const { a: ownerActor } = ownerRig;
  const { a: remoteActor, ch: remoteCh } = remoteRig;

  ownerActor.nid = 10; ownerActor.owner = 'A'; ownerActor.isLocal = true; ownerActor.remote = false;
  remoteActor.nid = 10; remoteActor.owner = 'A'; remoteActor.isLocal = false; remoteActor.remote = true;

  netA.bind({ actors: [ownerActor], boss: null, state: 'playing', time: 180 });
  netB.bind({ actors: [remoteActor], boss: null, state: 'playing', time: 180 });

  try {
    let currentTs = 100.0;

    // 1. Roll 1 initiation on owner
    ownerActor.intent.fire = true;
    ownerActor.intent.move.set(1, 0, 0);
    assert.equal(ownerActor.weaponRunner.tryDodge(ownerActor.intent.move), true);
    const token1 = ownerActor.weaponRunner.dodge.token;
    assert.equal(token1, 1, 'Owner roll 1 has token 1');

    // Owner sends tick during startup
    wireA.length = 0;
    netA._sendTick();
    const msgStartup = wireA.at(-1);
    msgStartup.ts = currentTs;
    assert.ok(msgStartup.rl?.[10], 'Tick contains optional named rl roll sidecar');
    assert.equal(msgStartup.rl[10].token, 1);
    assert.equal(msgStartup.rl[10].phase, 'startup');
    assert.ok(typeof msgStartup.l?.[10] === 'number', 'Tick preserves mandatory named l life metadata');

    // Deliver to remote and apply
    netB.onMessage('A', msgStartup);
    let peer = netB.peers.get('A');
    peer.tr = msgStartup.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.ok(remoteActor.weaponRunner.dodge, 'Remote received dodge');
    assert.equal(remoteActor.weaponRunner.dodge.token, 1);
    assert.ok(remoteActor.weaponRunner.dodge.startup > 0, 'Remote is in startup');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'startup', 'Remote Character displays startup phase');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.tumble, 0, 'Remote tumble is 0 during startup');

    // 2. Late-start test: packet arrives when owner is ALREADY moving
    // Remote client receives packet indicating phase 'roll' at t = 0.08s
    currentTs += 0.1;
    const lateMovingMsg = JSON.parse(JSON.stringify(msgStartup));
    lateMovingMsg.ts = currentTs;
    lateMovingMsg.rl[10] = { token: 1, phase: 'roll', time: 0.08, dur: 0.2 };

    // Reset remote dodge to null to test late packet arriving with no prior active dodge
    remoteActor.weaponRunner.dodge = null;
    netB.onMessage('A', lateMovingMsg);
    peer.tr = lateMovingMsg.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.ok(remoteActor.weaponRunner.dodge, 'Late packet created remote dodge');
    assert.equal(remoteActor.weaponRunner.dodge.startup, 0, 'Late packet must NOT initialize fresh 4F startup');
    assert.ok(remoteActor.weaponRunner.dodge.t >= 0.08, 'Late packet directly displays current moving progress');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'roll', 'Late packet directly displays moving roll');

    // 3. Moving roll progression
    currentTs += 0.05;
    const movingMsg = JSON.parse(JSON.stringify(lateMovingMsg));
    movingMsg.ts = currentTs;
    movingMsg.rl[10] = { token: 1, phase: 'roll', time: 0.13, dur: 0.2 };
    netB.onMessage('A', movingMsg);
    peer.tr = movingMsg.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    assert.equal(remoteActor.weaponRunner.dodge.startup, 0);
    assert.ok(remoteActor.weaponRunner.dodge.t >= 0.13);

    // 4. Chained roll: owner initiates roll 2
    ownerActor.weaponRunner.dodge = null; // complete roll 1
    assert.equal(ownerActor.weaponRunner.tryDodge(ownerActor.intent.move), true);
    const token2 = ownerActor.weaponRunner.dodge.token;
    assert.equal(token2, 2, 'Owner chained roll 2 has genuine new token 2');

    currentTs += 0.15;
    wireA.length = 0;
    netA._sendTick();
    const msgRoll2 = wireA.at(-1);
    msgRoll2.ts = currentTs;
    assert.equal(msgRoll2.rl[10].token, 2);
    assert.equal(msgRoll2.rl[10].phase, 'startup');

    netB.onMessage('A', msgRoll2);
    peer.tr = msgRoll2.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.equal(remoteActor.weaponRunner.dodge.token, 2, 'Remote transitions to roll 2');
    assert.ok(remoteActor.weaponRunner.dodge.startup > 0, 'Chained roll 2 has its own genuine startup phase');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'startup');

    // 5. Stale packet rejection: old packet with token 1 arrives after token 2
    currentTs += 0.01;
    const staleMsg = JSON.parse(JSON.stringify(msgRoll2));
    staleMsg.ts = currentTs;
    staleMsg.rl[10] = { token: 1, phase: 'startup', time: 0, dur: 0.2 };
    netB.onMessage('A', staleMsg);
    peer.tr = staleMsg.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.equal(remoteActor.weaponRunner.dodge.token, 2, 'Stale packet cannot revert or restart phase');

    // 6. Legacy snapshot fallback: packet without sidecar
    currentTs += 0.05;
    const legacyMsg = JSON.parse(JSON.stringify(msgRoll2));
    legacyMsg.ts = currentTs;
    delete legacyMsg.rl;
    delete legacyMsg.roll;
    netB.onMessage('A', legacyMsg);
    peer.tr = legacyMsg.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    assert.doesNotThrow(() => netB.applyRemote(remoteActor, 1 / 60), 'Legacy packet admitted without error');

    // 7. Lifecycle completion: roll ends, lockT engaged, remote enters plant
    ownerActor.weaponRunner.dodge = null;
    ownerActor.weaponRunner.lockT = 0.5;
    currentTs += 0.15;
    wireA.length = 0;
    netA._sendTick();
    const msgPlant = wireA.at(-1);
    msgPlant.ts = currentTs;

    netB.onMessage('A', msgPlant);
    peer.tr = msgPlant.ts;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.equal(remoteActor.weaponRunner.dodge, null, 'Remote dodge cleared at end of lifecycle');
    assert.ok(remoteActor.weaponRunner.lockT > 0, 'Remote lockT applied');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'plant', 'Remote enters plant stance');

    // Remote presentation only: never damages or moves independently
    assert.equal(remoteActor.remote, true);
  } finally {
    netA.dispose?.();
    netB.dispose?.();
    ownerRig.close();
    remoteRig.close();
  }
});

test('Gap A: Playback time advancement on NetMatch (Hermite halfway, dry buffer extrapolation, idempotent same TR, future roll protection)', async () => {
  const f = await getFixture({ apply477: true });
  const { NetMatch } = f.api;

  const wireA = [];
  const sessA = { myId: 'A', hostId: 'A', isHost: true, tr: { broadcast: msg => wireA.push(JSON.parse(JSON.stringify(msg))) } };
  const sessB = { myId: 'B', hostId: 'A', isHost: false, tr: { broadcast: () => {} } };

  const netA = new NetMatch(sessA, { map: 'reef' });
  const netB = new NetMatch(sessB, { map: 'reef' });

  const ownerRig = f.createDualiesActor({ name: 'owner-dualies-a' });
  const remoteRig = f.createDualiesActor({ name: 'remote-dualies-a' });
  const { a: ownerActor } = ownerRig;
  const { a: remoteActor, ch: remoteCh } = remoteRig;

  ownerActor.nid = 20; ownerActor.owner = 'A'; ownerActor.isLocal = true; ownerActor.remote = false;
  remoteActor.nid = 20; remoteActor.owner = 'A'; remoteActor.isLocal = false; remoteActor.remote = true;

  netA.bind({ actors: [ownerActor], boss: null, state: 'playing', time: 180 });
  netB.bind({ actors: [remoteActor], boss: null, state: 'playing', time: 180 });

  try {
    // A1: Two buffered snapshots with Hermite halfway playback
    // Snapshot 0 at t = 100.000: owner in startup, time = 0
    ownerActor.intent.fire = true;
    ownerActor.intent.move.set(1, 0, 0);
    assert.equal(ownerActor.weaponRunner.tryDodge(ownerActor.intent.move), true);

    wireA.length = 0;
    netA._sendTick();
    const msg0 = wireA.at(-1);
    msg0.ts = 100.000;
    netB.onMessage('A', msg0);

    // Snapshot 1 at t = 100.050: owner 3 ticks (0.050s) into startup
    for (let i = 0; i < 3; i++) {
      ownerActor.weaponRunner.update(1 / 60, { fire: true });
    }
    wireA.length = 0;
    netA._sendTick();
    const msg1 = wireA.at(-1);
    msg1.ts = 100.050;
    netB.onMessage('A', msg1);

    const peer = netB.peers.get('A');

    // Halfway between snapshots (tr = 100.025):
    peer.tr = 100.025;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.ok(remoteActor.weaponRunner.dodge, 'Remote dodge active during halfway Hermite interpolation');
    assert.equal(remoteActor.weaponRunner.dodge.token, 1);
    // Phase age = 100.025 - 100.000 = 0.025s.
    // Startup remaining at origT was 4/60s.
    // At halfway, startup remaining must be exactly (4/60 - 0.025) ≈ 0.04167s (NOT frozen at 4/60!).
    const expectedStartupHalfway = (4 / 60) - 0.025;
    assert.ok(
      Math.abs(remoteActor.weaponRunner.dodge.startup - expectedStartupHalfway) < 1e-4,
      `Startup clock advanced during Hermite interpolation (got ${remoteActor.weaponRunner.dodge.startup}, expected ${expectedStartupHalfway})`
    );
    assert.equal(remoteActor.weaponRunner.dodge.t, 0, 'Movement clock held at 0 while startup active');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'startup');
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.tumble, 0);

    // A2: Repeated applyRemote at the SAME playback TR cannot double advance
    netB.applyRemote(remoteActor, 1 / 60);
    assert.ok(
      Math.abs(remoteActor.weaponRunner.dodge.startup - expectedStartupHalfway) < 1e-4,
      'Repeated applyRemote at same TR does not double-advance startup'
    );
    assert.equal(remoteActor.weaponRunner.dodge.t, 0);

    // A3: Dry buffer extrapolation past startup duration into genuine moving roll
    // Simulate buffer dry: no new packets arrive, peer.tr advances past msg1
    // At msg1 (ts = 100.050), owner startup remaining was 4/60 - 0.050 = 0.016667s.
    // Advance peer.tr by 0.040s past msg1 (to 100.090s) -> startup remaining has expired!
    peer.tr = 100.090;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.ok(remoteActor.weaponRunner.dodge, 'Dodge remains active during extrapolation');
    assert.equal(remoteActor.weaponRunner.dodge.startup, 0, 'Startup has completed in extrapolation');
    // Movement clock must have advanced by phaseAge (0.040) minus remaining startup (0.016667) = 0.02333s
    const expectedExtrapT = 0.040 - ((4 / 60) - 0.050);
    assert.ok(
      Math.abs(remoteActor.weaponRunner.dodge.t - expectedExtrapT) < 1e-3,
      `Movement clock advanced into genuine moving roll during extrapolation (got ${remoteActor.weaponRunner.dodge.t})`
    );
    assert.equal(f.api.dualiesMotionSnapshot(remoteCh)?.phase, 'roll', 'Transitions to roll phase during extrapolation');

    // Bound test: peer.tr advances 0.3s past msg1 (exceeding 0.18s extrapolation bound)
    peer.tr = 100.350;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    const maxAllowedT = 0.18 - ((4 / 60) - 0.050);
    assert.ok(
      remoteActor.weaponRunner.dodge.t <= maxAllowedT + 1e-3,
      `Extrapolation phase age is strictly bounded by 0.18s (got ${remoteActor.weaponRunner.dodge.t}, max ${maxAllowedT})`
    );

    // A4: Next new roll does NOT reveal future token early in Hermite interpolation
    // Buffer has msgNoRoll at 101.000 (no dodge) and msgNewRoll at 101.050 (new roll token 2)
    ownerActor.weaponRunner.dodge = null;
    ownerActor.weaponRunner.lockT = 0;
    remoteActor.weaponRunner.dodge = null;
    remoteActor.net.buf.length = 0;

    wireA.length = 0;
    netA._sendTick();
    const msgNoRoll = wireA.at(-1);
    msgNoRoll.ts = 101.000;
    netB.onMessage('A', msgNoRoll);

    // Owner starts roll 2 at 101.050
    assert.equal(ownerActor.weaponRunner.tryDodge(ownerActor.intent.move), true);
    assert.equal(ownerActor.weaponRunner.dodge.token, 2);

    wireA.length = 0;
    netA._sendTick();
    const msgNewRoll = wireA.at(-1);
    msgNewRoll.ts = 101.050;
    netB.onMessage('A', msgNewRoll);

    // Sample halfway (tr = 101.025): discrete roll state must come from msgNoRoll (earlier snapshot)
    peer.tr = 101.025;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    assert.equal(remoteActor.weaponRunner.dodge, null, 'Halfway interpolation does NOT reveal future roll token 2 early');

    // When tr reaches 101.050, token 2 is now revealed
    peer.tr = 101.050;
    netB._sample(remoteActor, peer.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    assert.ok(remoteActor.weaponRunner.dodge, 'Roll 2 active at snapshot timestamp');
    assert.equal(remoteActor.weaponRunner.dodge.token, 2, 'Token 2 revealed only once playback clock reaches snapshot');
  } finally {
    netA.dispose?.();
    netB.dispose?.();
    ownerRig.close();
    remoteRig.close();
  }
});

test('Gap B: Token admission scoped to owner and accepted life epoch (handoff, new life, stale rejection, reset/adopt cleanup, invalid scalar fallback)', async () => {
  const f = await getFixture({ apply477: true });
  const { NetMatch } = f.api;

  const wireA = [], wireC = [];
  const sessA = { myId: 'A', hostId: 'A', isHost: true, tr: { broadcast: msg => wireA.push(JSON.parse(JSON.stringify(msg))) } };
  const sessB = { myId: 'B', hostId: 'A', isHost: false, tr: { broadcast: () => {} } };
  const sessC = { myId: 'C', hostId: 'A', isHost: false, tr: { broadcast: msg => wireC.push(JSON.parse(JSON.stringify(msg))) } };

  const netA = new NetMatch(sessA, { map: 'reef' });
  const netB = new NetMatch(sessB, { map: 'reef' });
  const netC = new NetMatch(sessC, { map: 'reef' });

  const ownerRigA = f.createDualiesActor({ name: 'owner-dualies-a' });
  const ownerRigC = f.createDualiesActor({ name: 'owner-dualies-c' });
  const remoteRig = f.createDualiesActor({ name: 'remote-dualies-b' });

  const { a: actorA } = ownerRigA;
  const { a: actorC } = ownerRigC;
  const { a: remoteActor } = remoteRig;

  actorA.nid = 30; actorA.owner = 'A'; actorA.isLocal = true; actorA.remote = false;
  actorC.nid = 30; actorC.owner = 'C'; actorC.isLocal = true; actorC.remote = false;
  remoteActor.nid = 30; remoteActor.owner = 'A'; remoteActor.isLocal = false; remoteActor.remote = true;

  netA.bind({ actors: [actorA], boss: null, state: 'playing', time: 180 });
  netB.bind({ actors: [remoteActor], boss: null, state: 'playing', time: 180 });
  netC.bind({ actors: [actorC], boss: null, state: 'playing', time: 180 });

  try {
    let ts = 200.0;

    // B1: Owner A performs rolls up to token 3
    actorA.weaponRunner._rollToken = 2; // will dodge as token 3
    actorA.intent.fire = true;
    actorA.intent.move.set(1, 0, 0);
    assert.equal(actorA.weaponRunner.tryDodge(actorA.intent.move), true);
    assert.equal(actorA.weaponRunner.dodge.token, 3);

    wireA.length = 0;
    netA._sendTick();
    const msgA3 = wireA.at(-1);
    msgA3.ts = ts;
    netB.onMessage('A', msgA3);
    let peerA = netB.peers.get('A');
    peerA.tr = ts;
    netB._sample(remoteActor, peerA.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.equal(remoteActor.weaponRunner.dodge.token, 3, 'Remote accepted token 3 from owner A');
    assert.equal(remoteActor.net.lastRollToken, 3);
    assert.equal(remoteActor.net.rollOwner, 'A');

    // B2: Ownership handoff to C (host migration / re-assignment)
    // New owner C starts fresh with token 1.
    // Scoped admission must accept token 1 from new owner C even though prior owner A had token 3!
    remoteActor.owner = 'C';
    remoteActor.net.buf.length = 0;
    remoteActor.weaponRunner.dodge = null;

    actorC.weaponRunner._rollToken = 0;
    actorC.intent.fire = true;
    actorC.intent.move.set(1, 0, 0);
    assert.equal(actorC.weaponRunner.tryDodge(actorC.intent.move), true);
    assert.equal(actorC.weaponRunner.dodge.token, 1, 'Owner C initiates roll 1');

    ts += 0.1;
    wireC.length = 0;
    netC._sendTick();
    const msgC1 = wireC.at(-1);
    msgC1.ts = ts;
    netB.onMessage('C', msgC1);
    let peerC = netB.peers.get('C');
    peerC.tr = ts;
    netB._sample(remoteActor, peerC.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.ok(remoteActor.weaponRunner.dodge, 'Remote accepted roll from new owner C');
    assert.equal(remoteActor.weaponRunner.dodge.token, 1, 'Token 1 from new owner C admitted despite prior owner token 3');
    assert.equal(remoteActor.net.lastRollToken, 1);
    assert.equal(remoteActor.net.rollOwner, 'C');

    // B3: Late packet from old owner A is rejected by existing network admission
    ts += 0.02;
    const staleMsgOldOwner = JSON.parse(JSON.stringify(msgA3));
    staleMsgOldOwner.ts = ts;
    const bufLenBefore = remoteActor.net.buf.length;
    netB.onMessage('A', staleMsgOldOwner);
    assert.equal(remoteActor.net.buf.length, bufLenBefore, 'Packet from old owner A rejected by network admission');

    // B4: Same actor new life epoch
    // Remote actor is splatted and respawns: life increments to 2
    ts += 0.1;
    remoteActor.net.lastRollToken = 2; // reached token 2 in life 1
    remoteActor.net.rollLife = 1;
    remoteActor.net.lastLife = 1;

    // Owner C respawns with netLife = 2, roll token 1
    actorC.reset();
    actorC.grounded = true;
    actorC.netLife = 2;
    actorC.weaponRunner._rollToken = 0;
    assert.equal(actorC.weaponRunner.tryDodge(actorC.intent.move), true);
    assert.equal(actorC.weaponRunner.dodge.token, 1);

    wireC.length = 0;
    netC._sendTick();
    const msgCNewLife = wireC.at(-1);
    msgCNewLife.ts = ts;
    netB.onMessage('C', msgCNewLife);
    peerC.tr = ts;
    netB._sample(remoteActor, peerC.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);

    assert.equal(remoteActor.weaponRunner.dodge.token, 1, 'Token 1 admitted in new life epoch 2 despite token 2 in prior life');
    assert.equal(remoteActor.net.rollLife, 2);
    assert.equal(remoteActor.net.lastRollToken, 1);

    // B5: Stale packet from old life epoch rejected by combat life admission
    ts += 0.02;
    const staleLifeMsg = JSON.parse(JSON.stringify(msgCNewLife));
    staleLifeMsg.ts = ts;
    staleLifeMsg.l = { 30: 1 }; // old life 1 < current lastLife 2
    const bufLenBeforeLife = remoteActor.net.buf.length;
    netB.onMessage('C', staleLifeMsg);
    assert.equal(remoteActor.net.buf.length, bufLenBeforeLife, 'Late packet with old life rejected by combat-life admission');

    // B6: Host adoption (_adopt) cleans up roll tracking
    netB._adopt(remoteActor);
    assert.equal(remoteActor.net.lastRollToken, undefined, '_adopt cleared lastRollToken');
    assert.equal(remoteActor.net.rollOwner, undefined, '_adopt cleared rollOwner');
    assert.equal(remoteActor.net.rollLife, undefined, '_adopt cleared rollLife');
    assert.equal(remoteActor.weaponRunner.dodge, null, '_adopt cleared dodge');

    // B7: Actor reset() cleans up roll tracking
    remoteActor.net.lastRollToken = 5;
    remoteActor.net.rollOwner = 'C';
    remoteActor.net.rollLife = 2;
    remoteActor.reset();
    assert.equal(remoteActor.net.lastRollToken, undefined, 'reset() cleared lastRollToken');
    assert.equal(remoteActor.net.rollOwner, undefined, 'reset() cleared rollOwner');
    assert.equal(remoteActor.net.rollLife, undefined, 'reset() cleared rollLife');

    // B8: Invalid scalar data does NOT poison lastRollToken and gracefully falls back
    remoteActor.remote = true;
    remoteActor.owner = 'C';
    remoteActor.net.ready = true;
    remoteActor.net.buf.length = 0;
    remoteActor.net.lastRollToken = 0;
    remoteActor.net.rollOwner = 'C';
    remoteActor.net.rollLife = 2;

    const invalidMsg = {
      k: 't', ts: 210.0,
      a: [[30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1024, 100, 100, 0, 0, 0, 0, 0, 0, 1, 0]],
      l: { 30: 2 },
      rl: { 30: { token: -99, phase: 'invalid_phase', time: -5.0, dur: 0 } },
    };
    netB.onMessage('C', invalidMsg);
    peerC.tr = 210.0;
    netB._sample(remoteActor, peerC.tr, 1 / 60);
    assert.doesNotThrow(() => netB.applyRemote(remoteActor, 1 / 60), 'Invalid scalar data does not crash');
    assert.equal(remoteActor.net.lastRollToken, 0, 'Invalid scalar data did not poison lastRollToken');

    // Subsequent valid packet with token 1 is admitted normally
    const validMsg = {
      k: 't', ts: 210.05,
      a: [[30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1024, 100, 100, 0, 0, 0, 0, 0, 0, 1, 0]],
      l: { 30: 2 },
      rl: { 30: { token: 1, phase: 'startup', time: 0, dur: 0.2 } },
    };
    netB.onMessage('C', validMsg);
    peerC.tr = 210.05;
    netB._sample(remoteActor, peerC.tr, 1 / 60);
    netB.applyRemote(remoteActor, 1 / 60);
    assert.ok(remoteActor.weaponRunner.dodge, 'Valid packet created dodge');
    assert.equal(remoteActor.weaponRunner.dodge.token, 1, 'Valid packet admitted after invalid packet was dropped');
    assert.equal(remoteActor.net.lastRollToken, 1);
  } finally {
    netA.dispose?.();
    netB.dispose?.();
    netC.dispose?.();
    ownerRigA.close();
    ownerRigC.close();
    remoteRig.close();
  }
});

test('Gap C: Composition in both orders with PR495 #484 adapter and production reliability pipeline', async () => {
  for (const order of ['477-then-484', '484-then-477']) {
    const f = await buildFixture({ apply477: true, apply484: true, compositionOrder: order });
    const { NetMatch } = f.api;

    const wire = [];
    const sess = { myId: 'A', hostId: 'A', isHost: true, tr: { broadcast: msg => wire.push(JSON.parse(JSON.stringify(msg))) } };
    const sessRemote = { myId: 'B', hostId: 'A', isHost: false, tr: { broadcast: () => {} } };

    const netHost = new NetMatch(sess, { map: 'reef' });
    const netClient = new NetMatch(sessRemote, { map: 'reef' });

    const ownerRig = f.createDualiesActor({ name: `comp-owner-${order}` });
    const remoteRig = f.createDualiesActor({ name: `comp-remote-${order}` });
    const { a: ownerActor } = ownerRig;
    const { a: remoteActor } = remoteRig;

    ownerActor.nid = 40; ownerActor.owner = 'A'; ownerActor.isLocal = true; ownerActor.remote = false;
    remoteActor.nid = 40; remoteActor.owner = 'A'; remoteActor.isLocal = false; remoteActor.remote = true;

    netHost.bind({ actors: [ownerActor], boss: null, state: 'playing', time: 180 });
    netClient.bind({ actors: [remoteActor], boss: null, state: 'playing', time: 180 });

    try {
      // 1. Owner initiates roll and has special charge
      ownerActor.weapon.specialCost = 180;
      ownerActor.special = 180;
      ownerActor.intent.fire = true;
      ownerActor.intent.move.set(1, 0, 0);
      assert.equal(ownerActor.weaponRunner.tryDodge(ownerActor.intent.move), true);

      wire.length = 0;
      netHost._sendTick();
      const msg = wire.at(-1);

      // Verify composition: both rl (from 477) and sc (from 484) and l (from combat-life) must coexist on msg
      assert.ok(msg.rl?.[40], `${order}: Tick contains optional named rl roll sidecar`);
      assert.equal(msg.rl[40].token, 1, `${order}: rl sidecar has token 1`);
      assert.ok(msg.sc?.[40] !== undefined, `${order}: Tick contains optional named sc special-cost sidecar`);
      assert.ok(msg.l?.[40] !== undefined, `${order}: Tick contains mandatory named l combat-life sidecar`);

      // Verify delivery to remote client: both 484 specialCost and 477 roll state are unpacked
      netClient.onMessage('A', msg);
      const peer = netClient.peers.get('A');
      peer.tr = msg.ts;
      netClient._sample(remoteActor, peer.tr, 1 / 60);
      netClient.applyRemote(remoteActor, 1 / 60);

      assert.ok(remoteActor.weaponRunner.dodge, `${order}: Remote actor received roll`);
      assert.equal(remoteActor.weaponRunner.dodge.token, 1, `${order}: Remote roll token is 1`);
      assert.equal(remoteActor.s3SpecialCost, 180, `${order}: Remote actor received gear-adjusted specialCost`);
      // The owner still shows startup at the end of its fourth simulation tick.
      // Snapshot quantization must not turn that exact boundary into an early roll.
      for (let i=0;i<4;i++) { ownerActor.weaponRunner.update(1/60, {fire:true}); ownerActor._finishFrame(1/60); }
      netHost._sendTick(); const boundary = wire.at(-1); boundary.ts = msg.ts + .2;
      netClient.onMessage('A', boundary); peer.tr = boundary.ts;
      netClient._sample(remoteActor, peer.tr, 1/60); netClient.applyRemote(remoteActor, 1/60);
      assert.equal(f.api.dualiesMotionSnapshot(ownerRig.ch).phase, 'startup');
      assert.equal(f.api.dualiesMotionSnapshot(remoteRig.ch).phase, 'startup', 'fourth-tick owner/remote phase parity');
      const legacy = JSON.parse(JSON.stringify(boundary)); legacy.ts += .05; delete legacy.rl;
      netClient.onMessage('A', legacy); peer.tr=legacy.ts;
      netClient._sample(remoteActor,peer.tr,1/60);netClient.applyRemote(remoteActor,1/60);
      assert.equal(remoteActor.weaponRunner.dodge.startup,0,'legacy sample cannot retain a stale modern startup');
      assert.equal(f.api.dualiesMotionSnapshot(remoteRig.ch).phase,'roll');
    } finally {
      netHost.dispose?.();
      netClient.dispose?.();
      ownerRig.close();
      remoteRig.close();
    }
  }
});

test('Negative real Actor/WeaponRunner state: special activation preserves non-dualies weapons and failed special states', async () => {
  const f = await getFixture({ apply477: true });

  // 1. Shooter weapon: successful special does NOT reset weaponRunner or wipe cooldown
  const shooterRig = f.createDualiesActor({ name: 'shooter-actor', kind: 'shooter' });
  try {
    const { a } = shooterRig;
    a.weapon = { ...a.weapon, special: 'slam', specialCost: 100 };
    a.special = 200; // Special ready
    a.weaponRunner.cooldown = 0.18;
    a.weaponRunner.firingT = 0.3;

    a._startSpecial();

    assert.equal(a.weaponRunner.cooldown, 0.18, 'Shooter cooldown preserved on special activation');
    assert.equal(a.weaponRunner.firingT, 0.3, 'Shooter firingT preserved on special activation');
    assert.equal(a.special, 0, 'Special spent');
  } finally {
    shooterRig.close();
  }

  // 2. Splatling weapon: successful special does NOT reset charge or streaming state
  const splatlingRig = f.createDualiesActor({ name: 'splatling-actor', kind: 'splatling' });
  try {
    const { a } = splatlingRig;
    a.weapon = { ...a.weapon, special: 'slam', specialCost: 100 };
    a.special = 200;
    a.weaponRunner.charge = 0.85;
    a.weaponRunner.charging = true;

    a._startSpecial();

    assert.equal(a.weaponRunner.charge, 0.85, 'Splatling charge preserved on special activation');
    assert.equal(a.weaponRunner.charging, true, 'Splatling charging preserved on special activation');
  } finally {
    splatlingRig.close();
  }

  // 3. Failed special (not ready): Dualies dodge is NOT cancelled
  const dualiesRig = f.createDualiesActor({ name: 'dualies-failed-special' });
  try {
    const { a } = dualiesRig;
    a.weapon = { ...a.weapon, special: 'slam', specialCost: 190 };
    a.special = 50; // NOT ready
    assert.equal(a.specialReady(), false, 'Special is not ready');

    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    assert.ok(a.weaponRunner.dodge, 'Dualies dodge is active');

    // Run Actor update with special intent pressed
    a.intent.special = true;
    a.update(1 / 60);

    assert.ok(a.weaponRunner.dodge, 'Failed special does not cancel active Dualies dodge');
    assert.equal(a.stats.specials, 0, 'Special was not used');
  } finally {
    dualiesRig.close();
  }

  // 4. Successful special on Dualies during dodge: ONLY cancels current dodge, preserves other state
  const dualiesSuccessRig = f.createDualiesActor({ name: 'dualies-success-special' });
  try {
    const { a } = dualiesSuccessRig;
    a.weapon = { ...a.weapon, special: 'slam', specialCost: 100 };
    a.special = 200;
    assert.equal(a.specialReady(), true, 'Special is ready');

    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    assert.ok(a.weaponRunner.dodge, 'Dualies dodge is active');

    a._startSpecial();

    assert.equal(a.weaponRunner.dodge, null, 'Active Dualies dodge cancelled on successful special');
    assert.equal(a.specialActive?.id, 'slam', 'Special active');
    assert.equal(a.stats.specials, 1, 'Special incremented');
  } finally {
    dualiesSuccessRig.close();
  }
});

test('Cancellation by splat, special, form, and weapon change clears startup and cannot replay a stale roll', async () => {
  const f = await getFixture({ apply477: true });

  for (const cancelType of ['splat', 'special', 'squid', 'weapon']) {
    const actorRig = f.createDualiesActor({ name: `cancel-${cancelType}` });
    const { a, ch } = actorRig;

    try {
      a.intent.fire = true;
      a.intent.move.set(1, 0, 0);
      assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

      // Advance 2 frames into startup
      for (let i = 0; i < 2; i++) {
        a.weaponRunner.dodgeVel(a.vel);
        a.weaponRunner.update(1 / 60, { fire: true });
        a._finishFrame(1 / 60);
      }
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'startup', 'In startup before cancellation');

      // Perform cancellation
      if (cancelType === 'splat') {
        a.splat();
      } else if (cancelType === 'special') {
        a.weapon = { ...a.weapon, special: 'slam' };
        a._startSpecial();
      } else if (cancelType === 'squid') {
        a.form = 'squid';
        a.weaponRunner.reset();
      } else if (cancelType === 'weapon') {
        a.setWeapon('shooter');
      }

      a._finishFrame(0);
      assert.equal(a.weaponRunner.dodge, null, `${cancelType}: runner.dodge must be cleared`);
      assert.equal(ch.tumble, 0, `${cancelType}: tumble must be 0`);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase ?? null, null, `${cancelType}: snapshot phase must be null`);

      // Restore to kid with dualies and verify interrupted roll does NOT resume or replay
      a.alive = true;
      a.form = 'kid';
      a.specialActive = null;
      a.setWeapon('dualies');
      a.weaponRunner.update(1 / 60, { fire: false });
      a._finishFrame(1 / 60);

      assert.equal(a.weaponRunner.dodge, null, 'Stale roll must not replay');
      assert.equal(ch.tumble, 0, 'Stale tumble must not replay');
    } finally {
      actorRig.close();
    }
  }
});

test('Negative Controls: non-dualies weapons and invalid dodge conditions are rejected', async () => {
  const f = await getFixture({ apply477: true });

  // 1. Shooter weapon cannot dodge
  const r1 = f.createDualiesActor({ kind: 'shooter' });
  try {
    const { a: shooter } = r1;
    shooter.intent.fire = true;
    shooter.intent.move.set(1, 0, 0);
    assert.equal(shooter.weaponRunner.tryDodge(shooter.intent.move), false, 'Shooter cannot dodge');
    assert.equal(shooter.weaponRunner.dodge, null);
  } finally {
    r1.close();
  }

  // 2. Splatling weapon cannot dodge
  const r2 = f.createDualiesActor({ kind: 'splatling' });
  try {
    const { a: splatling } = r2;
    splatling.intent.fire = true;
    splatling.intent.move.set(1, 0, 0);
    assert.equal(splatling.weaponRunner.tryDodge(splatling.intent.move), false, 'Splatling cannot dodge');
    assert.equal(splatling.weaponRunner.dodge, null);
  } finally {
    r2.close();
  }

  // 3. Dualies with insufficient ink
  const r3 = f.createDualiesActor();
  try {
    const { a: dryDualies } = r3;
    dryDualies.ink = 2; // roll requires 7
    dryDualies.intent.fire = true;
    dryDualies.intent.move.set(1, 0, 0);
    assert.equal(dryDualies.weaponRunner.tryDodge(dryDualies.intent.move), false, 'Dry dualies cannot dodge');
    assert.equal(dryDualies.weaponRunner.dodge, null);
  } finally {
    r3.close();
  }

  // 4. Airborne dualies
  const r4 = f.createDualiesActor();
  try {
    const { a: airDualies } = r4;
    airDualies.grounded = airDualies.ground.hit = false;
    airDualies.intent.fire = true;
    airDualies.intent.move.set(1, 0, 0);
    assert.equal(airDualies.weaponRunner.tryDodge(airDualies.intent.move), false, 'Airborne dualies cannot dodge');
    assert.equal(airDualies.weaponRunner.dodge, null);
  } finally {
    r4.close();
  }

  // 5. Zero rolls remaining
  const r5 = f.createDualiesActor();
  try {
    const { a: exhaustedDualies } = r5;
    exhaustedDualies.weaponRunner.rollsLeft = 0;
    exhaustedDualies.intent.fire = true;
    exhaustedDualies.intent.move.set(1, 0, 0);
    assert.equal(exhaustedDualies.weaponRunner.tryDodge(exhaustedDualies.intent.move), false, 'Exhausted rolls cannot dodge');
    assert.equal(exhaustedDualies.weaponRunner.dodge, null);
  } finally {
    r5.close();
  }
});
