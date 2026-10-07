import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const DT = 1 / 60;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

function inkResistanceLoadout(points) {
  let remaining = points;
  const pieces = Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
  for (const piece of pieces) {
    if (remaining >= 10) { piece.main = 'inkResistance'; remaining -= 10; }
    for (let i = 0; i < 3 && remaining >= 3; i++) { piece.subs[i] = 'inkResistance'; remaining -= 3; }
  }
  assert.equal(remaining, 0, `unsupported test AP count ${points}`);
  return pieces;
}

async function world() {
  const f = await fixture();
  f.G.mode = 'match'; f.G.actors = [];
  f.G.scene = new f.THREE.Scene();
  f.G.level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-25, 0, 0], [25, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -0.5, -30], max: [30, 0, 30] }] });
  f.G.physics = new f.Physics(f.G.level);
  assert.ok(f.G.physics instanceof f.Physics && f.G.level instanceof f.Level, 'installed tests use native Level/Physics geometry');
  return f;
}

function actor(f, { remote = false, inkAP = 0, weapon = 'shooter' } = {}) {
  const a = f.make(weapon);
  a._integrate = f.Actor.prototype._integrate; // restore installed collision integration over the real Level
  a.isLocal = !remote;
  if (remote) { a.s3.loadout = inkResistanceLoadout(inkAP); a.setWeapon(weapon); }
  f.G.actors.push(a);
  return a;
}

function state(f, a, { air = false, squid = false, enemy = false, mode = 'normal', velocity = [0, 0, 0], move = [0, 0, 1] } = {}) {
  a.grounded = !air; a.form = squid ? 'squid' : 'kid'; a.submerged = false;
  a.climbing = false; a.superJumpState = null; a.specialActive = mode === 'special' ? { test: true } : null;
  a.groundTeam = enemy ? 2 : 0; a.onEnemy = enemy;
  a.intent.squid = squid; a.intent.fire = mode === 'main'; a.intent.sub = mode === 'sub-ready';
  a.intent.move.set(...move);
  a.weaponRunner.dodge = null; a.weaponRunner.lockT = 0; a.weaponRunner.rolling = false;
  a.weaponRunner.charging = false; a.weaponRunner.streaming = false; a.weaponRunner.slosh = -1; a.weaponRunner.flick = -1;
  a.weaponRunner.firingT = mode === 'main' ? 0.3 : 0; a.weaponRunner.aimingSub = mode === 'sub-ready';
  a.vel.set(...velocity); a.pos.set(0, air ? 20 : 0, 0);
  a.ground.hit = !air; a.ground.face = 0;
}

function tick(f, a, options) {
  state(f, a, options);
  const before = a.vel.clone(), origin = a.pos.clone();
  const shared = { ink: f.PLAYER.enemyInkSpeed, swim: f.PLAYER.swimSpeed };
  a._horizontal(DT, !!options.squid, !!options.enemy);
  const delta = a.vel.clone().sub(before);
  a._integrate(DT, !!options.squid, false);
  assert.equal(f.PLAYER.enemyInkSpeed, shared.ink, 'actor-scoped enemy speed restores after movement');
  assert.equal(f.PLAYER.swimSpeed, shared.swim, 'actor-scoped swim speed restores after movement');
  assert.ok(a.pos.distanceTo(origin) > 0, 'native controller advances through real geometry');
  return { delta: Math.hypot(delta.x, delta.z), vector: delta };
}

test('enemy ink changes grounded speed targets without clamping 1x/2x acceleration or braking', async () => {
  const f = await world(), owner = actor(f), remote = actor(f, { remote: true });
  try {
    const normal = f.PLAYER.s3GroundAccel, attack = f.PLAYER.s3AttackGroundAccel;
    assert.equal(f.profile.referenceVersion, '11.3.0');
    assert.equal(normal, 36); assert.equal(attack, 72); near(attack / normal, 2, 'profile attack/ordinary ratio');

    for (const ap of [0, 3, 10, 57]) {
      remote.s3.loadout = inkResistanceLoadout(ap); remote.setWeapon('shooter');
      near(tick(f, remote, { enemy: true }).delta, normal * DT, `${ap} AP enemy-ink ordinary tick`);
    }
    remote.s3.loadout = inkResistanceLoadout(57); remote.setWeapon('shooter');
    for (const squid of [false, true]) for (const enemy of [false, true]) {
      near(tick(f, remote, { squid, enemy }).delta, normal * DT, `${squid ? 'squid' : 'humanoid'} ${enemy ? 'enemy' : 'clean'} ground tick`);
    }
    for (const squid of [false, true]) for (const enemy of [false, true]) for (const mode of ['normal', 'sub-ready', 'main', 'special']) {
      const rate = mode === 'normal' ? normal : attack;
      near(tick(f, remote, { squid, enemy, mode }).delta, rate * DT,
        `${squid ? 'squid' : 'humanoid'} ${enemy ? 'enemy' : 'clean'} ${mode} acceleration`);
    }
    for (const squid of [false, true]) for (const enemy of [false, true])
      for (const mode of ['normal', 'sub-ready', 'main', 'special']) for (const move of [[0, 0, 0], [0, 0, -1], [1, 0, 0]]) {
        const rate = mode === 'normal' ? normal : attack;
        near(tick(f, remote, { squid, enemy, mode, velocity: [0, 0, 3], move }).delta, rate * DT,
          `${squid ? 'squid' : 'humanoid'} ${enemy ? 'enemy' : 'clean'} ${mode} ${move[0] === 0 && move[2] === 0 ? 'release' : move[0] === 1 ? '90-degree' : 'reverse'}`);
    }
    near(tick(f, remote, { enemy: true, move: [0, 0, 0.1] }).delta, remote.s3.modifiers.enemyMoveSpeed * 0.1,
      'micro input still follows the existing enemy speed target');

    // AP continues to affect only the existing enemy speed target.
    for (const [ap, expected] of [[0, 1.44], [57, 4.608]]) {
      remote.s3.loadout = inkResistanceLoadout(ap); remote.setWeapon('shooter');
      state(f, remote, { enemy: true });
      for (let i = 0; i < 20; i++) { remote._horizontal(DT, false, true); remote._integrate(DT, false, false); }
      near(Math.hypot(remote.vel.x, remote.vel.z), expected, `${ap} AP top speed remains independent`);
    }

    state(f, owner, { enemy: true }); const vOwner = owner.vel.clone(); owner._horizontal(DT, false, true);
    state(f, remote, { enemy: true, mode: 'main' }); const vRemote = remote.vel.clone(); remote._horizontal(DT, false, true);
    near(owner.vel.clone().sub(vOwner).length(), normal * DT, 'owner gets one ordinary step');
    near(remote.vel.clone().sub(vRemote).length(), attack * DT, 'remote gets one attack step');
    near(owner.vel.z, normal * DT, 'remote gear/state does not change owner velocity');

    // Render schedules feed identical 60 Hz movement steps.
    function trace(hz) {
      const clock = new f.FixedClock(), rows = [];
      state(f, remote, { enemy: true, mode: 'sub-ready' });
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        remote._horizontal(dt, false, true); remote._integrate(dt, false, false);
        rows.push([remote.vel.x, remote.vel.y, remote.vel.z, remote.pos.x, remote.pos.y, remote.pos.z]);
      });
      assert.equal(clock.ticks, 60, `${hz} Hz produces 60 gameplay ticks`);
      return rows;
    }
    const g30 = trace(30), g60 = trace(60), g120 = trace(120);
    for (let i = 0; i < 60; i++) for (let j = 0; j < 6; j++) {
      near(g60[i][j], g30[i][j], `ground 30/60 Hz tick ${i}`);
      near(g120[i][j], g30[i][j], `ground 30/120 Hz tick ${i}`);
    }
  } finally { f.G.actors.length = 0; }
});

test('ordinary airborne acceleration and release/reverse braking are equal across forms and weapons', async () => {
  const f = await world(), a = actor(f);
  try {
    const expected = f.PLAYER.airAccel * DT; // Existing INKWAVE calibration; no Nintendo unit conversion.
    for (const weapon of ['shooter', 'splatling']) {
      a.setWeapon(weapon);
      for (const mode of ['normal', 'main', 'sub-ready', 'special']) {
        for (const speed of [0, 0.5, 1]) {
          const kid = tick(f, a, { air: true, mode, velocity: [0, 0, speed] });
          const squid = tick(f, a, { air: true, squid: true, mode, velocity: [0, 0, speed] });
          near(kid.delta, expected, `${weapon} ${mode} humanoid air acceleration from ${speed}`);
          near(squid.delta, expected, `${weapon} ${mode} squid air acceleration from ${speed}`);
          near(squid.delta / kid.delta, 1, `${weapon} ${mode} form ratio from ${speed}`);
        }
      }
      for (const speed of [1, 2, 3]) for (const move of [[0, 0, 0], [0, 0, -1]]) {
        near(tick(f, a, { air: true, velocity: [0, 0, speed], move }).delta, expected, `${weapon} humanoid brake/reverse ${speed}`);
        near(tick(f, a, { air: true, squid: true, velocity: [0, 0, speed], move }).delta, expected, `${weapon} squid brake/reverse ${speed}`);
      }
    }
    function trace(hz, squid) {
      const clock = new f.FixedClock(), rows = [];
      state(f, a, { air: true, squid });
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        a._horizontal(dt, squid, false); a._integrate(dt, squid, false);
        rows.push([a.vel.x, a.vel.y, a.vel.z, a.pos.x, a.pos.y, a.pos.z]);
      });
      assert.equal(clock.ticks, 60);
      return rows;
    }
    for (const squid of [false, true]) {
      const air30 = trace(30, squid), air60 = trace(60, squid), air120 = trace(120, squid);
      for (let i = 0; i < 60; i++) for (let j = 0; j < 6; j++) {
        near(air60[i][j], air30[i][j], `air 30/60 Hz ${squid ? 'squid' : 'humanoid'} tick ${i}`);
        near(air120[i][j], air30[i][j], `air 30/120 Hz ${squid ? 'squid' : 'humanoid'} tick ${i}`);
      }
    }
  } finally { f.G.actors.length = 0; }
});

test('owner Actor advances once and remote NetMatch playback does not apply acceleration again', async () => {
  const f = await world(), a = actor(f);
  try {
    state(f, a, {});
    let calls = 0, observed = 0; const horizontal = a._horizontal;
    a._horizontal = function (...args) {
      calls++; const before = this.vel.clone(); const result = horizontal.apply(this, args);
      observed = this.vel.clone().sub(before).length(); return result;
    };
    a.update(DT);
    assert.equal(calls, 1, 'one owner update invokes one horizontal movement step');
    near(observed, f.PLAYER.s3GroundAccel * DT, 'owner acceleration is not double-applied');

    const sample = { x: 3, y: 8, z: -2, vx: 1.25, vy: -0.5, vz: 2.75, yaw: 0.2, aimYaw: 0.3,
      aimPitch: 0.1, f: 0, hp: 100, ink: 100, sp: 0, turf: 0, ch: 0, lock: 0, tp: 0 };
    a.alive = true; a.remote = true;
    a.net = { ready: true, cur: sample, err: new f.THREE.Vector3(), prevGrounded: false, prevVy: 0,
      sjTo: null, sjRing: 0, spawnPending: false };
    const net = new f.NetMatch({ myId: 'owner' }, {});
    calls = 0; net.applyRemote(a, DT);
    assert.equal(calls, 0, 'remote snapshots bypass local movement acceleration');
    [sample.vx, sample.vy, sample.vz].forEach((v, i) => near(a.vel.getComponent(i), v, `remote velocity axis ${i}`));
  } finally { f.G.actors.length = 0; }
});
