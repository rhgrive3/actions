import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FixedClock } from '../runtime/clock.mjs';
import { splatlingJumpRecoveryAt } from '../runtime/splatling-jump-spread.mjs';
import { signedBiasSample } from '../runtime/weapon-edgecases.mjs';
import { fixture, productionComposition } from './weapon-edgecases-fixture.mjs';
import { fixture as fidelityFixture } from '../../../scripts/weapons-fixture.mjs';
import { CASES, finish as finishFidelity, launch as launchFidelity, paintMetrics, reset as resetFidelity } from '../../../scripts/measure-weapons-fidelity.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const upstream = rel => fs.readFileSync(`${ROOT}/inkwave-public/${rel}`, 'utf8');

const close = (actual, expected, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
// The sourced outer envelope is independent of the old INKWAVE bloom
// multiplier. Bias changes the distribution inside it, not the maximum angle.
const bloomScale = () => 1;
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
  // #888 reduces the charging takeoff impulse, so the still-charging second jump
  // lands earlier and ground charge reaches full by frame 120. The scenario
  // property this guard protects is real airborne partial-charge frames, not
  // that the final frame is partial.
  assert.ok(nativeCharge.some(([grounded, charge]) => !grounded && charge > 0 && charge < 1), 'actual airborne charge remains partial after these two jumps');
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
    for (const [index, landing] of landings.entries()) {
      // #888: the second (still-charging) jump is the shorter S3 charging jump,
      // so it lands inside the 25F hold instead of after it; the 25F hold itself
      // is asserted directly at frame 25.
      assert.ok(landing.age > 0 && landing.age < 70, `landing remains in jump spread: ${landing.age}`);
      assert.ok(index === 0 ? landing.age > 25 : landing.age < 25, `uncharged/charging takeoff retains its distinct landing boundary: ${index}, ${landing.age}`);
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
  const factor = 1; // raw Stand_DegSwerve / Jump_DegSwerve, no extra bloom
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
  const f = await nativeFloorFixture(), control = await nativeFloorFixture({ jumpSpreadControl: true });
  const { a, G, THREE } = f, c = control.a;
  for (const [env, actor] of [[f, a], [control, c]]) {
    actor.intent.jump = true; env.tick(actor); actor.intent.jump = false;
    for (let i = 0; i < 60 && !actor.grounded; i++) env.tick(actor);
    assert.ok(actor.grounded);
  }
  assert.deepEqual(Array.from(c.pos.toArray()), Array.from(a.pos.toArray()), 'the same native jump gives both controls identical movement');
  assert.deepEqual(Array.from(c.vel.toArray()), Array.from(a.vel.toArray()));
  assert.equal(c.weaponRunner.charge, a.weaponRunner.charge);
  assert.equal(c.ink, a.ink);
  assert.ok(a.s3SplatlingJumpAgeFrames > 25 && a.s3SplatlingJumpAgeFrames < 70);
  a.aimYaw = c.aimYaw = 0; a.aimPitch = c.aimPitch = 0;
  a.aimDir.set(0, 0, 1); c.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100); c.aimPoint.set(0, 1.05, 100);
  a.isLocal = c.isLocal = true; a.nid = c.nid = 17;
  const landingAge = a.s3SplatlingJumpAgeFrames, landingSpread = a.weaponRunner.spread;
  const controlSpread = c.weaponRunner.spread;
  assert.notEqual(landingSpread, controlSpread, 'the control disables only the jump-specific spread correction');
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
  const nm = new f.NetMatch({ myId: 'owner', isHost: true, _members: new Map([['owner', 'Owner']]) }, {});
  nm.mute = 0; nm.out = []; nm.eventSeq = 0; nm.isMine = () => true;
  G.netm = nm;
  const controlNm = new control.NetMatch({ myId: 'control', isHost: true, _members: new Map([['control', 'Control']]) }, {});
  controlNm.mute = 0; controlNm.out = []; controlNm.eventSeq = 0; controlNm.isMine = () => true;
  control.G.netm = controlNm;

  const runner = a.weaponRunner, spread = runner.spread;
  const before = { charge: runner.charge, cooldown: runner.cooldown, ink: a.ink, streaming: runner.streaming };
  const ownerDraws = [0.5, 1 - 1e-12, 0.125, 0.5];
  let ownerDrawCount = 0;
  f.setRandom(() => { ownerDrawCount++; return ownerDraws.shift() ?? 0.5; });
  G.projectiles.fireSplatling(a, a.weapon, spread);
  const owner = G.projectiles.list.at(-1), packet = nm.out.find(event => event[1] === 'p');
  const controlRunner = c.weaponRunner;
  const controlBefore = { charge: controlRunner.charge, cooldown: controlRunner.cooldown, ink: c.ink, streaming: controlRunner.streaming };
  const controlDraws = [0.5, 1 - 1e-12, 0.125, 0.5];
  let controlDrawCount = 0;
  control.setRandom(() => { controlDrawCount++; return controlDraws.shift() ?? 0.5; });
  control.G.projectiles.fireSplatling(c, c.weapon, controlSpread);
  const controlOwner = control.G.projectiles.list.at(-1), controlPacket = controlNm.out.find(event => event[1] === 'p');
  assert.ok(packet, 'owner publishes exactly one projectile event');
  assert.equal(nm.out.filter(event => event[1] === 'p').length, 1);
  assert.equal(ownerDrawCount, 4, 'the speed, two spread samples, and seed retain their existing draw count');
  assert.ok(controlPacket, 'the same-composition control publishes its owner projectile event');
  assert.equal(controlNm.out.filter(event => event[1] === 'p').length, 1);
  assert.equal(controlDrawCount, 4, 'the jump correction does not change projectile RNG consumption');
  assert.equal(runner.spread, spread, 'the live HUD spread is the scalar supplied to the projectile path');
  // The S3 2024 Spinner study models separate signed horizontal and pitch
  // deviations, not a shared-radius circular cone (the removed baseline).
  const measuredYaw = Math.atan2(owner.vel.x, owner.vel.z) * 180 / Math.PI;
  const expectedYaw = spread * signedBiasSample(1 - 1e-12, .3);
  close(measuredYaw, expectedYaw, 1e-6);
  const expectedPitch = a.weapon.spreadPitchGround * signedBiasSample(.125, .4);
  const measuredPitch = Math.atan2(owner.vel.y, Math.hypot(owner.vel.x, owner.vel.z)) * 180 / Math.PI;
  close(measuredPitch, expectedPitch, 1e-6);
  assert.ok(expectedYaw > 0 && expectedPitch < 0,
    'independent sampled signed axes can point in opposite directions');

  assert.equal(owner.damage, a.weapon.damage);
  assert.equal(owner.life, 3);
  assert.equal(owner.straight, a.weapon.straightTime);
  assert.equal(owner.grav, a.weapon.referenceGravity);
  assert.equal(owner.drag, owner.fidelityMove.freeDrag * 60);
  const flightPhysics = p => ({
    type: p.type, damage: p.damage, life: p.life, straight: p.straight,
    radius: p.radius, grav: p.grav, drag: p.drag, freeDrag: p.fidelityMove.freeDrag,
  });
  assert.deepEqual(flightPhysics(owner), flightPhysics(controlOwner),
    'jump spread changes launch angles without retuning authoritative projectile physics');
  close(owner.vel.length(), controlOwner.vel.length(), 1e-8);
  assert.deepEqual(Array.from(owner.pos.toArray()), Array.from(controlOwner.pos.toArray()), 'both projectiles use the same native muzzle');
  assert.deepEqual({ charge: runner.charge, cooldown: runner.cooldown, ink: a.ink, streaming: runner.streaming }, before);
  assert.deepEqual({ charge: controlRunner.charge, cooldown: controlRunner.cooldown, ink: c.ink, streaming: controlRunner.streaming }, controlBefore);

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

  const controlPacketVelocity = new control.THREE.Vector3(controlPacket[8], controlPacket[9], controlPacket[10]);
  const controlPacketStart = new control.THREE.Vector3(controlPacket[5], controlPacket[6], controlPacket[7]);
  assert.ok(controlPacketVelocity.equals(controlOwner.vel), 'control wire velocity is the owner velocity without rounding');
  control.setRandom(() => 0.5);
  control.G.projectiles.ghostProjectile(c, controlPacket);
  const controlGhost = control.G.projectiles.list.at(-1);
  assert.equal(controlGhost.ghost, true);
  assert.equal(controlGhost.damage, 0, 'the control remote copy is visual and cannot apply gameplay damage');
  assert.ok(controlGhost.vel.equals(controlPacketVelocity));
  assert.ok(controlGhost.pos.equals(controlPacketStart));
  assert.equal(controlNm.out.filter(event => event[1] === 'p').length, 1,
    'the control remote reconstruction does not publish a duplicate shot');
});

test('zero-spread ground Splatling range probe preserves its native projectile and paint RNG sequence', async () => {
  const f = await fidelityFixture({ fidelity: true }), control = await fidelityFixture({ fidelity: true, jumpSpreadControl: true });
  const scenario = CASES.find(item => item.key === 'splatling-partial');
  const a = resetFidelity(f, scenario), c = resetFidelity(control, scenario);
  launchFidelity(f, a, scenario);
  launchFidelity(control, c, scenario);
  assert.equal(f.draws(), 4, 'the zero-spread probe retains speed, both Splatling spread samples, and seed draws');
  assert.equal(control.draws(), 4, 'the same-composition control retains the same projectile RNG sequence');
  finishFidelity(f, a);
  finishFidelity(control, c);
  assert.deepEqual(paintMetrics(f), paintMetrics(control),
    'the jump-only control preserves production paint metrics and every painted footprint cell');
  const paint = paintMetrics(f);
  // PR1188: the CPU body edge equals the rendered GPU body edge (was 0.97 of
  // it), adding the visible boundary ring: 16.875/15.875/254 -> below.
  assert.deepEqual({ maxZ: paint.bounds?.maxZ, area: paint.area, cells: paint.cells },
    { maxZ: 17.125, area: 16.9375, cells: 271 });
});
