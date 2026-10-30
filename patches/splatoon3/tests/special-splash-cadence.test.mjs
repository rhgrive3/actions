import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fixture } from './source-fixture.mjs';
import { specialVfxDirector } from '../runtime/special-vfx.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';

const file = new URL('../runtime/special-vfx-kit.mjs', import.meta.url);
const source = adaptBuildSource('patches/splatoon3/runtime/special-vfx-kit.mjs', fs.readFileSync(file, 'utf8'));
const from = source.indexOf("    // A burst's adjacent particles share drag.");
const to = source.indexOf('    const P = this.aPos.array', from);
const frozen = fs.readFileSync(new URL('./fixtures/sprite-update-before-drag-cache.txt', import.meta.url), 'utf8');
const oldFrom = frozen.indexOf('    for (let j = this.n - 1; j >= 0; j--) {');
const oldTo = frozen.indexOf('    const P = this.aPos.array', oldFrom);
assert.ok(from >= 0 && to > from && oldFrom >= 0 && oldTo > oldFrom);
async function load(code) {
  code = code.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, quote, path) => 'from ' + JSON.stringify(new URL(path, file).href));
  if (process.env.SPECIAL_SPLASH_ESBUILD) {
    code = compactModuleStrings(createRequire(import.meta.url)(process.env.SPECIAL_SPLASH_ESBUILD).transformSync(code, { loader: 'js', format: 'esm', minify: true, charset: 'utf8' }).code).code;
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).SpecialVfxKit;
}
const Kit = await load(source);
const OldKit = await load(source.slice(0, from) + frozen.slice(oldFrom, oldTo) + source.slice(to));
const slots = [0, 1, 2, 3, 4, 5];
function error(a, b, select = () => true) {
  assert.equal(a.length, b.length);
  let worst = 0;
  for (let i = 0; i < a.length; i++) if (select(i)) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}
function state(pool) {
  return Array.from({ length: pool.n }, (_, j) => slots.map(k => pool.p[j * pool.S + k])).flat();
}
function clone(THREE, Type, seed) {
  const kit = new Type(THREE, new THREE.Scene());
  for (const key of ['sparks', 'puffs']) { kit[key].p.set(seed[key].p); kit[key].n = seed[key].n; }
  return kit;
}
function run(THREE, Type, seed, hz) {
  const kit = clone(THREE, Type, seed), snapshots = [], births = kit.puffs.n + kit.sparks.n;
  try {
    for (let frame = 1; frame <= hz * 2; frame++) {
      kit.update(1 / hz);
      if (frame % (hz / 10) === 0 && frame <= hz * .4) snapshots.push({ puffs: state(kit.puffs), sparks: state(kit.sparks) });
      assert.ok(kit.puffs.n <= kit.puffs.cap && kit.sparks.n <= kit.sparks.cap);
    }
    assert.equal(kit.puffs.n + kit.sparks.n, 0, 'every detached splash expires');
    kit.clear(); kit.update(0);
    for (const p of [kit.puffs, kit.sparks]) {
      assert.equal(p.mesh.geometry.instanceCount, 1, 'clear retains only the transparent warm instance');
      assert.equal(p.aCol.array[3], 0);
    }
    return { snapshots, births };
  } finally { kit.dispose(); }
}
test('real inkBlast spray follows the same 60 Hz curve at 30/60/120 Hz, then retires', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const { THREE, G } = f;
  G.scene = new THREE.Scene();
  const fx = new f.installedRuntime.FX(G.scene, { quality: 'high' });
  G.fx = fx; fx.setCollider(() => null);
  let paint = 0, random = 0;
  fx.onDropletLand = () => { paint++; };
  f.setRandom(() => { random++; return .5; });
  try {
    const d = specialVfxDirector(fx);
    d.inkBlast(new THREE.Vector3(1, .5, 3), [.2, .4, .8], 6, { native: false });
    assert.ok(d.kit.puffs.n > 60, 'actual liquid chunks, petals and mist were emitted');
    const reference = run(THREE, Kit, d.kit, 60);
    let worst = 0, before = 0, position = 0, velocity = 0, oldPosition = 0, oldVelocity = 0;
    for (const hz of [30, 120]) {
      const result = run(THREE, Kit, d.kit, hz), old = run(THREE, OldKit, d.kit, hz);
      assert.equal(result.births, reference.births, 'no change to emission count');
      result.snapshots.forEach((sample, i) => {
        for (const key of ['puffs', 'sparks']) {
          worst = Math.max(worst, error(sample[key], reference.snapshots[i][key]));
          before = Math.max(before, error(old.snapshots[i][key], reference.snapshots[i][key]));
          position = Math.max(position, error(sample[key], reference.snapshots[i][key], j => j % 6 < 3));
          velocity = Math.max(velocity, error(sample[key], reference.snapshots[i][key], j => j % 6 >= 3));
          oldPosition = Math.max(oldPosition, error(old.snapshots[i][key], reference.snapshots[i][key], j => j % 6 < 3));
          oldVelocity = Math.max(oldVelocity, error(old.snapshots[i][key], reference.snapshots[i][key], j => j % 6 >= 3));
        }
      });
    }
    assert.ok(worst < 2e-5, 'Float32 motion agrees within 0.02 mm / 0.02 mm per second: ' + worst);
    assert.ok(before > .04, 'the frozen old integrator fails the same actual burst: ' + before);
    assert.equal(paint, 0, 'the splash never authors paint');
    assert.equal(random, 0, 'the splash never consumes gameplay randomness');
    console.log(JSON.stringify({ case: 'real inkBlast', births: reference.births, beforePosition: oldPosition, afterPosition: position, beforeVelocity: oldVelocity, afterVelocity: velocity }));
  } finally { f.restoreRandom(); fx.dispose(); }
});

test('gravity, buoyancy, zero and near-zero drag retain their curve under regular and uneven steps', async () => {
  const f = await fixture(), { THREE } = f;
  for (const rate of [0, 1e-10, .8, 2.2, 10]) {
    const seed = new Kit(THREE, new THREE.Scene());
    try {
      seed.puffs.spawn(1, 2, 3, 8, 6, -4, 2, .2, .1, 1, .4, .2, 1, 2,
        { drag: rate, grav: 14, buoy: .6, seed: .2, rot: 0, stretch: .05 });
      const simulate = steps => {
        const kit = clone(THREE, Kit, seed);
        try { for (const dt of steps) kit.update(dt); return state(kit.puffs); }
        finally { kit.dispose(); }
      };
      const reference = simulate(Array(30).fill(1 / 60));
      for (const hz of [30, 120]) assert.ok(error(reference, simulate(Array(hz / 2).fill(1 / hz))) < 2e-5, `drag=${rate} ${hz}Hz`);
      const uneven = [];
      for (let t = 0, k = 0; t < .5;) { const dt = Math.min([1/144, 1/75, 1/40][k++ % 3], .5 - t); uneven.push(dt); t += dt; }
      assert.ok(error(reference, simulate(uneven)) < 2e-5, `drag=${rate} uneven steps`);
      assert.deepEqual(simulate([0]), state(seed.puffs), 'zero time leaves motion untouched');
    } finally { seed.dispose(); }
  }
});

test('positive elapsed time below the drag-product range uses its finite zero limit', async () => {
  const f = await fixture(), { THREE } = f;
  for (const rate of [2 ** -149, 1e-20, 1]) for (const dt of [Number.MIN_VALUE, 1e-300, 1e-30]) {
    const kit = new Kit(THREE, new THREE.Scene());
    try {
      kit.puffs.spawn(1, 2, 3, 8, 6, -4, 2, .2, .1, 1, .4, .2, 1, 2,
        { drag: rate, grav: 14, buoy: .6, seed: .2, rot: 0, stretch: .05 });
      const before = state(kit.puffs);
      kit.update(dt);
      assert.deepEqual(state(kit.puffs), before, `sub-Float32 motion remains unchanged for drag=${rate} dt=${dt}`);
      for (const attribute of kit.puffs.updateAttributes) assert.ok(attribute.array.every(Number.isFinite), 'no nonfinite vertex attribute');
    } finally { kit.dispose(); }
  }
});
