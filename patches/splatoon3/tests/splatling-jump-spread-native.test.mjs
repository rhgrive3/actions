import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FixedClock } from '../runtime/clock.mjs';
import { splatlingJumpRecoveryAt } from '../runtime/splatling-jump-spread.mjs';
import { fixture, productionComposition } from './weapon-edgecases-fixture.mjs';
import { fixture as fidelityFixture } from '../../../scripts/weapons-fixture.mjs';
import { CASES, finish as finishFidelity, launch as launchFidelity, paintMetrics, reset as resetFidelity } from '../../../scripts/measure-weapons-fidelity.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const upstream = rel => fs.readFileSync(`${ROOT}/inkwave-public/${rel}`, 'utf8');

const close = (actual, expected, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const bloomScale = runner => {
  const first = runner.a.weapon.spreadFirst ?? 0.45;
  return first + (1 - first) * runner.bloom;
};
const expectedHorizontal = runner => {
  const w = runner.a.weapon;
  const recovery = splatlingJumpRecoveryAt(runner.a.s3SplatlingJumpAgeFrames);
  if (recovery === null) return (runner.a.grounded ? w.spreadGround : w.spreadAir) * bloomScale(runner);
  return (w.spreadAir + (w.spreadGround - w.spreadAir) * recovery) * bloomScale(runner);
};

async function nativeFloorFixture({ jumpSpreadControl = false } = {}) {
  const f = await fixture({ composeProductionAdapters: true, jumpSpreadControl });
  const { THREE, G } = f;
  const floor = {
    id: 0, solid: true, center: new THREE.Vector3(0, -0.1, 0), half: new THREE.Vector3(100, 0.1, 100),
    aabbMin: new THREE.Vector3(-100, -0.2, -100), aabbMax: new THREE.Vector3(100, 0, 100),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  const level = {
    blocks: [floor], faces: [], groundHeight: () => 0,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  G.level = level;
  G.physics = new f.Physics(level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.camera = { position: new THREE.Vector3(0, 20, 0) };
  G.time = 0;
  const a = f.make('splatling', { nativeMovement: true });
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
  a.ground.hit = true; a.ground.y = 0; a.ground.block = 0; a.ground.face = -1; a.groundN.set(0, 1, 0);
  G.actors = [a];
  G.projectiles = new f.Projectiles(new THREE.Scene());
  return { ...f, a };
}

test('production six-adapter native jump age holds 25F, recovers by 70F, and never snaps on either landing at 30/60/120Hz', async () => {
  // Current main slows charging during airborne frames. Compare against
  // the actual native owner with only this new spread hook disabled.
  const control = await nativeFloorFixture({ jumpSpreadControl: true });
  const nativeCharge = [];
  control.a.intent.fire = true;
  for (let frame = 0; frame < 120; frame++) {
    control.a.intent.jump = frame === 0 || frame === 45;
    control.tick(control.a);
    nativeCharge.push([control.a.grounded, control.a.weaponRunner.charge, control.a.ink, control.G.projectiles.list.length]);
  }
  assert.ok(nativeCharge.at(-1)[1] > 0 && nativeCharge.at(-1)[1] < 1, 'actual airborne charge remains partial after these two jumps');
  const runs = [];
  for (const hz of [30, 60, 120]) {
    const f = await nativeFloorFixture(), { a } = f, clock = new FixedClock();
    const trace = [], landings = [];
    let frame = 0, wasGrounded = true;
    a.intent.fire = true;
    for (let render = 0; render < hz * 2; render++) clock.advance(1 / hz, () => {
      a.intent.jump = frame === 0 || frame === 45;
      f.tick(a);
      const age = a.s3SplatlingJumpAgeFrames;
      assert.deepEqual([a.grounded, a.weaponRunner.charge, a.ink, f.G.projectiles.list.length], nativeCharge[frame],
        'jump-spread presentation preserves every native charge, ink, movement and emission frame');
      trace.push([a.grounded, age, +a.weaponRunner.spread.toFixed(9), +a.weaponRunner.charge.toFixed(9), +a.ink.toFixed(9)]);
      if (!wasGrounded && a.grounded) landings.push({ frame, age, spread: a.weaponRunner.spread });
      if (frame === 0 || frame === 45) {
        assert.equal(age, 0, `jump frame ${frame} starts a fresh age`);
        close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a.weaponRunner));
      }
      if (frame === 25) {
        assert.equal(age, 25);
        close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a.weaponRunner));
      }
      if (frame === 115) {
        assert.equal(age, null, 'recovery state clears after the endpoint on ground');
        close(a.weaponRunner.spread, a.weapon.spreadGround * bloomScale(a.weaponRunner));
      }
      wasGrounded = a.grounded;
      frame++;
    });
    assert.equal(frame, 120, 'clock executes 120 native simulation frames');
    assert.equal(landings.length, 2, 'both native jumps land on the in-memory floor');
    for (const landing of landings) {
      assert.ok(landing.age > 25 && landing.age < 70, `landing remains in recovery: ${landing.age}`);
      close(landing.spread, expectedHorizontalAtLanding(a.weapon, a.weaponRunner.bloom, landing.age));
      assert.ok(landing.spread > a.weapon.spreadGround * bloomScale(a.weaponRunner), 'first grounded frame retains jump spread');
    }
    assert.equal(a.ink, 100, 'held charge does not pay ink before its existing release');
    assert.equal(f.G.projectiles.list.length, 0, 'held charge does not change firing cadence');
    assert.equal(a.weaponRunner.charge, nativeCharge.at(-1)[1], 'the native airborne charge endpoint is unchanged');
    runs.push(trace);
  }
  assert.deepEqual(runs[0], runs[1]);
  assert.deepEqual(runs[1], runs[2]);
});

function expectedHorizontalAtLanding(weapon, bloom, age) {
  const recovery = splatlingJumpRecoveryAt(age);
  const first = weapon.spreadFirst ?? 0.45;
  const factor = first + (1 - first) * bloom;
  return (weapon.spreadAir + (weapon.spreadGround - weapon.spreadAir) * recovery) * factor;
}

test('zero-time pause, form and weapon switches preserve jump age; repeat jump, death and reset own their lifecycle', async () => {
  const f = await nativeFloorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false; f.tick(a, 30);
  assert.ok(a.s3SplatlingJumpAgeFrames > 25 && !a.grounded);
  const pausedAge = a.s3SplatlingJumpAgeFrames, pausedSpread = a.weaponRunner.spread;
  a.weaponRunner.update(0, { fire: false });
  assert.equal(a.s3SplatlingJumpAgeFrames, pausedAge);
  assert.equal(a.weaponRunner.spread, pausedSpread);

  a.intent.squid = true; f.tick(a);
  assert.equal(a.form, 'squid');
  assert.equal(a.s3SplatlingJumpAgeFrames, pausedAge + 1);
  a.intent.squid = false; f.tick(a);
  assert.equal(a.form, 'kid');
  assert.equal(a.s3SplatlingJumpAgeFrames, pausedAge + 2);

  a.setWeapon('shooter'); f.tick(a);
  assert.equal(a.s3SplatlingJumpAgeFrames, pausedAge + 3);
  a.setWeapon('splatling'); f.tick(a);
  assert.equal(a.s3SplatlingJumpAgeFrames, pausedAge + 4);
  close(a.weaponRunner.spread, expectedHorizontal(a.weaponRunner));

  for (let i = 0; i < 60 && !a.grounded; i++) f.tick(a);
  assert.ok(a.grounded, 'native actor lands before jump recovery expires');
  a.intent.jump = true; f.tick(a);
  assert.equal(a.s3SplatlingJumpAgeFrames, 0, 'a repeated jump restarts the age while prior recovery is active');
  a.intent.jump = false; f.tick(a, 3);
  a.splat(null);
  assert.equal(a.s3SplatlingJumpAgeFrames, null, 'death clears the active jump age');
  a.reset();
  assert.equal(a.s3SplatlingJumpAgeFrames, null, 'actor reset does not inherit a prior life');
});

test('HUD scalar drives the native owner projectile; pitch recovers without a landing snap and remote wire stays authoritative', async () => {
  const main = productionComposition('src/main.js', upstream('src/main.js'));
  const hud = productionComposition('src/ui/hud.js', upstream('src/ui/hud.js'));
  assert.match(main, /const coneDeg = a\.weaponRunner\.spread/);
  assert.match(hud, /\+ch\.spread/);
  const f = await nativeFloorFixture(), { a, G, THREE } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  for (let i = 0; i < 60 && !a.grounded; i++) f.tick(a);
  assert.ok(a.grounded);
  assert.ok(a.s3SplatlingJumpAgeFrames > 25 && a.s3SplatlingJumpAgeFrames < 70);
  a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  a.isLocal = true; a.nid = 17;
  const landingAge = a.s3SplatlingJumpAgeFrames, landingSpread = a.weaponRunner.spread;
  const samplePitch = (age, grounded, spread) => {
    a.s3SplatlingJumpAgeFrames = age; a.grounded = grounded;
    const draws = [0.5, 1 - 1e-12, 0.25, 0.5];
    f.setRandom(() => draws.shift() ?? 0.5);
    G.projectiles.fireSplatling(a, a.weapon, spread);
    const p = G.projectiles.list.at(-1);
    const result = Math.atan2(Math.abs(p.vel.y), Math.hypot(p.vel.x, p.vel.z));
    G.projectiles.clear();
    return result;
  };
  const priorAge = landingAge - 1;
  const priorSpread = expectedHorizontalAtLanding(a.weapon, a.weaponRunner.bloom, priorAge);
  const pitchBeforeLanding = samplePitch(priorAge, false, priorSpread);
  const pitchAtLanding = samplePitch(landingAge, true, landingSpread);
  assert.ok(Math.abs(pitchAtLanding - pitchBeforeLanding) < 0.2 * Math.PI / 180,
    'ground pitch advances through the same jump age instead of snapping on contact');
  a.s3SplatlingJumpAgeFrames = landingAge; a.grounded = true;
  const nm = Object.create(f.NetMatch.prototype);
  nm.mute = 0; nm.out = []; nm.eventSeq = 0; nm.isMine = () => true;
  G.netm = nm;

  const runner = a.weaponRunner, spread = runner.spread;
  const before = { charge: runner.charge, cooldown: runner.cooldown, ink: a.ink, streaming: runner.streaming };
  const ownerDraws = [0.5, 1 - 1e-12, 0.125, 0.5];
  let ownerDrawCount = 0;
  f.setRandom(() => { ownerDrawCount++; return ownerDraws.shift() ?? 0.5; });
  G.projectiles.fireSplatling(a, a.weapon, spread);
  const owner = G.projectiles.list.at(-1), packet = nm.out.find(event => event[1] === 'p');
  assert.ok(packet, 'owner publishes exactly one projectile event');
  assert.equal(nm.out.filter(event => event[1] === 'p').length, 1);
  assert.equal(ownerDrawCount, 4, 'the speed, two spread samples, and seed retain their existing draw count');
  assert.equal(runner.spread, spread, 'the live HUD spread is the scalar supplied to the projectile path');
  const measuredYaw = Math.abs(Math.atan2(owner.vel.x, owner.vel.z)) * 180 / Math.PI;
  const radialYaw = Math.cos(Math.PI / 4) * Math.tan(spread * Math.PI / 180 * Math.sqrt(1 - 1e-12));
  close(measuredYaw, Math.atan(radialYaw) * 180 / Math.PI, 1e-6);

  const recovery = splatlingJumpRecoveryAt(a.s3SplatlingJumpAgeFrames);
  const radius = Math.sqrt(1 - 1e-12), horizontalAngle = spread * Math.PI / 180 * radius;
  const airPitch = Math.atan(0.55 * Math.tan(horizontalAngle));
  const groundPitch = a.weapon.spreadPitchGround * Math.PI / 180 * radius;
  const expectedPitch = airPitch + (groundPitch - airPitch) * recovery;
  const measuredPitch = Math.atan2(Math.abs(owner.vel.y), Math.hypot(owner.vel.x, owner.vel.z));
  const radialPitch = Math.sin(Math.PI / 4) * Math.tan(expectedPitch);
  close(measuredPitch, Math.atan2(radialPitch, Math.sqrt(1 + radialYaw * radialYaw)), 1e-8);

  assert.equal(owner.damage, a.weapon.damage);
  assert.equal(owner.life, 3);
  assert.equal(owner.straight, a.weapon.straightTime);
  assert.equal(owner.grav, a.weapon.referenceGravity);
  assert.equal(owner.drag, owner.fidelityMove.freeDrag * 60);
  assert.deepEqual({ charge: runner.charge, cooldown: runner.cooldown, ink: a.ink, streaming: runner.streaming }, before);

  const packetVelocity = new THREE.Vector3(packet[8], packet[9], packet[10]);
  const packetStart = new THREE.Vector3(packet[5], packet[6], packet[7]);
  assert.ok(packetVelocity.equals(owner.vel), 'wire retains the owner velocity components without rounding');
  f.setRandom(() => 0.5);
  G.projectiles.ghostProjectile(a, packet);
  const ghost = G.projectiles.list.at(-1);
  assert.equal(ghost.ghost, true);
  assert.equal(ghost.damage, 0, 'remote copy is visual and cannot apply gameplay damage');
  assert.ok(ghost.vel.equals(packetVelocity));
  assert.ok(ghost.pos.equals(packetStart));
  assert.equal(nm.out.filter(event => event[1] === 'p').length, 1, 'remote reconstruction does not publish a duplicate shot');
});

test('zero-spread ground Splatling range probe preserves its native projectile and paint RNG sequence', async () => {
  const f = await fidelityFixture({ fidelity: true });
  const scenario = CASES.find(item => item.key === 'splatling-partial');
  const a = resetFidelity(f, scenario);
  launchFidelity(f, a, scenario);
  assert.equal(f.draws(), 4, 'the zero-spread probe retains speed, both Splatling spread samples, and seed draws');
  finishFidelity(f, a);
  const paint = paintMetrics(f);
  assert.deepEqual({ maxZ: paint.bounds?.maxZ, area: paint.area, cells: paint.cells },
    { maxZ: 16.875, area: 15.875, cells: 254 });
});
