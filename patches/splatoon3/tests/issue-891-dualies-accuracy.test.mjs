import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { DUALIES_GROUNDED_BIAS_MAX, dualiesBiasRadius } from '../runtime/dualies-accuracy.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'inkwave-public');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
const PARAM = PROFILE.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
const REF_HZ = PROFILE.weaponsFidelityCompletion.referenceHz;
const FRAME = 1 / REF_HZ;
const read = rel => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, message + ': ' + actual + ' !== ' + expected);

async function nativeFixture(extraExports = '') {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports });
  const a = f.make('dualies');
  a.ink = 100;
  a.form = 'kid';
  a.pos.set(0, 0, 0);
  a.character.root.position.copy(a.pos);
  a.aimPoint.set(0, 1.05, 24);
  a.aimDir.set(0, 0, 1);
  a.yaw = 0;
  a.weaponRunner.cooldown = 0;
  return { f, a, r: a.weaponRunner, projectiles: f.G.projectiles };
}

async function nativeMovementFixture(extraExports = '', floorHalfWidth = 100) {
  const world = await nativeFixture(extraExports), { f, a } = world;
  const { THREE, G } = f;
  const floor = {
    id: 0, solid: true, center: new THREE.Vector3(0, -0.1, 0), half: new THREE.Vector3(floorHalfWidth, 0.1, 100),
    aabbMin: new THREE.Vector3(-floorHalfWidth, -0.2, -100), aabbMax: new THREE.Vector3(floorHalfWidth, 0, 100),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  G.level = {
    blocks: [floor], faces: [], groundHeight: () => 0, hasRails: false, spawnBarrier: 0.5,
    spawnPads: [new THREE.Vector3(-1000, 0, 0), new THREE.Vector3(1000, 0, 0)],
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  G.physics = new f.Physics(G.level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.time = 0;
  G.scene = new THREE.Scene();
  G.projectiles = new f.Projectiles(G.scene);
  G.local = a;
  a.isLocal = true;
  delete a._integrate;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
  a.ground.hit = true; a.ground.y = 0; a.ground.block = 0; a.ground.face = -1;
  a.groundN.set(0, 1, 0); a.kidT = 99; a.weaponRunner.cooldown = 0;
  a.intent.move.set(0, 0, 0); a.intent.jump = false; a.intent.fire = false;
  a.aimPoint.set(0, 1.05, 24); a.aimDir.set(0, 0, 1);
  return { ...world, projectiles: G.projectiles };
}

function actorTick(f, a, dt = FRAME) {
  f.G.time += dt;
  a.update(dt);
}

function fireOne(f, a, randomValues = [0.99]) {
  const runner = a.weaponRunner, values = [...randomValues];
  const before = f.G.projectiles.list.length;
  runner.cooldown = 0;
  runner.hand = 0;
  runner.inkShotSequences = Object.create(null);
  f.setRandom(() => values.length ? values.shift() : 0.99);
  try {
    for (let i = 0; i < 8 && f.G.projectiles.list.length === before; i++)
      runner.update(FRAME, { fire: true });
  } finally { f.restoreRandom(); }
  assert.equal(f.G.projectiles.list.length, before + 1,
    'the composed WeaponRunner and native Projectiles emitted one Dualies round');
  return f.G.projectiles.list.at(-1);
}

function deviationDeg(base, round) {
  const b = base.vel.clone().normalize(), v = round.vel.clone().normalize();
  return Math.atan2(b.clone().cross(v).length(), b.dot(v)) * 180 / Math.PI;
}

const mulberry32 = seed => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

test('#891 public values and continuous Wiki bias transform are explicit', () => {
  assert.equal(PROFILE.weaponsFidelityCompletion.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(REF_HZ, 60);
  assert.equal(PARAM.Stand_DegBiasMin, 0.01);
  assert.equal(PARAM.Stand_DegBiasKf, 0.01);
  assert.equal(PARAM.Stand_DegBiasDecrease, 0.005);
  assert.equal(PARAM.Jump_DegBiasMax, 0.4);
  assert.equal(PARAM.Stand_DegSwerve, 2);
  assert.equal(PARAM.Jump_DegSwerve, 7.5);
  assert.equal(DUALIES_GROUNDED_BIAS_MAX, 0.25);

  const expected = (x, b, s) => s * Math.pow(x, Math.log(b) / Math.log(0.5));
  for (const [x, b, s] of [[0.25, 0.5, 2], [0.37, 0.01, 2], [0.83, 0.4, 7.5], [0.99, 0.25, 2]]) {
    close(dualiesBiasRadius(x, s, b), expected(x, b, s),
      'the sample follows the public Wiki y=s*x^(log_0.5 b) model');
  }
  assert.throws(() => dualiesBiasRadius(0.5, 2, undefined), /sourced bias/,
    'a missing source state is not replaced with a guessed fallback');
});

test('#891 actual emitted Dualies round uses the same bias that advances on emission', async () => {
  const { f, a, r, projectiles } = await nativeFixture();
  const baseBefore = projectiles.list.length;
  f.setRandom(() => 0.5);
  try { projectiles.fireDualies(a, a.weapon, 0, 0); }
  finally { f.restoreRandom(); }
  const baseline = projectiles.list.at(-1);
  assert.equal(projectiles.list.length, baseBefore + 1);

  const beforeBias = r.s3DualiesBiasState(a.weapon).bias;
  const x = 0.375, calls = [x, 0, 0.5];
  let draws = 0;
  f.setRandom(() => { draws++; return calls.shift() ?? 0.5; });
  try { projectiles.fireDualies(a, a.weapon, a.weapon.spreadGround, 0); }
  finally { f.restoreRandom(); }
  const shot = projectiles.list.at(-1);
  const expected = dualiesBiasRadius(x, a.weapon.spreadGround, beforeBias);
  close(deviationDeg(baseline, shot), expected,
    'native launch direction samples the bias that existed before this successful shot');
  assert.equal(draws, 3, 'the bias sampler keeps the existing two spread draws plus projectile seed');
  close(r.s3DualiesBiasState(a.weapon).bias, beforeBias + 0.01,
    'the emitted projectile advances the next shot by one percentage point');
});

test('#891 24 successful normal emissions reach the 25% cap; dry clicks do not advance it', async () => {
  const { f, a, r, projectiles } = await nativeFixture();
  const dry = await nativeFixture();
  dry.a.ink = 0;
  for (let i = 0; i < 8; i++) dry.r.update(FRAME, { fire: true });
  assert.equal(dry.projectiles.list.length, 0, 'empty clicks emit no projectile');
  assert.equal(dry.r.s3DualiesBiasState(dry.a.weapon).bias, 0.01,
    'empty clicks leave the fresh normal bias unchanged');
  for (let i = 0; i < 8; i++) dry.r.update(FRAME, { fire: true, sub: true });
  assert.equal(dry.r.s3DualiesBiasState(dry.a.weapon).bias, 0.01,
    'a sub-input main-fire gate does not claim a successful normal round');

  const initial = r.s3DualiesBiasState(a.weapon);
  assert.equal(initial.bias, 0.01);
  for (let i = 0; i < 24; i++) fireOne(f, a, [0.5, 0.25, 0.75]);
  assert.equal(projectiles.list.length, 24);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.25, '24 real emitted rounds reach the sourced grounded cap');
  assert.equal(r.bloom, 0, 'generic four-step cone bloom is no longer authoritative or retained');

  for (let frame = 0; frame < 5; frame++) r.update(FRAME, { fire: false });
  close(r.s3DualiesBiasState(a.weapon).bias, 0.25, 'the first five released fixed frames hold the last bias');
  r.update(FRAME, { fire: false });
  close(r.s3DualiesBiasState(a.weapon).bias, 0.245, 'the sixth released frame recovers by 0.5 percentage point');
  assert.ok(projectiles.list.length >= 24);
});

async function fixedClockTrace(renderHz) {
  const { f, a, r, projectiles } = await nativeMovementFixture();
  const clock = new f.FixedClock(), shots = [];
  const random = mulberry32(0x8911130);
  f.setRandom(() => random());
  try {
    for (let frame = 0; frame < renderHz * 3; frame++) {
      clock.advance(1 / renderHz, step => {
        a.intent.fire = clock.ticks < 120;
        const before = projectiles.list.length;
        actorTick(f, a, step);
        for (let i = before; i < projectiles.list.length; i++) {
          shots.push({ tick: clock.ticks, bias: r.s3DualiesBiasState(a.weapon).bias,
            velocity: Array.from(projectiles.list[i].vel.toArray()) });
        }
      });
    }
  } finally { f.restoreRandom(); }
  return { shots, bias: r.s3DualiesBiasState(a.weapon).bias, ticks: clock.ticks };
}

test('#891 native Actor→WeaponRunner→Projectiles shot and recovery boundaries match at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(await fixedClockTrace(hz));
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.ok(traces[0].shots.length >= 24, 'the native held-fire path emits at least 24 rounds before release');
  close(traces[0].shots[0].bias, 0.02, 'the first emitted normal round advances the next bias to 2%');
  close(traces[0].shots[23].bias, 0.25, 'the 24th emitted normal round reaches the 25% cap');
  close(traces[0].bias, 0.01, 'released fire recovers to the 1% minimum');
  assert.equal(traces[0].ticks, 180);
});

test('#891 admitted jump bias stays separate from the 2°/7.5° angle envelope and turret lock', async () => {
  const { f, a, r, projectiles } = await nativeMovementFixture();
  const serial = a.s3JumpSerial || 0;
  a.intent.jump = true;
  actorTick(f, a);
  a.intent.jump = false;
  assert.equal(a.s3JumpSerial, serial + 1, 'native Actor.update admits the jump');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadAir,
    'the #887 angular envelope remains the existing 7.5° air value');

  a.grounded = true;
  actorTick(f, a);
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01,
    'landing returns to the live grounded bias without changing the angle envelope implementation');
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadGround);

  const saved = r.s3DualiesBiasState(a.weapon).bias;
  r.s3Turret = true;
  const count = projectiles.list.length;
  let spreadSeen = null;
  const original = projectiles.fireDualies;
  projectiles.fireDualies = function (actor, weapon, spread, hand) {
    spreadSeen = spread;
    return original.call(this, actor, weapon, spread, hand);
  };
  try { projectiles.fireDualies(a, a.weapon, r._spreadDeg(a.weapon), 0); }
  finally { projectiles.fireDualies = original; r.s3Turret = false; }
  assert.equal(projectiles.list.length, count + 1);
  assert.equal(spreadSeen, 0, 'post-roll turret keeps its independent zero-spread path');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, saved, 'turret fire does not advance normal-fire bias');
});

test('#891 owner network launch is replayed remotely without resampling or remote bias advancement', async () => {
  const { f, a, projectiles } = await nativeFixture();
  a.nid = 7;
  const net = f.G.netm = new f.NetMatch({ myId: 7 }, {});
  fireOne(f, a, [0.31, 0.77, 0.99]);
  const packet = net.out.find(event => event[1] === 'p');
  assert.ok(packet, 'owner projectile is recorded by the composed NetMatch path');
  const remote = f.make('dualies');
  remote.remote = true;
  const remoteBias = remote.weaponRunner.s3DualiesBiasState(remote.weapon).bias;
  projectiles.list.length = 0;
  let randomCalls = 0;
  f.setRandom(() => { randomCalls++; return 0.9; });
  try { projectiles.ghostProjectile(remote, packet); }
  finally { f.restoreRandom(); }
  const ghost = projectiles.list.at(-1);
  assert.ok(ghost.ghost);
  assert.deepEqual(Array.from(ghost.vel.toArray()), Array.from(packet.slice(8, 11)),
    'remote presentation uses the owner sampled launch velocity');
  assert.equal(randomCalls, 1, 'ghost reconstruction uses only its placeholder seed draw');
  assert.equal(remote.weaponRunner.s3DualiesBiasState(remote.weapon).bias, remoteBias,
    'remote replay does not claim an owner-side successful shot');
});

test('#891 Practice Range weapon changes reset the Dualies bias to its sourced minimum', async () => {
  const extraExports = "export { RangeSession } from './patches/practice-range/runtime/session.mjs';";
  const { f, a, r } = await nativeMovementFixture(extraExports);
  fireOne(f, a, [0.5, 0.25, 0.75]);
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.02);
  const match = { actors: [a], local: a, state: 'playing', opts: { range: true }, canRespawn: () => true };
  f.G.match = match; f.G.actors = match.actors; f.G.local = a;
  const range = new f.RangeSession(match, { headless: true });
  range.setWeapon('shooter');
  range.setWeapon('dualies');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01,
    'RangeSession.setWeapon routes through the native Actor.setWeapon/reset lifecycle');
  range.dispose();
});

test('#891 composed HUD consumes the frame bias separately from the outer envelope', () => {
  const hud = adaptSource('src/ui/hud.js', read('src/ui/hud.js'));
  assert.match(hud, /Number\.isFinite\(ch\.bias\)/);
  assert.match(hud, /OUT /);
  assert.match(hud, /this\._dualiesBiasEl\.textContent = label/);
  const main = adaptSource('src/main.js', read('src/main.js'));
  assert.match(main, /const dualiesBiasState = dualiesRunner\?\.s3DualiesBiasState/);
  assert.match(main, /crosshair: \{ spread, bias: dualiesBiasState\?\.supported && !dualiesBiasState\.turret \? dualiesBiasState\.bias : null/);
  new vm.SourceTextModule(main, { context: vm.createContext({}), identifier: 'adapted-main.mjs' });
  assert.match(main, /crosshair: \{ spread, bias:/,
    'the HUD receives the same authoritative bias while spread remains the outer angle envelope');
});
