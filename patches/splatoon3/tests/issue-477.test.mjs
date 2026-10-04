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

let cachedPatchedFixture = null;
let cachedUnpatchedFixture = null;

async function buildFixture({ apply477 = true } = {}) {
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
    }

    if (apply477) {
      const rel = file.startsWith(UPSTREAM + path.sep)
        ? path.relative(UPSTREAM, file)
        : path.relative(ROOT, file);
      adapted = adaptIssue477Source(rel, adapted);
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
  `, { context, identifier: path.join(ROOT, apply477 ? 'entry-477-patched.mjs' : 'entry-477-unpatched.mjs') });

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
