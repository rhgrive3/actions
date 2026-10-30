import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Production Actor, Character, camera ray, solid Level and emitted InkFlight.
// These are INKWAVE consistency checks, not Switch camera/pixel measurements.
const extraExports = "export { computeShotGuide, projectShotGuide } from './patches/splatoon3/runtime/weapons-fidelity.mjs';";
let compiled;
async function scene({ pitch = -.8, yaw = 0, charge = .3, wall = false } = {}) {
  const f = await (compiled ||= fixture({ productionComposition: true, includeCharacter: true, fullRuntime: true, extraExports }));
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.boss = null; G.netm = null; G.time = 0;
  G.audio = { play() {}, loop() { return { set() {}, stop() {} }; } }; G.fx = { muzzle() {}, burst() {} };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] },
      ...(wall ? [{ kind: 'box', min: [-10, 0, 4], max: [10, 8, 4.2] }] : []),
    ] });
  G.physics = new f.Physics(G.level); G.projectiles = new f.Projectiles(G.scene);
  const a = new f.Actor({ team: 0, name: 'Splatling guide regression', weapon: 'splatling', CharacterClass: f.Character });
  a.pos.set(0, 0, 0); a.yaw = a.aimYaw = yaw; a.aimPitch = pitch;
  a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  a.form = 'kid'; a.grounded = true; a.vel.set(0, 0, 0);
  Object.assign(a.weaponRunner, { charging: true, streaming: false, charge, fidelitySplatlingCharge: null });
  const cam = G.camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 400);
  cam.position.copy(a.aimDir).multiplyScalar(-4.5).add(new THREE.Vector3(-.28 * Math.cos(yaw), 2, .28 * Math.sin(yaw)));
  cam.lookAt(cam.position.clone().add(a.aimDir)); cam.updateMatrixWorld(true); G.rig = { gameCam: cam };
  G.actors = [a];
  for (let n = 0; n < 45; n++) a.character.update(1 / 60, { form: 'kid', grounded: true, firing: false,
    charge, aimPitch: pitch, speed: 0, localMove: { x: 0, z: 0 }, ink: 1, hp: 1, vy: 0 });
  a.character.wAim = 1; a.character.root.updateMatrixWorld(true);
  const controller = new f.PlayerController(a, null, null); controller.computeAim();
  return { f, G, a, controller, ps: G.projectiles };
}
const point = (f, value) => new f.THREE.Vector3(value.x, value.y, value.z);

function firstContact(s, hz = 60) {
  const { f, a, ps } = s;
  f.setRandom(() => .5);
  try { ps.fireSplatling(a, a.weapon, 0); } finally { f.restoreRandom(); }
  const head = ps.list.at(-1); assert.ok(head?.inkProfile, 'real canonical Splatling head was emitted');
  let contact = null;
  const world = ps.inkFlight.world;
  ps.inkFlight.world = function (...args) {
    const hit = world.apply(this, args);
    if (hit.hit && !contact) contact = { point: hit.point.clone(), block: hit.block, frame: head.inkFrame };
    return hit;
  };
  try { for (let i = 0; !contact && i < hz * 2; i++) ps._step(head, 1 / hz); }
  finally { ps.inkFlight.world = world; }
  assert.ok(contact, 'actual flight reaches solid geometry'); return contact;
}

test('charging Splatling guide stops at actual floor contact across charge, pitch, yaw and 30/60/120 Hz flight', async () => {
  let cases = 0;
  for (const pitch of [-.25, -.45, -.8, -1.05]) for (const yaw of [0, Math.PI / 2]) for (const charge of [.05, .3, 2 / 3, 1]) {
    const s = await scene({ pitch, yaw, charge }), { f, a, G, ps, controller } = s;
    const before = JSON.stringify({ aim: a.aimPoint.toArray(), dir: a.aimDir.toArray(), ink: a.ink,
      charge: a.weaponRunner.charge, target: controller.onTarget, range: controller.inRange, time: G.time, count: ps.list.length });
    let draws = 0;
    f.setRandom(() => { draws++; throw Error('guide consumed gameplay RNG'); });
    let guide;
    try { guide = point(f, f.computeShotGuide(a)); } finally { f.restoreRandom(); }
    assert.equal(draws, 0);
    assert.equal(JSON.stringify({ aim: a.aimPoint.toArray(), dir: a.aimDir.toArray(), ink: a.ink,
      charge: a.weaponRunner.charge, target: controller.onTarget, range: controller.inRange, time: G.time, count: ps.list.length }), before);
    assert.ok(Math.abs(guide.y) < 1e-8, `guide must stay on floor: ${guide.toArray()}`);
    for (const hz of [30, 60, 120]) {
      const actual = firstContact(s, hz);
      assert.ok(actual.frame <= a.weapon.shotGuideFrame, 'floor contact occurs inside guide envelope');
      assert.ok(guide.distanceTo(actual.point) < 1e-8, `${pitch}/${yaw}/${charge}/${hz}: ${guide.toArray()} vs ${actual.point.toArray()}`);
      cases++;
    }
    const projected = f.projectShotGuide({ ...guide, frames: a.weapon.shotGuideFrame }, G.camera, 1280, 720);
    const physical = guide.clone().project(G.camera);
    assert.ok(Math.abs(projected.x - (physical.x + 1) * 640) < 1e-8, 'HUD x follows the physical contact, without an edge clamp');
    assert.ok(Math.abs(projected.y - (1 - physical.y) * 360) < 1e-8, 'HUD y follows the physical contact, without an edge clamp');
  }
  console.log('Splatling downward native contact comparisons:', cases);
});

test('Splatling guide follows the first solid wall and changed floor immediately', async () => {
  const s = await scene({ pitch: 0, charge: 1, wall: true }), { f, a, G } = s;
  const guide = point(f, f.computeShotGuide(a)), actual = firstContact(s);
  assert.equal(actual.block, 1); assert.ok(guide.distanceTo(actual.point) < 1e-8);
  assert.ok(Math.abs(guide.z - 4) < 1e-8, 'wall clips the guide before its eleven-frame endpoint');
  const down = await scene(), first = point(f, f.computeShotGuide(down.a));
  const floor = G.level.blocks[0]; floor.center.y -= 1; floor.aabbMin.y -= 1; floor.aabbMax.y -= 1; G.level.markCollisionChanged();
  const moved = point(f, f.computeShotGuide(down.a));
  assert.ok(moved.distanceTo(first) > .5); assert.ok(Math.abs(moved.y + 1) < 1e-8);
  assert.ok(moved.distanceTo(firstContact(down).point) < 1e-8);
});

test('a new charge uses its current charge; streaming keeps the released charge for its nominal guide', async () => {
  const { f, a, G, ps } = await scene({ pitch: .2, charge: .1 });
  const runner = a.weaponRunner;
  const clean = point(f, f.computeShotGuide(a));
  runner.fidelitySplatlingCharge = 1; // retained from a previous, completed stream
  const nextCharge = point(f, f.computeShotGuide(a));
  assert.ok(nextCharge.distanceTo(clean) < 1e-8, 'a previous full release cannot move a new partial-charge guide');
  runner.streaming = true; runner.charging = false;
  const stream = point(f, f.computeShotGuide(a));
  runner.charge = .8;
  assert.ok(point(f, f.computeShotGuide(a)).distanceTo(stream) < 1e-8, 'draining burst gauge cannot change released launch speed');
  assert.ok(stream.distanceTo(clean) > 4, 'current charge and retained release remain distinct states');
  const head = (() => { f.setRandom(() => .5); try { ps.fireSplatling(a, a.weapon, 0); return ps.list.at(-1); } finally { f.restoreRandom(); } })();
  for (let i = 0; i < a.weapon.shotGuideFrame; i++) ps._step(head, 1 / 60);
  assert.ok(stream.distanceTo(head.pos) < 1e-8, 'open-air streaming guide retains exact nominal eleven-frame flight');
  assert.equal(G.time, 0);
});
