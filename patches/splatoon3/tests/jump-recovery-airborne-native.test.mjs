// Pinned S3 11.3.0 start/end fields plus Kanamoji #6's hold/recovery
// observations. These tests exercise INKWAVE's actual admission/movement and
// launch paths; neither a Nintendo executable nor a retail measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const IDs = ['shooter', 'dualies', 'blaster', 'splatling',
  's3-shooter-short', 's3-maneuver-short', 's3-blaster-light', 's3-spinner-quick'];
const jumpAge = a => {
  const r = a.weaponRunner, family = a.weapon.behaviorKind || a.weapon.kind;
  if (family === 'splatling') return a.s3SplatlingJumpAgeFrames;
  const seconds = a.weapon.catalogRecord ? r.catalogState?.jumpAge
    : family === 'shooter' ? r.s3JumpSpreadAge
      : family === 'dualies' ? r.s3DualiesJumpT : r.s3BlasterJumpT;
  return Number.isFinite(seconds) ? seconds * 60 : null;
};

async function run(id, hz, jumping) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  // A tall platform makes a genuine post-jump fall last beyond recovery.
  // Keep native integration/ground probes; make() only stubs presentation.
  const level = new f.Level({ bounds: { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
    spawnPads: [[-200, 0, 0], [200, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-100, -1, -100], max: [100, 0, 100] },
      { kind: 'box', min: [-10, 199, -10], max: [10, 200, 0] },
    ] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  const a = f.make(id); delete a._integrate;
  a.pos.set(0, 200, -1.2); a.vel.set(0, 0, 0); a.grounded = true;
  const hit = f.G.physics.groundProbe(0, 200, -1.2, .4, .35, f.PLAYER.footRadius, a.ground, false);
  assert.equal(hit.hit, true); a.groundN.copy(hit.normal); a._surface();
  // Construct per-weapon state on the ground before the admitted input.
  f.tick(a);
  a.intent.move.set(0, 0, 1); a.aimDir.set(0, 0, 1);
  const r = a.weaponRunner, family = a.weapon.behaviorKind || a.weapon.kind;
  const param = a.weapon.catalogRecord?.parameters.WeaponParam
    || f.profile.weaponsFidelityCompletion.weapons[family].WeaponParam;
  const start = param.Jump_DegBiasDecreaseStartFrame, end = param.Jump_DegBiasEndFrame;
  const ground = a.weapon.spreadGround, air = a.weapon.spreadAir;
  const rows = [], shots = [], clock = new f.FixedClock();
  let frame = 0, seed = 170026;
  f.setRandom(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; });
  const push = f.G.projectiles._push;
  f.G.projectiles._push = function(p) {
    shots.push([frame, a.grounded, r.spread, ...p.vel.toArray()]);
    return push.call(this, p);
  };
  for (let render = 0; render < hz * 2; render++) clock.advance(1 / hz, dt => {
    a.intent.jump = jumping && frame === 0;
    a.intent.fire = family === 'splatling' ? frame > 0 && frame < 90 : frame > 5;
    a.character.root.position.copy(a.pos);
    a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 100));
    f.G.time += dt; a.update(dt);
    const age = jumpAge(a), serial = a.s3JumpSerial || 0;
    rows.push([a.pos.y, a.pos.z, a.grounded, serial, age, r.spread, a.ink]);
    assert.equal(serial, jumping ? 1 : 0, 'support loss never manufactures another jump');
    if (!jumping) {
      assert.equal(age, null, 'walk-off keeps the jump clock absent');
      near(r.spread, ground, 'walk-off keeps ordinary maximum angle');
    } else if (frame <= start) {
      near(age, frame, 'one admitted jump advances at the fixed simulation clock');
      near(r.spread, air, 'source hold endpoint');
    } else if (frame < end) {
      assert.ok(r.spread > ground && r.spread < air, 'maximum recovers between source endpoints');
    } else {
      assert.equal(age, null, 'recovery ends without waiting for a landing');
      near(r.spread, ground, 'no renewed jump penalty after recovery');
    }
    if (frame === end) assert.equal(a.grounded, false, 'endpoint really occurs during the long fall');
    frame++;
  });
  assert.equal(frame, 120);
  assert.ok(rows.some(row => !row[2] && row[0] < 199), 'native terrain integration leaves the platform');
  assert.ok(shots.some(shot => shot[0] >= end && !shot[1]), `actual owner emits at/after the airborne recovery endpoint: ${id}`);
  return { rows, shots };
}

for (const id of IDs) test(`${id}: native walk-off and admitted jump recover during flight identically at 30/60/120Hz`, async () => {
  for (const jumping of [false, true]) {
    const runs = [];
    for (const hz of [30, 60, 120]) runs.push(await run(id, hz, jumping));
    assert.deepEqual(runs[0], runs[1]);
    assert.deepEqual(runs[1], runs[2]);
  }
});
