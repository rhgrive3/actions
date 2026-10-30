import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { nativeRollerGripGap } from './roller-support-contact.mjs';

// Exercise the final paired-arm IK, folded model and floor correction. Checking
// the authored Euler angle alone misses both the original tilted drum and the
// sideways floor-search correction after landing.
const apis = new Map();
async function api(old) {
  if (!apis.has(old)) {
    const previousPitch = (rel, source) => {
      if (!old || rel !== 'patches/splatoon3/runtime/roller.mjs') return source;
      const key = /\bfollowPitch:\s*1\.4\b/g;
      assert.equal([...source.matchAll(key)].length, 1, 'one production follow-through key');
      return source.replace(key, 'followPitch: .6');
    };
    apis.set(old, fixture({ fullRuntime: true, productionComposition: true,
      includeCharacter: true, realProjectiles: true, vmMathRandom: () => .4,
      adaptRuntime: previousPitch, adaptEmittedRuntime: previousPitch,
      extraExports: "export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';" }));
  }
  return apis.get(old);
}

async function trace({ old = false, hz = 60, held = false, horizontal = false,
  id = 'roller', landing = 40 } = {}) {
  const f = await api(old), { G, THREE: T } = f;
  G.time = 10; G.scene = new T.Scene(); G.camera = new T.PerspectiveCamera();
  G.level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, 0], [20, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -.5, -30], max: [30, 0, 30] }] });
  G.physics = new f.Physics(G.level); G.projectiles = new f.Projectiles(G.scene);
  const a = new f.Actor({ team: 0, name: 'vertical follow-through', isLocal: true,
    weapon: id, CharacterClass: f.Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const c = a.character;
  c.actor = a; c.onEvent = null; G.local = a; G.actors = [a]; G.scene.add(c.root);
  a.reset(); a.setWeapon(id); a.pos.set(0, 0, 0); a.grounded = true;
  a.yaw = a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 0, 20);
  for (let i = 0; i < 120; i++) { G.time += 1 / 60; a._finishFrame(1 / 60); }
  c.fidget = -1; c.idleT = 0; c.shufT = 99;
  if (!horizontal) f.recordMovementLaunch(a);
  const rows = [], clock = new f.FixedClock();
  let tick = 0;
  try {
    for (let display = 0; display < hz * 1.5; display++) clock.advance(1 / hz, dt => {
      const flying = !horizontal && tick < landing;
      a.pos.set(0, flying ? 1.2 * Math.sin(Math.PI * tick / landing) : 0, 0);
      a.vel.set(0, flying ? 1.2 * Math.PI / (landing / 60) * Math.cos(Math.PI * tick / landing) : 0, 0);
      a.grounded = !flying; a.intent.fire = held || tick === 0;
      a.weaponRunner.update(dt, { fire: a.intent.fire, firePressed: tick === 0 });
      G.time += dt; a._finishFrame(dt); G.projectiles.update(dt);
      c.root.updateMatrixWorld(true);
      const attack = a.weaponRunner.s3RollerAttack;
      rows.push({ tick: tick++, axis: new T.Vector3(1, 0, 0).transformDirection(c.weapon.drum.matrixWorld).toArray(),
        pose: Array.from(c.P), grips: ['handR', 'handL'].map(side => nativeRollerGripGap(c, T, side, f.CHARACTER_CHANNELS)),
        native: { ink: a.ink, cooldown: a.weaponRunner.cooldown, rolling: a.weaponRunner.rolling,
          attack: attack ? { ...attack } : null,
          shots: G.projectiles.list.map(p => ({ pos: p.pos.toArray(), vel: p.vel.toArray(), damage: p.damage, age: p.age })) } });
    });
  } finally { c.dispose(); G.actors = []; G.scene = null; }
  return JSON.parse(JSON.stringify(rows));
}

test('released drum points forward and nearly level through airborne follow-through and landing', async () => {
  const before = await trace({ old: true }), after = await trace();
  const forward = r => Math.abs(r.axis[1]) < .3 && Math.abs(r.axis[0]) < .15 && r.axis[2] > .94;
  const window = rows => rows.filter(r => r.tick >= 36 && r.tick <= 46);
  assert(window(after).every(forward), 'real drum axle follows the forward swing plane');
  assert(window(before).every(r => !forward(r)), 'old .6rad pitch reproduces the upright/sideways defect');
  assert.deepEqual(after.map(r => r.native), before.map(r => r.native), 'release, ink, cooldown, projectiles and roll admission');
  assert(after.every(r => r.grips[0] < .002 && r.grips[1] < .02 && r.pose.every(Number.isFinite)), 'both native grips remain reachable');
  // The emission pose and completed carry are unchanged. The shared spline
  // tangent may change during the last two pre-release ticks.
  for (const tick of [0, 31, 56, 65]) assert.deepEqual(after[tick], before[tick], 'boundary ' + tick);
});

test('fixed ticks retain the corrected axle at 30/60/120Hz with released and held ZR', async () => {
  for (const held of [false, true]) {
    const a = await trace({ hz: 30, held }), b = await trace({ hz: 60, held }), c = await trace({ hz: 120, held });
    assert.deepEqual(a, b); assert.deepEqual(b, c);
    assert(b.slice(36, 40).every(r => Math.abs(r.axis[1]) < .3 && r.axis[2] > .94));
    const old = await trace({ old: true, held });
    assert.deepEqual(b.map(r => r.native), old.map(r => r.native));
  }
});

test('horizontal and separately calibrated Dynamo presentation stay unchanged', async () => {
  for (const options of [{ horizontal: true }, { id: 's3-roller-heavy' }])
    assert.deepEqual(await trace(options), await trace({ ...options, old: true }));
});
