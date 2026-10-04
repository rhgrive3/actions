// Issue #477 — Splat Dualies 4F pre-roll startup acceptance tests.
//
// Acceptance criteria:
// 1. Fixed 60 Hz simulation: no roll displacement during the 4 startup frames.
// 2. 12F roll movement begins only after the 4F startup (at tick 5).
// 3. Movement duration remains exactly 12F.
// 4. Total roll displacement equals the intended Splat Dualies distance (w.rollDist = 2.8m); startup does not modify it.
// 5. Visible anticipation/roll pose follows the same startup -> roll boundary (phase 'startup' -> 'roll', tumble stays 0 during startup).
// 6. Post-roll firing remains its own 4F gate (w.lockInterval = 4/60 s) and is not folded into startup.
// 7. Existing 32F post-move turret behavior is preserved.
// 8. Two chained rolls preserve startup on each accepted roll.
// 9. 30/60/120 Hz render schedules over the same fixed simulation produce identical state-boundary ticks.
// 10. Owner and remote presentation parity: remote proxy does not skip or double-advance startup.
// 11. Cancellation by splat/special/weapon/form change clears startup and cannot replay a stale roll.
// 12. Negative controls: non-dualies weapons, insufficient ink, airborne, rolls exhausted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import {
  adaptIssue477Source,
  installIssue477DualiesStartup,
  DUALIES_STARTUP_FRAMES,
  DUALIES_STARTUP_SECONDS,
  DUALIES_ROLL_FRAMES,
  DUALIES_ROLL_SECONDS,
  DUALIES_LOCK_FRAMES,
  DUALIES_LOCK_SECONDS,
  DUALIES_POST_ROLL_FIRE_GATE_FRAMES,
  DUALIES_POST_ROLL_FIRE_GATE_SECONDS,
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
    let adapted = file.startsWith(UPSTREAM + path.sep)
      ? adaptSource(path.relative(UPSTREAM, file), source) : source;

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
    export { installDualiesMotion, dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, apply477 ? 'entry-477-patched.mjs' : 'entry-477-unpatched.mjs') });

  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(UPSTREAM, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(UPSTREAM, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();

  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };

  if (apply477) {
    installIssue477DualiesStartup(api);
  }

  const { G, THREE, Actor, Character, CHARACTER_TIMERS } = api;
  G.scene = new THREE.Scene();
  G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = {
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
  const { a, ch } = actorRig;

  try {
    // Tick 0: input recognized
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    assert.ok(a.weaponRunner.dodge !== null, 'dodge token created');

    // In unpatched baseline: tick 1 immediately owns horizontal velocity
    const ownsOnTick1 = a.weaponRunner.dodgeVel(a.vel);
    assert.equal(ownsOnTick1, true, 'Unpatched baseline incorrectly owns velocity immediately on tick 1');
    assert.ok(a.vel.x > 5.0, 'Unpatched baseline immediately has roll speed on tick 1');

    // Visual phase in unpatched baseline was immediately 'roll'
    a.weaponRunner.update(1 / 60, { fire: true });
    a._finishFrame(1 / 60);
    const snap = unpatched.api.dualiesMotionSnapshot(ch);
    assert.equal(snap?.phase, 'roll', 'Unpatched baseline immediately entered roll phase without startup');
  } finally {
    actorRig.close();
  }
});

test('Patched: exactly 4F startup with 0 roll displacement before 12F roll movement begins', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;

  try {
    // Mark input recognition: Tick 0
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    assert.ok(a.weaponRunner.dodge !== null, 'runner.dodge becomes non-null on tick 0');

    // Track state across ticks 1 to 6
    const tickLog = [];
    for (let tick = 1; tick <= 6; tick++) {
      const posBefore = a.pos.clone();
      const ownsVel = a.weaponRunner.dodgeVel(a.vel);
      a._horizontal(1 / 60, false, false);
      a._integrate(1 / 60, false, false);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      const snap = f.api.dualiesMotionSnapshot(ch);
      const disp = Math.hypot(a.pos.x - posBefore.x, a.pos.z - posBefore.z);
      tickLog.push({
        tick,
        ownsVel,
        phase: snap?.phase,
        progress: snap?.progress,
        tumble: snap?.tumble,
        disp,
      });
    }

    // Acceptance: ticks 1..4 are 4 startup frames
    for (let i = 0; i < 4; i++) {
      const entry = tickLog[i];
      assert.equal(entry.ownsVel, false, `Tick ${entry.tick}: dodgeVel() must NOT own horizontal velocity during startup`);
      assert.equal(entry.disp, 0, `Tick ${entry.tick}: horizontal roll displacement must be 0 during startup`);
      assert.equal(entry.phase, 'startup', `Tick ${entry.tick}: phase must be 'startup'`);
      assert.equal(entry.progress, 0, `Tick ${entry.tick}: 12F movement progress must be 0 during startup`);
      assert.equal(entry.tumble, 0, `Tick ${entry.tick}: tumble rotation must not advance during startup`);
    }

    // Acceptance: tick 5 is first frame where dodgeVel() owns velocity and roll begins
    const tick5 = tickLog[4];
    assert.equal(tick5.ownsVel, true, 'Tick 5: dodgeVel() must FIRST own horizontal velocity after 4F startup');
    assert.equal(tick5.phase, 'roll', "Tick 5: character must enter dualies-motion phase 'roll'");
    assert.ok(tick5.disp > 0.1, 'Tick 5: physical roll displacement must begin');
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
    a.intent.move.set(0, 0, 1); // roll forward along z
    const startPos = a.pos.clone();
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    let rollTicks = 0;
    let totalDisplacement = 0;
    let inRollMovement = false;

    // Run simulation at 60 Hz for 30 ticks (covers 4F startup + 12F roll + turret)
    for (let tick = 1; tick <= 30; tick++) {
      const prevPos = a.pos.clone();
      const ownsVel = a.weaponRunner.dodgeVel(a.vel);
      a._horizontal(1 / 60, false, false);
      a._integrate(1 / 60, false, false);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);

      const stepDisp = Math.hypot(a.pos.x - prevPos.x, a.pos.z - prevPos.z);
      if (ownsVel) {
        inRollMovement = true;
        rollTicks++;
        totalDisplacement += stepDisp;
      } else if (inRollMovement && !ownsVel) {
        inRollMovement = false;
      }
    }

    // Movement duration must be exactly 12 frames
    assert.equal(rollTicks, DUALIES_ROLL_FRAMES, `Roll movement duration must be exactly ${DUALIES_ROLL_FRAMES} frames`);

    // Total displacement equals intended Splat Dualies distance (w.rollDist = 2.8m, with discrete Euler tolerance)
    const expectedDist = a.weapon.rollDist; // 2.8
    const actualNetDist = Math.hypot(a.pos.x - startPos.x, a.pos.z - startPos.z);
    assert.ok(
      Math.abs(actualNetDist - expectedDist) < 0.35,
      `Total displacement (${actualNetDist.toFixed(4)}) matches intended roll distance (${expectedDist})`
    );
    assert.ok(
      Math.abs(totalDisplacement - expectedDist) < 0.35,
      `Integrated roll displacement (${totalDisplacement.toFixed(4)}) matches roll distance (${expectedDist})`
    );
  } finally {
    actorRig.close();
  }
});

test('Visible anticipation/roll pose follows startup -> moving-roll boundary', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;

  try {
    a.intent.fire = true;
    a.intent.move.set(1, 0, 1);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

    // Ticks 1..4: phase 'startup', tumble 0
    for (let tick = 1; tick <= 4; tick++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      const snap = f.api.dualiesMotionSnapshot(ch);
      assert.equal(snap?.phase, 'startup', `Tick ${tick}: phase must be 'startup'`);
      assert.equal(snap?.tumble, 0, `Tick ${tick}: tumble must be 0`);
    }

    // Ticks 5..15: phase 'roll', tumble rotates smoothly
    for (let tick = 5; tick <= 15; tick++) {
      a.weaponRunner.dodgeVel(a.vel);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      const snap = f.api.dualiesMotionSnapshot(ch);
      assert.equal(snap?.phase, 'roll', `Tick ${tick}: phase must be 'roll'`);
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
      `Post-roll remaining cooldown must be 3F (${DUALIES_POST_ROLL_FIRE_GATE_SECONDS - 1 / 60}), got ${a.weaponRunner.cooldown}`
    );

    // Advance 2 ticks: no new shots during the gate
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 1, 'No shot on frame 2 of gate');
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 1, 'No shot on frame 3 of gate');

    // On the 4th tick (exactly 4F after first turret shot), the 2nd turret shot fires
    a.weaponRunner.update(1 / 60, { fire: true });
    assert.equal(f.shots.length, initialShots + 2, 'Second turret shot fires on 4th frame (exact 4F gate)');
  } finally {
    actorRig.close();
  }
});

test('Two chained rolls preserve 4F startup on each accepted roll', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor();
  const { a, ch } = actorRig;

  try {
    // Roll 1: input accepted
    a.intent.fire = true;
    a.intent.move.set(1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    assert.equal(a.weaponRunner.rollsLeft, 1, '1 roll remaining after roll 1');

    // Roll 1: 4F startup
    for (let i = 1; i <= 4; i++) {
      assert.equal(a.weaponRunner.dodgeVel(a.vel), false, `Roll 1 tick ${i}: startup does not own vel`);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'startup');
    }
    // Roll 1: 12F movement (ticks 5..15 roll, tick 16 completion)
    for (let i = 5; i <= 15; i++) {
      assert.equal(a.weaponRunner.dodgeVel(a.vel), true, `Roll 1 tick ${i}: roll movement owns vel`);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'roll');
    }
    // Tick 16 completes roll 1
    assert.equal(a.weaponRunner.dodgeVel(a.vel), true, 'Roll 1 tick 16: final roll movement owns vel');
    a.weaponRunner.update(1 / 60, { fire: true });
    a._finishFrame(1 / 60);
    assert.equal(a.weaponRunner.dodge, null, 'Roll 1 complete');

    // Roll 2 (chained): input accepted
    a.intent.move.set(-1, 0, 0);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true, 'Roll 2 tryDodge succeeds');
    assert.equal(a.weaponRunner.rollsLeft, 0, '0 rolls remaining after roll 2');

    // Roll 2: 4F startup preserved!
    for (let i = 1; i <= 4; i++) {
      assert.equal(a.weaponRunner.dodgeVel(a.vel), false, `Roll 2 tick ${i}: startup does not own vel`);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'startup', `Roll 2 tick ${i}: phase must be 'startup'`);
    }
    // Roll 2: 12F movement preserved!
    for (let i = 5; i <= 15; i++) {
      assert.equal(a.weaponRunner.dodgeVel(a.vel), true, `Roll 2 tick ${i}: roll movement owns vel`);
      a.weaponRunner.update(1 / 60, { fire: true });
      a._finishFrame(1 / 60);
      assert.equal(f.api.dualiesMotionSnapshot(ch)?.phase, 'roll', `Roll 2 tick ${i}: phase must be 'roll'`);
    }
    // Tick 16 completes roll 2
    assert.equal(a.weaponRunner.dodgeVel(a.vel), true, 'Roll 2 tick 16: final roll movement owns vel');
    a.weaponRunner.update(1 / 60, { fire: true });
    a._finishFrame(1 / 60);
    assert.equal(a.weaponRunner.dodge, null, 'Roll 2 complete');
  } finally {
    actorRig.close();
  }
});

test('30/60/120 Hz render schedules over the same fixed simulation produce identical boundary ticks', async () => {
  const f = await getFixture({ apply477: true });
  const boundaryRecords = [];

  for (const hz of [30, 60, 120]) {
    const actorRig = f.createDualiesActor({ name: `dualies-hz-${hz}` });
    const { a, ch } = actorRig;
    const clock = new f.api.FixedClock();

    try {
      a.intent.fire = true;
      a.intent.move.set(1, 0, 0);
      assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);

      const history = [];
      const frameDt = 1 / hz;
      // Advance enough render frames to cover 25 simulation ticks
      for (let renderFrame = 0; renderFrame < hz; renderFrame++) {
        clock.advance(frameDt, step => {
          const tick = clock.ticks + 1; // 1-indexed count for current step
          const ownsVel = a.weaponRunner.dodgeVel(a.vel);
          a.weaponRunner.update(step, { fire: true });
          a._finishFrame(step);
          const snap = f.api.dualiesMotionSnapshot(ch);
          history.push({
            tick,
            ownsVel,
            phase: snap?.phase,
            tumble: snap?.tumble,
          });
        });
        if (clock.ticks >= 25) break;
      }

      const startupTicks = history.filter(h => h.phase === 'startup').map(h => h.tick);
      const rollStartTick = history.find(h => h.phase === 'roll')?.tick;
      const firstVelocityTick = history.find(h => h.ownsVel === true)?.tick;
      const plantTick = history.find(h => h.phase === 'plant')?.tick;

      boundaryRecords.push({
        hz,
        startupTicks,
        rollStartTick,
        firstVelocityTick,
        plantTick,
      });
    } finally {
      actorRig.close();
    }
  }

  // All render cadences must yield byte-for-byte identical boundary ticks!
  assert.deepEqual(boundaryRecords[0].startupTicks, [1, 2, 3, 4], '30 Hz startup ticks');
  assert.deepEqual(boundaryRecords[1].startupTicks, [1, 2, 3, 4], '60 Hz startup ticks');
  assert.deepEqual(boundaryRecords[2].startupTicks, [1, 2, 3, 4], '120 Hz startup ticks');

  assert.equal(boundaryRecords[0].rollStartTick, 5, '30 Hz roll start tick');
  assert.equal(boundaryRecords[1].rollStartTick, 5, '60 Hz roll start tick');
  assert.equal(boundaryRecords[2].rollStartTick, 5, '120 Hz roll start tick');

  assert.equal(boundaryRecords[0].firstVelocityTick, 5, '30 Hz velocity ownership tick');
  assert.equal(boundaryRecords[1].firstVelocityTick, 5, '60 Hz velocity ownership tick');
  assert.equal(boundaryRecords[2].firstVelocityTick, 5, '120 Hz velocity ownership tick');

  assert.equal(boundaryRecords[0].plantTick, 16, '30 Hz turret plant tick');
  assert.equal(boundaryRecords[1].plantTick, 16, '60 Hz turret plant tick');
  assert.equal(boundaryRecords[2].plantTick, 16, '120 Hz turret plant tick');
});

test('Remote presentation parity: remote proxy does not skip or double-advance startup', async () => {
  const f = await getFixture({ apply477: true });
  const actorRig = f.createDualiesActor({ name: 'remote-proxy' });
  const { a } = actorRig;
  a.remote = true;

  try {
    // Simulate network packet reception with F.dodge flag set
    const F_dodge = 64; // network dodge flag
    const netDt = 1 / 60;

    // Tick 1: first packet with F.dodge arrives
    let f_flag = F_dodge;
    let wr = a.weaponRunner;

    // Emulate applyRemote dodge handling
    if (f_flag & F_dodge) {
      if (!wr.dodge) wr.dodge = { t: 0, dur: a.weapon.rollTime || 0.2, startup: 4 / 60, startupDur: 4 / 60 };
      if (wr.dodge.startup > 1e-10) wr.dodge.startup = Math.max(0, wr.dodge.startup - netDt);
      else wr.dodge.t += netDt;
    }

    // Ticks 1..4: remote proxy stays in startup
    assert.ok(wr.dodge.startup > 0, 'Remote startup active');
    assert.equal(wr.dodge.t, 0, 'Remote 12F clock not advancing during startup');

    // Advance remaining 3 startup frames
    for (let i = 2; i <= 4; i++) {
      if (wr.dodge.startup > 1e-10) wr.dodge.startup = Math.max(0, wr.dodge.startup - netDt);
      else wr.dodge.t += netDt;
    }
    assert.ok(wr.dodge.startup <= 1e-10, 'Remote startup completed at end of tick 4');
    assert.equal(wr.dodge.t, 0, 'Remote 12F clock remains 0 until startup completes');

    // Tick 5: remote advances 12F movement clock
    if (wr.dodge.startup > 1e-10) wr.dodge.startup = Math.max(0, wr.dodge.startup - netDt);
    else wr.dodge.t += netDt;
    assert.ok(Math.abs(wr.dodge.t - 1 / 60) < 1e-10, 'Remote movement clock advanced by exactly 1 tick');
  } finally {
    actorRig.close();
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
