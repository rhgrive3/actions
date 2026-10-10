import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { rollerDrumSupport } from '../runtime/roller.mjs';

// #1108 runtime regression: drives the production roller (Level, Physics raycast,
// WeaponRunner, G.paint.splat) through stationary wall contact, moving wall
// contact, ordinary floor rolling and no-contact controls. The helper-only
// test in issue-1108-roller-wall-idle.test.mjs does not exercise this path.
const DT = 1 / 60;
// Wall face at z=2 (box min z); the roller contact offsets the splat 0.025 along the normal.
// Native ground-stripe paint never lands on this plane, so the face test separates them.
const WALL_FACE_Z = 2 - .025;
const isWallPaint = p => Math.abs(p.pos.z - WALL_FACE_Z) < 1e-6;

async function scenario({ wall = true, stick = false, remote = false, startZ = 1.2, speed = 0 } = {}) {
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
  const a = f.make('roller');
  a.pos.set(0, 0, startZ); a.yaw = 0;
  a.remote = remote; a.grounded = true; a.ink = 100;
  a.intent.fire = true; a.intent.move.set(0, 0, stick ? 1 : 0);
  a.vel.set(0, 0, stick ? speed : 0);
  a.weaponRunner.rolling = true; a.weaponRunner.rollT = 1;
  // Seed the true initial lowered-drum state, not a fabricated movement delta.
  a.weaponRunner.lastRollPos = a.pos.clone();
  a.weaponRunner.lastRollInkPos = a.pos.clone();
  a.weaponRunner.flick = -1; a.weaponRunner.cooldown = 0;
  const step = frames => {
    for (let i = 0; i < frames; i++) {
      f.G.time += DT;
      // Actor translation is applied by the caller; the runner only reads it.
      if (stick) a.pos.addScaledVector(a.vel, DT);
      a.weaponRunner.update(DT, { fire: true, firePressed: false, sub: false, subReleased: false });
    }
  };
  return { f, a, paints, hits, step };
}

test('#1108 stationary drum pressed on a wall paints that wall with no stick and no damage', async () => {
  const { f, a, paints, hits, step } = await scenario();
  const support = rollerDrumSupport(a, f.G, {
    ids: [], start: {}, delta: {}, normalY: 0, contactPoint: {}, wallPoint: {},
  });
  assert.equal(support.wall, true, 'real Level/Physics detects drum-to-wall contact');
  const start = a.pos.clone();
  step(12);
  assert.deepEqual(a.pos.toArray(), start.toArray(), 'no displacement is needed');
  const wallPaint = paints.filter(isWallPaint);
  assert.ok(wallPaint.length > 0, 'wall receives an actual paint.splat call');
  assert.equal(wallPaint.every(p => p.kind === 'roll'), true, 'paint is roller contact');
  assert.equal(hits.length, 0, 'no-stick wall contact cannot cause roll-contact damage');
});

test('#1108 drum moving into a wall paints the contacted wall through distance-based roll paint', async () => {
  // Start out of contact (reach 1.2 from z=0.6 ends at 1.8 < wall at 2), then move in.
  const { paints, hits, step, a } = await scenario({ stick: true, startZ: .6, speed: 3 });
  const start = a.pos.clone();
  step(12);
  assert.ok(a.pos.distanceTo(start) > .28, 'the moving case crosses the displacement threshold');
  const wallPaint = paints.filter(isWallPaint);
  assert.ok(wallPaint.length > 0, 'moving drum contact paints the wall');
  assert.equal(wallPaint.every(p => p.kind === 'roll'), true);
});

test('#1108 ordinary floor rolling keeps distance-based floor paint and no wall paint', async () => {
  const { paints, step, a } = await scenario({ wall: false, stick: true, startZ: .6, speed: 3 });
  const start = a.pos.clone();
  step(12);
  assert.ok(a.pos.distanceTo(start) > .28, 'floor rolling crosses the displacement threshold');
  assert.ok(paints.length > 0, 'rolling on the floor paints the ground stripe');
  assert.ok(paints.every(p => p.pos.y < .5 && p.kind === 'roll'), 'ground stripe stays at drum height');
  assert.equal(paints.filter(isWallPaint).length, 0, 'no wall is present to paint');
});

test('#1108 no wall contact and remote proxy cannot mint stationary wall paint', async () => {
  for (const controls of [{ wall: false }, { remote: true }]) {
    const { paints, hits, step } = await scenario(controls);
    step(12);
    assert.equal(paints.filter(isWallPaint).length, 0,
      `no wall paint without locally authorized wall contact (${JSON.stringify(controls)})`);
    assert.equal(hits.length, 0, `no damage from stationary contact (${JSON.stringify(controls)})`);
  }
});
