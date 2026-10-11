import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

async function scenario({ hidden, rate, wall = false, network = false }) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  f.context.document = { hidden };
  const { level, V } = makePaintWorld(f, { wall });
  let draws = 0;
  const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, getRenderTarget: () => null,
    getClearColor: c => c, getClearAlpha: () => 0, setRenderTarget() {}, setClearColor() {}, clear() {},
    render() { draws++; } };
  const paint = new f.PaintSystem(renderer, level, { atlasSize: 4096, maxDensity: 30, cell: .25 });
  f.G.paint = paint;
  const owners = [f.make('shooter'), f.make('shooter')]; owners[1].team = 1;
  const point = wall ? V(0, 10, 8) : V(0, 0, 5);
  function splat(team, seq, x = 0) {
    const opts = { seed: team ? .72 : .37, claimOwner: owners[team] };
    if (network) opts.__netOrder = { clock: seq, peer: 'owner-' + team, seq, epoch: 'match' };
    const p = point.clone(); p.x += x;
    owners[team].addTurf(paint.splat(p, 2.7, team, opts));
  }
  splat(0, 1);
  const initial = paint.grid.slice();
  for (let frame = 0; frame < rate * 5; frame++) {
    if (frame === rate / 2) splat(1, 2, 1);
    if (frame === rate) splat(0, 3, -1);
    paint.advanceSimulation(1 / rate);
    paint.flush(1 / rate);
  }
  const receipt = { grid: Array.from(paint.grid), counts: Array.from(paint.counts),
    credit: owners.map(a => [a.stats.turf, a.special]), clock: paint.clock,
    orders: Array.from(paint._paintOwnershipOrder), records: JSON.parse(JSON.stringify(paint._paintOrderRecords)),
    coverage: Array.from(paint.coverage()), growing: paint.growing.length };
  assert.ok(receipt.grid.some((v, i) => v !== initial[i]));
  assert.equal(receipt.growing, 0);
  if (wall) assert.deepEqual(receipt.credit, [[0, 0], [0, 0]], 'walls never charge special/turf');
  if (hidden) {
    assert.equal(draws, 0, 'real PaintSystem draw path must submit no hidden GPU work');
    assert.ok(paint._hiddenPaintGrowth.size <= 3, 'only one snapshot per stamp, not one per simulation frame');
    assert.ok([...paint._hiddenPaintGrowth.values()].every(row => row.g.entries.length && row.g.paintOwner === null),
      'snapshot owns pooled entries but does not retain Actor references');
    f.context.document.hidden = false;
    paint.flush(1 / rate);
    assert.ok(draws > 0, 'restoration presents the final masks even without another simulation tick');
    assert.equal(paint._hiddenPaintGrowth, null);
    assert.deepEqual(Array.from(paint.grid), receipt.grid, 'presentation restoration cannot mutate ownership');
    assert.deepEqual(owners.map(a => [a.stats.turf, a.special]), receipt.credit, 'restoration cannot double-credit');
  }
  paint.dispose();
  return receipt;
}
for (const wall of [false, true]) for (const network of [false, true]) {
  test(`hidden paint preserves visible simulation on ${wall ? 'wall' : 'floor'}, ${network ? 'network' : 'local'} at 30/60/120 Hz`, async () => {
    const expected = await scenario({ hidden: false, rate: 60, wall, network });
    for (const rate of [30, 60, 120]) assert.deepEqual(await scenario({ hidden: true, rate, wall, network }), expected);
  });
}

test('hidden paint does not invent elapsed time and clear discards retained presentation', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  f.context.document = { hidden: true };
  const { paint, V } = makePaintWorld(f), owner = f.make('shooter');
  paint.useFixedPaintClock(); paint.splat(V(0, 0, 5), 2.7, 0, { seed: .37, claimOwner: owner });
  const before = { clock: paint.clock, age: paint.growing[0].age, grid: Array.from(paint.grid) };
  for (let i = 0; i < 300; i++) paint.flush(1 / 30);
  assert.deepEqual({ clock: paint.clock, age: paint.growing[0].age, grid: Array.from(paint.grid) }, before,
    'offline pause which does not call advanceSimulation stays paused');
  paint._clearPaintOwnership();
  assert.equal(paint._hiddenPaintGrowth, null, 'stage reset cannot replay stale retained masks');
});

test('long hidden overwrite stream retains bounded current owners and survives pooled reuse', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  f.context.document = { hidden: true };
  const { paint, V } = makePaintWorld(f), point = V(0, 0, 5);
  for (let i = 0; i < 600; i++) {
    paint.splat(point, .62, i % 2, { seed: .37, instant: true });
    if (i % 5 === 0) paint.advanceSimulation(1 / 60);
  }
  assert.ok(paint._splatPoolStats.growthRecordsReused > 590);
  assert.ok(paint._hiddenPaintGrowth.size <= 128, 'fully overwritten stamps cannot accumulate for every emission');
  const latest = [...paint._hiddenPaintGrowth.values()].at(-1);
  assert.equal(latest.g.team, 1); assert.ok(latest.g.entries.length > 0);
  const expected = Array.from(paint.grid);
  f.context.document.hidden = false; paint.flush(0);
  assert.deepEqual(Array.from(paint.grid), expected);
  assert.equal(paint._hiddenPaintGrowth, null);
});
