import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { specialVfxDirector } from '../runtime/special-vfx.mjs';
import { SPARK, PUFF } from '../runtime/special-vfx-kit.mjs';

// Read-only synthetic presentation states; native movement/timing are covered
// separately by special-reefslider-source-1130.test.mjs and actual Game capture.
async function world(fixedVisualRandom = false) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true,
    adaptRuntime: (rel, source) => {
      if (!fixedVisualRandom || rel !== 'patches/splatoon3/runtime/special-vfx-kit.mjs') return source;
      const fixed = source.replace(/export function vfxRandom\(\) \{[\s\S]*?\n\}/, 'export function vfxRandom() { return .2; }');
      assert.notEqual(fixed, source, 'test-only private visual RNG injection matched');
      return fixed;
    } });
  const { G, THREE } = f, api = f.installedRuntime;
  G.scene = new THREE.Scene(); G.projectiles = new api.Projectiles(G.scene);
  G.camera = new THREE.PerspectiveCamera();
  G.fx = new api.FX(G.scene, { quality: 'high' }); G.fx.setCollider(() => null);
  G.physics = { raycast: (_p, _dir, _max, h) => { h.hit = false; return h; } };
  const a = f.make('shooter'); a.alive = true;
  a.specialActive = { id: 'reefslider', phase: 'startup' };
  a._s3AllSpecialState = { phase: 'startup', direction: new THREE.Vector3(0, 0, 1) };
  G.actors = [a];
  const d = specialVfxDirector(G.fx);
  const tick = dt => { G.time += dt; d.update(dt, G.camera); };
  const phase = value => { a.specialActive.phase = a._s3AllSpecialState.phase = value; };
  return { f, G, a, d, tick, phase };
}

test('Reefslider arming warning retires on impact; blast retains its ink column and sheet', async () => {
  const { a, d, tick, phase } = await world();
  tick(1 / 60); phase('dash'); tick(1 / 60); phase('brake'); tick(1 / 60);
  const t = d.tracks.get(a), warn = t.d.warn;
  assert.ok(d.kit.discs.recs.includes(warn));
  d.event({ actor: a, id: 'reefslider', action: 'impact', pos: [0, 0, 0], radius: 14.9 });
  phase('recovery'); tick(1 / 60);
  assert.equal(d.kit.discs.recs.includes(warn), false, 'an already exploded ride has no arming target');
  assert.equal(warn.dead, true);
  for (const key of ['wakeL', 'wakeR', 'speed']) assert.equal(t.d[key].ended, true, key + ' releases at impact');
  assert.ok(d.kit.inkBeams.recs.some(r => r.life === 0.8 && r.v[5] > 0), 'late vertical ink column retained');
  assert.ok(d.kit.inkBands.recs.some(r => r.life === 0.9), 'late outward ink sheet retained');
});

test('Reefslider startup/shedding/glow emissions and warning angle use elapsed time at 30/60/120 Hz', async context => {
  const env = await world(true), { a, d, tick, phase } = env, rows = [];
  for (const hz of [30, 60, 120]) {
    d.clear(); phase('startup'); tick(1 / hz);
    let startup = 0, drops = 0, glows = 0;
    const puff = d.puff, drop = d.drop, spark = d.spark;
    // Constant private visual RNG isolates cadence from randomized outcomes.
    d.puff = (kind, ...args) => { if (kind === PUFF.CHUNK) startup++; return puff.call(d, kind, ...args); };
    for (let i = 0; i < hz / 2; i++) tick(1 / hz);
    d.puff = puff;
    phase('brake'); tick(1 / hz);
    const warn = d.tracks.get(a).d.warn, angle = warn.v[7];
    d.drop = (...args) => { drops++; return drop.apply(d, args); };
    d.spark = (kind, ...args) => { if (kind === SPARK.GLOW) glows++; return spark.call(d, kind, ...args); };
    for (let i = 0; i < hz / 2; i++) tick(1 / hz);
    rows.push({ hz, rotation: warn.v[7] - angle, startup, drops, glows });
    d.drop = drop; d.spark = spark;
  }
  const angles = rows.map(r => r.rotation);
  context.diagnostic(JSON.stringify(rows));
  assert.ok(Math.max(...angles) - Math.min(...angles) < 1e-4, JSON.stringify(rows));
  for (const row of rows) assert.deepEqual([row.startup, row.drops, row.glows], [30, 30, 30], JSON.stringify(row));
});

test('Reefslider death, interruption, removal, clear and reuse release warning/trails', async () => {
  const { a, G, d, tick, phase } = await world();
  for (const mode of ['death', 'interrupt', 'remove', 'clear']) {
    a.alive = true; G.actors = [a]; a.specialActive = { id: 'reefslider', phase: 'dash' }; phase('dash'); tick(1 / 60);
    phase('brake'); tick(1 / 60); const t = d.tracks.get(a), warn = t.d.warn;
    if (mode === 'death') a.alive = false;
    if (mode === 'interrupt') a.specialActive = null;
    if (mode === 'remove') G.actors = [];
    if (mode === 'clear') d.clear(); else tick(1 / 60);
    assert.equal(d.tracks.has(a), false, mode);
    assert.equal(warn.dead, true, mode);
    for (const key of ['wakeL', 'wakeR', 'speed']) assert.equal(t.d[key].ended, true, mode + ':' + key);
    for (let i = 0; i < 90; i++) tick(1 / 60);
    assert.equal(d.kit.ribbons.list.length, 0, mode + ': no retained wake');
  }
});
