import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// #532 Splat Dualies roll on the production path: full runtime install,
// production build adapters on upstream and runtime modules (so the #477 4F
// startup gate in movement-physics.mjs is the shipped one), real Actor,
// Level and Physics. These are INKWAVE regression contracts:
// - 4F startup without displacement, 12F core 4 WU, 4F post-roll glide 1 WU.
//   4+1=5 is the Inkipedia S3 dualies data; the glide duration and both
//   speed curves are INKWAVE calibrations. The pinned Ver.11.3.0
//   WeaponManeuverNormal SideStepParam omits MoveDist / SlipMoveDist* /
//   SlipMoveFrame / MoveStepKd, so the retail values are omitted defaults.
// - UnrelaxFrameMove=32 (pinned) keeps the actor planted after the core even
//   with the stick held; walking resumes only after it expires.
// - Own/enemy ink, ramp, curb, wall, airborne and chained rolls keep the same
//   budget or truncate it; collision never adds distance later.
// Retail per-frame displacement, the DU/WU scale and Switch parity remain
// unverified; nothing here claims them.
const near = (actual, expected, label, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${label}: ${actual} !== ${expected}`);

async function world(extra = [], ink = 1) {
  const f = await fixture({ productionComposition: true, fullRuntime: true,
    adaptRuntime: (rel, source) => adaptBuildSource(rel, source) });
  const level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, 0], [20, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -1, -30], max: [30, 0, 30] }, ...extra] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.paint.sample = () => ink; // team 0: 1 own ink, 2 enemy ink
  return f;
}

// Fire is held throughout. A roll is a jump press with the stick forward on
// one fixed tick; `stick` keeps the stick held on every other tick.
function roll(f, { presses = [0], ticks = 60, hz = 60, start = [0, 0, 0], grounded = true, stick = false } = {}) {
  const a = f.make('dualies'), clock = new f.FixedClock(), rows = [];
  delete a._integrate;
  a.form = 'kid'; a.pos.set(...start); a.vel.set(0, 0, 0);
  a.grounded = grounded; a.ground.hit = grounded; a.coyote = 0;
  if (grounded) a.ground.face = 0;
  let tick = 0;
  for (let frame = 0; frame < Math.round(hz * ticks / 60); frame++) clock.advance(1 / hz, dt => {
    const press = presses.includes(tick);
    a.intent.fire = true; a.intent.jump = press;
    a.intent.move.set(0, 0, press || stick ? 1 : 0);
    f.G.time += dt; a.update(dt);
    const r = a.weaponRunner;
    rows.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z, grounded: a.grounded, ink: a.ink,
      roll: !!r.dodge, startup: !!r.dodge && r.dodge.startup > 1e-10, glide: !!r.s3DualiesGlide,
      lock: r.lockT, left: r.rollsLeft });
    tick++;
  });
  return rows;
}

test('#532 flat roll: 4F still startup, 4 WU by the 12F core end, 5 WU after the glide, planted for the 32F lock', async () => {
  const rows = roll(await world(), { stick: true });
  // Rows are sampled after each tick: the startup clock reaches zero at the
  // end of tick 3, so ticks 0..3 are the four still startup ticks.
  for (let t = 0; t < 4; t++) {
    assert.equal(rows[t].roll, true, `tick ${t} owns the roll`);
    near(rows[t].z, 0, `startup tick ${t} has no roll displacement`);
  }
  assert.equal(rows[2].startup, true);
  assert.ok(rows[4].z > 0, 'core movement begins on the first post-startup tick');
  for (let t = 4; t < 15; t++) assert.equal(rows[t].roll, true, `core tick ${t}`);
  assert.equal(rows[15].roll, false);
  near(rows[15].z, 4, 'core (12F) displacement');
  near(rows[15].lock * 60, 32, 'UnrelaxFrameMove starts at the core end');
  for (let t = 16; t <= 18; t++) assert.equal(rows[t].glide, true, `glide tick ${t}`);
  near(rows[19].z, 5, 'core + post-roll glide');
  assert.equal(rows[19].glide, false);
  // Stick held forward, fire held: no walking or drift until the lock expires.
  const unlock = rows.findIndex((row, t) => t > 15 && row.lock <= 1e-10);
  assert.equal(unlock, 47, '15 + 32 fixed ticks');
  for (let t = 19; t <= unlock; t++) near(rows[t].z, 5, `planted tick ${t}`);
  assert.ok(rows[unlock + 1].z > 5, 'ordinary walking resumes after the lock');
  for (const row of rows) { near(row.x, 0, 'no lateral drift'); near(row.y, 0, 'stays on the floor'); }
});

test('#532 flat roll and its lock are identical at 30/60/120Hz rendering', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(roll(await world(), { hz, stick: true }));
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});

test('#532 enemy ink keeps the same roll path and roll cost as own ink', async () => {
  const own = roll(await world([], 1)), enemy = roll(await world([], 2));
  assert.deepEqual(enemy.map(row => [row.x, row.y, row.z, row.roll, row.glide, row.lock]),
    own.map(row => [row.x, row.y, row.z, row.roll, row.glide, row.lock]));
  near(100 - enemy[0].ink, 7, 'SideStepParam.InkConsume 0.07');
});

test('#532 uphill ramp and curb keep ground contact without adding horizontal distance', async () => {
  const ramp = roll(await world([{ kind: 'ramp', low: [0, 0, 1], high: [0, 1.5, 9], width: 10, thickness: .5 }]));
  const curb = roll(await world([{ kind: 'box', min: [-5, 0, 2], max: [5, .3, 12] }]));
  for (const [label, rows, top] of [['ramp', ramp, null], ['curb', curb, .3]]) {
    assert.ok(rows.every(row => row.grounded), `${label}: grounded every tick`);
    near(rows[15].z, 4, `${label}: core`); near(rows.at(-1).z, 5, `${label}: total horizontal`);
    assert.ok(rows.at(-1).y > 0, `${label}: climbed`);
    if (top !== null) near(rows.at(-1).y, top, `${label}: on top of the step`);
  }
  for (let t = 1; t < ramp.length; t++) assert.ok(ramp[t].y >= ramp[t - 1].y - 1e-9, 'ramp height never drops');
});

test('#532 a wall truncates the roll and the lost distance is never replayed', async () => {
  const rows = roll(await world([{ kind: 'box', min: [-5, 0, 2.5], max: [5, 4, 3] }]));
  const stop = rows[15].z;
  assert.ok(stop < 2.5 && stop > 1.5, `stopped in front of the wall face: ${stop}`);
  for (let t = 15; t < rows.length; t++) near(rows[t].z, stop, `tick ${t} stays at the wall`);
});

test('#532 airborne roll keeps the 4+1 horizontal budget while descending to the floor', async () => {
  const rows = roll(await world(), { start: [0, 6, 0], grounded: false });
  near(rows[15].z, 4, 'aerial core'); near(rows[19].z, 5, 'aerial glide');
  assert.ok(rows[19].y < rows[15].y && rows[15].y < 6, 'descending');
  assert.ok(rows.at(-1).grounded, 'lands'); near(rows.at(-1).z, 5, 'landing adds no slide');
});

test('#532 chained rolls: second roll after the glide doubles the budget; a third is refused', async () => {
  const rows = roll(await world(), { presses: [0, 20, 40], ticks: 80 });
  near(rows[19].z, 5, 'first roll');
  assert.equal(rows[20].startup, true, 'second roll has its own 4F startup');
  near(rows[20].z, 5, 'no displacement during the second startup');
  near(rows[19].ink - rows[20].ink, 7, 'second roll paid once');
  near(rows[39].z, 10, 'two complete rolls');
  assert.equal(rows[40].roll, false, 'third roll refused (two per chain)');
  near(rows[40].ink, rows[39].ink, 'refused roll is free', 1e-9);
  near(rows.at(-1).z, 10, 'refused roll adds no movement');
});

test('#532 chaining during the glide starts a full second roll and never exceeds two budgets', async () => {
  const rows = roll(await world(), { presses: [0, 17], ticks: 60 });
  const second = rows[16].z;
  assert.ok(second > 4 && second < 5, 'second press arrives mid-glide');
  near(rows[17].z, second, 'second startup tick is still');
  near(rows.at(-1).z - second, 5, 'second roll covers its own 4+1');
  assert.ok(rows.at(-1).z < 10, 'the cancelled glide remainder is not replayed');
});
