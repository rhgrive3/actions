import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const STEP = 1 / 60;
const xyz = p => Array.from(p.toArray());
async function boot() {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { BotBrain } from './inkwave-public/src/game/bots.js';" });
  const level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-70, 0, 0], [70, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-100, -1, -100], max: [100, 0, 100] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.match.mode = 'turf'; f.G.match.opts = {};
  // The rejected-choice path continues normal native AI. Empty navigable
  // targets and fully painted ground keep that independent work inert.
  f.G.nav = { validIds: [0], nodes: [{ x: -70, y: 0, z: 0, zone: 0 }] };
  f.G.paint.regionStats = () => ({ own: 1, enemy: 0, empty: 0, n: 1 });
  const make = (point = [0, 0, 0]) => {
    const a = f.make(); delete a._integrate;
    a.spawnAt(new f.THREE.Vector3(...point), 0); a.invuln = 0;
    return a;
  };
  function respawnBot() {
    const a = make([-70, 0, 0]); a.isBot = true;
    const brain = a.bot = new f.BotBrain(a);
    a.splat(null, 'water'); brain.update(STEP);
    assert.equal(brain._wasDead, true);
    a.respawn();
    assert.equal(a.s3.squidSpawn.phase, 'flight');
    f.setRandom(() => 0); // Existing 50% choice is taken, never changed.
    return { a, brain };
  }
  return { ...f, make, respawnBot };
}

async function destination(f, phase) {
  const b = f.make([5, 0, 0]), to = new f.THREE.Vector3(45, 0, 10);
  assert.equal(b.superJump(to), true);
  if (phase === 'flight') {
    for (let i = 0; b.superJumpState?.phase === 'charge' && i < 180; i++) f.tick(b);
    f.tick(b, 5); assert.equal(b.superJumpState.phase, 'flight');
  }
  return { b, to };
}

for (const phase of ['charge', 'flight']) test(`#412 actual respawn Bot inherits a ${phase} teammate's committed destination`, async () => {
  const f = await boot(), { b, to } = await destination(f, phase), { a, brain } = f.respawnBot();
  brain.update(STEP);
  assert.ok(a.superJumpState, 'Bot selection must not blanket-reject a jumping teammate');
  assert.deepEqual(xyz(a.superJumpState.to), xyz(to));
  assert.notEqual(a.superJumpState.to, b.superJumpState.to);
  b.superJumpState.to.set(-20, 0, -20); b.splat(null, 'water');
  for (let i = 0; (a.s3.squidSpawn || a.superJumpState) && i < 400; i++) {
    brain.update(STEP); f.tick(a);
  }
  assert.equal(a.superJumpState, null); assert.equal(a.s3.squidSpawn, undefined);
  assert.ok(a.pos.distanceTo(to) < 1e-9, 'native ground resolution reaches the committed point');
});

test('#412 Bot rejects unknown/malformed/dead/enemy chain targets and preserves ordinary selection', async () => {
  const f = await boot();
  for (const invalid of ['unknown', 'nan', 'dead', 'enemy', 'ordinary']) {
    f.G.actors = [];
    const b = f.make([35, 0, 0]);
    if (invalid !== 'ordinary') b.superJumpState = { phase: 'flight', to: new f.THREE.Vector3(45, 0, 10) };
    if (invalid === 'unknown') delete b.superJumpState.to;
    if (invalid === 'nan') b.superJumpState.to.x = NaN;
    if (invalid === 'dead') b.alive = false;
    if (invalid === 'enemy') b.team = 1;
    const { a, brain } = f.respawnBot(); brain.think = Infinity;
    brain.update(STEP);
    assert.equal(!!a.superJumpState, invalid === 'ordinary', invalid);
    if (invalid === 'ordinary') assert.deepEqual(xyz(a.superJumpState.to), xyz(b.pos));
  }
});

test('#412 Bot chain admission and full landing are fixed-step identical at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await boot(), { to } = await destination(f, 'charge'), { a, brain } = f.respawnBot();
    const clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 6; frame++) clock.advance(1 / hz, () => {
      brain.update(STEP); f.tick(a);
      rows.push([a.s3.squidSpawn?.phase ?? null, a.superJumpState?.phase ?? null, ...xyz(a.pos)]);
    });
    assert.equal(a.superJumpState, null); assert.ok(a.pos.distanceTo(to) < 1e-9);
    traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});
