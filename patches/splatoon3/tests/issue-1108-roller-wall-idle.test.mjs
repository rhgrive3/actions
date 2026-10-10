import assert from 'node:assert/strict';
import { stationaryRollerWallPaintEligible } from '../runtime/roller.mjs';
const base = { firing: true, wall: true, stick: false, alive: true, ink: 50, cooldown: 0 };
assert.equal(stationaryRollerWallPaintEligible(base), true, 'ZR wall without stick can paint');
assert.equal(stationaryRollerWallPaintEligible({ ...base, wall: false }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, firing: false }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, ink: 0 }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, stick: true }), false, 'moving stripe stays separate');
console.log('stationary roller wall contact admission passed');


import { test } from 'node:test';
import { fixture } from './source-fixture.mjs';
import { rollerDrumSupport } from '../runtime/roller.mjs';

async function scenario({ wall = true, stick = false, remote = false } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true });
  const level = new f.Level({
    bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 },
    spawnPads: [[-3, 0, 0], [3, 0, 0]], spawnBarrier: 0, half: [],
    single: [
      { kind: 'box', min: [-4, -.5, -7], max: [4, 0, 4] },
      ...(wall ? [{ kind: 'box', min: [-4, 0, 2], max: [4, 3, 2.5] }] : []),
    ],
  });
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  const paints = [], hits = [];
  f.G.paint = {
    splat(pos, radius, team, meta) {
      paints.push({ pos: pos.clone(), radius, team, kind: meta?.kind });
      return .1;
    },
    sample: () => 1,
  };
  f.G.projectiles.applyHit = (...args) => { hits.push(args); return false; };
  const a = f.make('roller'); a.pos.set(0, 0, 1.2); a.yaw = 0;
  a.remote = remote; a.grounded = true; a.ink = 100;
  a.intent.fire = true; a.intent.move.set(0, 0, stick ? 1 : 0);
  a.vel.set(0, 0, stick ? 3 : 0);
  a.weaponRunner.rolling = true; a.weaponRunner.rollT = 1;
  // Native roller uses the last stripe position for distance-paid paint.
  // Seed the true initial lowered-drum state, not a fabricated movement delta.
  a.weaponRunner.lastRollPos = a.pos.clone();
  a.weaponRunner.lastRollInkPos = a.pos.clone();
  a.weaponRunner.flick = -1; a.weaponRunner.cooldown = 0;
  return { f, a, paints, hits };
}
test('#1108 actual production roller contact paints a stationary wall, not the floor', async () => {
  const { f, a, paints, hits } = await scenario();
  const support = rollerDrumSupport(a, f.G, {
    ids: [], start: {}, delta: {}, normalY: 0, contactPoint: {}, wallPoint: {},
  });
  assert.equal(support.wall, true, 'real Level/Physics detects drum-to-wall contact');
  const start = a.pos.clone();
  for (let i = 0; i < 12; i++) {
    f.G.time += 1 / 60;
    a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  }
  assert.deepEqual(a.pos.toArray(), start.toArray(), 'no displacement needed');
  const wallPaint = paints.filter(p => p.pos.y > .01 && p.pos.z > 1.85);
  assert.ok(wallPaint.length > 0, 'wall receives an actual paint.splat call');
  assert.equal(wallPaint.every(p => p.kind === 'roll'), true, 'paint remains roller contact');
  assert.equal(hits.length, 0, 'no-stick contact cannot cause damage');
});
test('#1108 no wall contact and remote proxy cannot mint stationary wall paint', async () => {
  for (const controls of [{ wall: false }, { remote: true }]) {
    const { f, a, paints } = await scenario(controls);
    for (let i = 0; i < 12; i++) {
      f.G.time += 1 / 60;
      a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
    }
    assert.equal(paints.filter(p => p.pos.y > .01 && p.pos.z > 1.85).length, 0,
      'no paint without locally authorized wall contact');
  }
});
