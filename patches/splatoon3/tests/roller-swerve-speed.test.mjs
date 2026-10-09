// Issue #771 — Splatoon 3 Ver. 11.3.0 Roller horizontal units carry a non-zero
// SwerveRateBySpeed beside SpawnWideDegree and SpawnSpeedRandom:
//
//   WideSwingUnitGroupParam Unit[0] BulletNum 12  SpawnSpeedBase 1.05  SpawnSpeedRandom 0.36  SpawnWideDegree 18  SwerveRateBySpeed 0.05
//   WideSwingUnitGroupParam Unit[1]               SpawnSpeedBase 0.48  SpawnSpeedRandom 0.11  SpawnWideDegree  4  SwerveRateBySpeed 0.1
//
// The live emitter previously rebuilt the 12 main globs as a rigid even fan
// (`actor.yaw + fan * SpawnWideDegree`) and never read SwerveRateBySpeed, so a
// fixed index kept one launch yaw across every swing while its speed varied.
//
// These tests drive the ACTUAL adapted `src/game/weapons.js` through the real
// `Projectiles.fireFlick` + `configureFidelityFlick` / `appendRollerNearUnit`
// path. The exact source->swerve mapping is an explicitly labelled INKWAVE
// calibration (the pinned table and the published S3 parameter glossary do not
// publish the engine formula), so the tests assert the consumed-field contract,
// the speed-coupled variation and the preserved fan/damage/packet behavior
// rather than a claimed Nintendo distribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { fixture as composedFixture, ROOT as COMPOSED_ROOT } from '../../../scripts/weapons-fixture.mjs';

const DEG = Math.PI / 180;
const MAIN = 12, WIDE = 18, BASE = 1.05, RANDOM = 0.36, RATE = 0.05;
const NEAR_WIDE = 4, NEAR_BASE = 0.48, NEAR_RANDOM = 0.11, NEAR_RATE = 0.1;

// Deterministic stream so every swing's speed sample is reproducible.
function stream(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

async function rig({ mainRate = RATE, nearRate = NEAR_RATE } = {}) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  a.weaponRunner.s3FlickVertical = false;
  a.yaw = 0.3;
  a.aimDir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  a.aimPoint.set(Math.sin(a.yaw) * 50, 1, Math.cos(a.yaw) * 50);
  a.aimPitch = 0;
  const units = f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit;
  units[0].SwerveRateBySpeed = mainRate;
  units[1].SwerveRateBySpeed = nearRate;
  return { f, G, THREE, a, p, units };
}

function fire(f, a, p, seed) {
  f.setRandom(stream(seed));
  p.list.length = 0;
  p.fireFlick(a, a.weapon);
  return p.list;
}
const mainOf = list => list.filter(q => q.s3FlickUnit === 0);
const nearOf = list => list.find(q => q.s3FlickUnit === 1);
const speedOf = q => q.vel.length();
const yawOf = q => q.fidelityYaw;

test('#771: pinned 11.3.0 horizontal units keep their non-zero SwerveRateBySpeed', async () => {
  const { units } = await rig();
  assert.equal(units[0].SwerveRateBySpeed, RATE, 'main unit rate');
  assert.equal(units[1].SwerveRateBySpeed, NEAR_RATE, 'near unit rate');
  assert.equal(units[0].SpawnWideDegree, WIDE);
  assert.equal(units[0].SpawnSpeedBase, BASE);
  assert.equal(units[0].SpawnSpeedRandom, RANDOM);
});

test('#771: a fixed main-glob index is no longer a rigid yaw across swings', async () => {
  const f0 = await rig(), { f, a, p } = f0;
  const samples = [];
  for (let swing = 0; swing < 10; swing++) samples.push(mainOf(fire(f, a, p, swing + 1)));

  for (let i = 0; i < MAIN; i++) {
    const yaws = samples.map(list => yawOf(list[i]));
    const speeds = samples.map(list => speedOf(list[i]));
    assert.ok(new Set(speeds.map(v => v.toFixed(9))).size > 1, `index ${i} samples speeds`);
    assert.ok(new Set(yaws.map(v => v.toFixed(12))).size > 1, `index ${i} yaw must vary with speed`);
  }
  // The variation is a monotone function of the sampled speed: the fastest
  // sample of an index is also the most positive swerve for that index.
  for (const i of [0, 5, 11]) {
    const pairs = samples.map(list => [speedOf(list[i]), yawOf(list[i])]).sort((x, y) => x[0] - y[0]);
    for (let k = 1; k < pairs.length; k++) {
      assert.ok(pairs[k][1] >= pairs[k - 1][1] - 1e-12, `index ${i} yaw is monotone in speed`);
    }
  }
});

test('#771: launch yaw equals the sourced fan plus the sourced speed swerve', async () => {
  const { f, a, p } = await rig();
  const list = fire(f, a, p, 1234);
  const main = mainOf(list);
  assert.equal(main.length, MAIN, 'main unit still emits 12 globs');
  assert.ok(nearOf(list), 'near unit still emits 1 glob');
  for (let i = 0; i < MAIN; i++) {
    const q = main[i];
    const fan = i / (MAIN - 1) * 2 - 1;
    const speedRaw = speedOf(q) / 60;
    const expected = fan * WIDE * DEG + RATE * (speedRaw - BASE);
    assert.ok(Math.abs(yawOf(q) - expected) < 1e-12,
      `index ${i} yaw ${yawOf(q)} !== fan ${fan * WIDE * DEG} + swerve ${RATE * (speedRaw - BASE)}`);
  }
});

test('#771: a zero rate reproduces the exact deterministic fan', async () => {
  const { f, a, p } = await rig({ mainRate: 0, nearRate: 0 });
  const samples = [];
  for (let swing = 0; swing < 6; swing++) samples.push(mainOf(fire(f, a, p, swing + 1)));
  for (let i = 0; i < MAIN; i++) {
    const fan = i / (MAIN - 1) * 2 - 1;
    const expected = fan * WIDE * DEG;
    for (const list of samples) assert.ok(Math.abs(yawOf(list[i]) - expected) < 1e-12, `index ${i} rigid fan`);
  }
});

test('#771: only the sourced rate changes the direction; speed, spawn origin and draw order do not', async () => {
  const on = await rig({ mainRate: RATE, nearRate: NEAR_RATE });
  const off = await rig({ mainRate: 0, nearRate: 0 });
  const a = fire(on.f, on.a, on.p, 99), b = fire(off.f, off.a, off.p, 99);
  assert.equal(a.length, b.length, 'volley size');
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(Array.from(a[i].start.toArray()), Array.from(b[i].start.toArray()), `glob ${i} spawn origin unchanged`);
    assert.deepEqual(Array.from(a[i].pos.toArray()), Array.from(b[i].pos.toArray()), `glob ${i} spawn pos unchanged`);
    assert.ok(Math.abs(speedOf(a[i]) - speedOf(b[i])) < 1e-12, `glob ${i} speed unchanged`);
    assert.equal(a[i].seed, b[i].seed, `glob ${i} seed unchanged`);
  }
  assert.ok(a.some((q, i) => Math.abs(yawOf(q) - yawOf(b[i])) > 1e-6), 'the sourced rate changes at least one yaw');
  // A source-constant speed sample sits exactly at SpawnSpeedBase, so the fan is
  // rigid again for every rate: the swerve is speed-derived, not random jitter.
  const fixed = await rig();
  fixed.f.setRandom(() => 0.5);
  fixed.p.list.length = 0;
  fixed.p.fireFlick(fixed.a, fixed.a.weapon);
  const r = fixed.p.list;
  for (let i = 0; i < MAIN; i++) {
    const fan = i / (MAIN - 1) * 2 - 1;
    assert.ok(Math.abs(yawOf(mainOf(r)[i]) - fan * WIDE * DEG) < 1e-12, `constant sample keeps rigid fan ${i}`);
  }
});

test('#771: the near unit consumes its own 0.1 rate without changing its envelope', async () => {
  const withRate = await rig({ mainRate: RATE, nearRate: NEAR_RATE });
  const noRate = await rig({ mainRate: RATE, nearRate: 0 });
  const a = fire(withRate.f, withRate.a, withRate.p, 7);
  const b = fire(noRate.f, noRate.a, noRate.p, 7);
  const na = nearOf(a), nb = nearOf(b);
  assert.ok(na && nb, 'near glob present');
  // Same stream => identical angle/speed draws; only the sourced near swerve differs.
  assert.ok(Math.abs(speedOf(na) - speedOf(nb)) < 1e-12, 'near speed unchanged by the swerve');
  assert.deepEqual(Array.from(na.start.toArray()), Array.from(nb.start.toArray()), 'near origin unchanged by the swerve');
  const expectedExtra = NEAR_RATE * (speedOf(na) / 60 - NEAR_BASE);
  assert.ok(Math.abs((yawOf(na) - yawOf(nb)) - expectedExtra) < 1e-12, 'near swerve is its pinned 0.1 * speed');
});

test('#771: 12+1 globs share one damage group and one-volley maximum is preserved', async () => {
  const { f, a, p, G } = await rig();
  const list = fire(f, a, p, 3);
  assert.equal(list.filter(q => q.s3FlickUnit === 0).length, MAIN);
  assert.equal(list.filter(q => q.s3FlickUnit === 1).length, 1);
  assert.equal(new Set(list.map(q => q.s3DamageGroup)).size, 1, 'one shared damage group');
  // One swing yields exactly one counted hit through the shared volley maximum.
  const victim = f.make('roller'); victim.team = 1; victim.nid = 'v'; victim.invuln = 0;
  G.actors = [victim];
  const amounts = [];
  p.applyHit = (_a, _e, amount) => amounts.push(amount);
  for (const q of list) f.applyFidelityProjectileHit(p, q, victim, 150, q.start);
  assert.equal(amounts.length, 1, 'a single volley still counts one maximum hit');
});

test('#771: owner and remote replay keep the same launched directions', async () => {
  const f = await composedFixture({ site: COMPOSED_ROOT + '.roller-swerve-source', fidelity: true, network: true });
  const { G, THREE } = f;
  G.actors = []; G.boss = null;
  const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  const nm = G.netm = new f.NetMatch({ myId: 7 }, {});
  a.nid = 7; a.isLocal = true;
  a.weaponRunner.s3FlickVertical = false;
  a.yaw = 0.3;
  a.aimPoint.set(Math.sin(a.yaw) * 50, 1, Math.cos(a.yaw) * 50);
  f.context.Math.random = stream(42);
  p.fireFlick(a, a.weapon);
  const ownerDir = p.list.map(q => q.vel.clone().normalize());
  const events = nm.out.filter(e => e[1] === 'p');
  assert.equal(events.length, 13, 'all 13 globs are recorded');
  const peer = f.make('roller'); peer.remote = true; peer.nid = 99; peer.team = 1;
  p.list.length = 0;
  for (const e of events) p.ghostProjectile(peer, e);
  assert.equal(p.list.length, events.length, 'ghost count');
  p.list.forEach((q, i) => {
    assert.ok(q.ghost, 'remote glob stays a visual ghost');
    const dot = q.vel.clone().normalize().dot(ownerDir[i]);
    assert.ok(dot > 0.9999, `glob ${i} remote direction ${dot} matches the owner's transmitted direction`);
  });
});

test('#771: 30/60/120 Hz do not change the seeded launch distribution', async () => {
  async function release(hz, seed) {
    const { f, a, p } = await rig();
    f.setRandom(stream(seed));
    const dt = 1 / hz;
    a.weaponRunner.update(dt, { fire: false, firePressed: true });
    let guard = 0;
    while (p.list.length === 0 && guard++ < 400) a.weaponRunner.update(dt, { fire: false });
    return Array.from(p.list, q => [q.s3FlickUnit ?? 0, yawOf(q).toFixed(9), speedOf(q).toFixed(6)].join(':')).sort();
  }
  const at60 = await release(60, 11);
  assert.equal(at60.length, 13, 'a release emits the full 12+1 volley');
  for (const hz of [30, 120]) {
    assert.deepEqual(await release(hz, 11), at60, `${hz} Hz launch distribution`);
  }
});
