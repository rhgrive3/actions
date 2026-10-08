import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FixedClock } from '../runtime/clock.mjs';
import { isChargerFullCharge } from '../runtime/weapons.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

// Full production composition: adapted public modules plus runtime/install().
// This deliberately avoids source-fixture.mjs, which does not install Charger flight.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const OLD_FLIGHT_DAMAGE = 'const amount=job.full?job.weapon.damageMax:job.weapon.damageMin+(job.weapon.damagePartialMax-job.weapon.damageMin)*job.charge;';

function near(actual, expected, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function acceptedDamage(actual, expected) {
  near(actual, expected);
}

async function boot({ omitFlightDamageFix = false } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 });
  const modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    let source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    if (omitFlightDamageFix && file === path.join(ROOT, 'patches/splatoon3/runtime/weapons-charger-flight.mjs')) {
      const before = source;
      source = source.replace('const amount=job.damage;', OLD_FLIGHT_DAMAGE);
      assert.notEqual(source, before, 'baseline control must remove the active flight damage snapshot');
    }
    const mod = new vm.SourceTextModule(source, {
      context,
      identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; }
    });
    modules.set(file, mod);
    return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './src/world/level.js';
  `, { context, identifier: path.join(SRC, 'charger-damage-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();

  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace };
  const { G, THREE, Physics, Level } = api;
  const scene = new THREE.Scene();
  const level = new Level({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: []
  });
  Object.assign(G, {
    scene, camera: new THREE.PerspectiveCamera(60, 16 / 9), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false },
    paint: { sample: () => 1, splat: () => 0 }
  });
  G.camera.position.set(0, 1.4, -2);
  G.camera.lookAt(0, 1.2, 0);
  G.camera.updateMatrixWorld(true);
  G.projectiles = new api.Projectiles(scene);
  const projectiles = G.projectiles;

  function make(team, name, weapon, z) {
    const actor = new api.Actor({
      team, name, weapon, CharacterClass: api.Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 }
    });
    actor.character.actor = actor;
    scene.add(actor.character.root);
    actor.spawnAt(new THREE.Vector3(0, 0, z), team ? Math.PI : 0);
    actor.invuln = 0;
    actor.character.root.updateMatrixWorld(true);
    return actor;
  }
  const owner = make(0, 'charger owner', 'charger', 0);
  const target = make(1, 'charger target', 'shooter', 3);
  G.actors = [owner, target];

  function resetActors() {
    projectiles.clear();
    G.time = 0;
    owner.spawnAt(new THREE.Vector3(0, 0, 0), 0);
    target.spawnAt(new THREE.Vector3(0, 0, 3), Math.PI);
    owner.team = 0; target.team = 1;
    owner.invuln = target.invuln = 0;
    target.hp = 1000;
    owner.aimDir.set(0, 0, 1);
    owner.aimPoint.set(0, 1.05, 30);
    owner.intent.fire = false;
    owner.intent.squid = false;
    owner.character.root.updateMatrixWorld(true);
    target.character.root.updateMatrixWorld(true);
    G.actors = [owner, target];
  }

  function close() {
    projectiles.clear();
    owner.character.dispose();
    target.character.dispose();
  }

  return { api, profile, G, THREE, owner, target, projectiles, resetActors, close };
}

const opened = [];
const shared = {};
const fixedBoot = () => shared.fixed ||= boot().then(runtime => (opened.push(runtime), runtime));
const baselineBoot = () => shared.baseline ||= boot({ omitFlightDamageFix: true }).then(runtime => (opened.push(runtime), runtime));
after(() => { for (const runtime of opened) runtime.close(); });

async function fireAt(runtime, frames, renderHz) {
  const { owner, target, projectiles, profile } = runtime;
  runtime.resetActors();
  owner.intent.fire = true;
  const hpBefore = target.hp;
  const hits = [];
  const nativeApplyHit = projectiles.applyHit;
  projectiles.applyHit = function (attacker, victim, amount, weaponId) {
    if (attacker === owner && victim === target) hits.push({ amount, weaponId });
    return nativeApplyHit.call(this, attacker, victim, amount, weaponId);
  };

  let firedJob = null, runnerAtRelease = null;
  const clock = new FixedClock();
  const releaseAt = frames / 60;
  for (let render = 0; render < renderHz * 2 && hits.length === 0; render++) {
    clock.advance(1 / renderHz, () => {
      if (hits.length) return;
      owner.update(STEP);
      const flight = projectiles._fidelityChargerFlights?.at(-1);
      if (!firedJob && flight) {
        firedJob = flight;
        runnerAtRelease = { charge: owner.weaponRunner.charge, chargeT: owner.weaponRunner.chargeT };
      }
      if (owner.intent.fire && owner.weaponRunner.chargeT * owner.weapon.chargeTime + 1e-10 >= releaseAt) owner.intent.fire = false;
      projectiles.update(STEP);
    });
  }
  projectiles.applyHit = nativeApplyHit;

  assert.ok(firedJob, `${frames}F release creates an active flight job`);
  assert.equal(hits.length, 1, `${frames}F owner shot hits the real target exactly once`);
  assert.equal(hits[0].weaponId, 'charger');
  assert.equal(firedJob.owner, owner);
  near(firedJob.chargeT * owner.weapon.chargeTime, releaseAt, 1e-10);
  assert.equal(runnerAtRelease.charge, 0, 'native release still resets the runner charge');
  assert.equal(runnerAtRelease.chargeT, 0, 'native release still resets the runner chargeT');
  near(target.hp, hpBefore - Math.floor((hits[0].amount + 1e-10) * 10) / 10); // #261 quantizes final damage, not the curve input

  const progress = releaseAt / owner.weapon.chargeTime;
  const charge = progress < .2 ? progress * 1.25 : .25 + (progress - .2) * .9375;
  near(firedJob.charge, charge, 1e-10);
  const expectedRange = isChargerFullCharge(charge) ? profile.weapons.charger.rangeMax
    : profile.weapons.charger.rangeMin + (profile.weapons.charger.rangeMax - profile.weapons.charger.rangeMin) * charge;
  near(firedJob.range, expectedRange, 1e-7);
  return { damage: hits[0].amount, charge: firedJob.charge, chargeT: firedJob.chargeT, range: firedJob.range };
}

const expectedDamage = frames => frames >= 60 ? 160
  : 40 + (80 - 40) * (frames - 8) / (60 - 8);

test('#506 actual runtime/install() applies the sourced Charger damage to native target hits at 30/60/120Hz', async () => {
  const runtime = await fixedBoot();
  assert.equal(runtime.G.s3?.installed, true);
  assert.ok(runtime.owner instanceof runtime.api.Actor);
  assert.ok(runtime.owner.weaponRunner instanceof runtime.api.WeaponRunner);
  assert.ok(runtime.projectiles instanceof runtime.api.Projectiles);
  assert.equal(typeof runtime.projectiles.chargerReach, 'function', 'active Charger flight is installed');

  for (const renderHz of [30, 60, 120]) {
    for (const frames of [8, 9, 25, 26, 30, 59, 60]) {
      const hit = await fireAt(runtime, frames, renderHz);
      near(hit.damage, expectedDamage(frames));
    }
  }
});

test('#506 active-flight negative control rejects the former nonlinear charge damage', async () => {
  const baseline = await baselineBoot();
  const eight = await fireAt(baseline, 8, 60);
  const thirty = await fireAt(baseline, 30, 60);
  const full = await fireAt(baseline, 60, 60);
  near(eight.damage, 46.6666666667);
  near(thirty.damage, 61.25);
  near(full.damage, 160);
  assert.throws(() => acceptedDamage(eight.damage, 40), error => error?.code === 'ERR_ASSERTION');
  assert.throws(() => acceptedDamage(thirty.damage, 80), error => error?.code === 'ERR_ASSERTION');
});

test('#506 remote Charger ghosts have zero damage and do not apply a hit', async () => {
  const runtime = await fixedBoot();
  runtime.resetActors();
  const { owner, target, projectiles, THREE } = runtime;
  const hpBefore = target.hp;
  let hitCount = 0;
  const nativeApplyHit = projectiles.applyHit;
  projectiles.applyHit = function (...args) {
    if (args[1] === target) hitCount++;
    return nativeApplyHit.apply(this, args);
  };
  projectiles.ghostFire(owner, {
    weapon: 'charger', muzzle: new THREE.Vector3(0, 1.05, .3),
    dir: new THREE.Vector3(0, 0, 1), charge: .5, len: 10
  });
  const ghost = projectiles._fidelityChargerFlights.at(-1);
  assert.equal(ghost.ghost, true);
  assert.equal(ghost.damage, 0);
  for (let i = 0; i < 8 && projectiles._fidelityChargerFlights.includes(ghost); i++) projectiles.update(STEP);
  projectiles.applyHit = nativeApplyHit;
  assert.equal(ghost.seen.has(target), true, 'remote ghost reaches and records the target collision');
  assert.equal(projectiles._fidelityChargerFlights.includes(ghost), false);
  assert.equal(hitCount, 0);
  assert.equal(target.hp, hpBefore);
});

test('#819 Charger runner post-shot busy/reset contract remains unchanged', async () => {
  const runtime = await fixedBoot();
  const runner = runtime.owner.weaponRunner;
  runner.reset();
  runner.s3ChargerPostShot = 16 / 60;
  assert.equal(runner.busy(), true);
  runner.reset();
  assert.equal(runner.s3ChargerPostShot, 0);
  assert.equal(runner.busy(), false);
});
