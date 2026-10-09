import {configDependency} from './config-fixture.mjs';
// #932: actual composed ScreenFX/LensInk with real THREE render targets; only the GPU draw is a fixture. Logic-only check
// (dispose events and target sizes), not a GPU memory capture and not a Switch comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
const ROOT = new URL('../../../', import.meta.url), read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const source = (rel, baseline) => baseline ? read(rel) : adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, read(rel)))));

async function fixture({ baseline = false, quality = 'high', drawing = [2880, 1620] } = {}) {
  const G = { mode: 'match', settings: { quality, cameraShake: 1 }, mobile: { touch: false }, teamColors: [new THREE.Color('#f80'), new THREE.Color('#08f')], net: null, netm: null };
  const context = vm.createContext({ console, Math, clearTimeout() {} });
  const config = new vm.SourceTextModule(read('src/config.js'), { context }); await config.link(spec=>configDependency(spec,context)); await config.evaluate();
  const values = { G, on: () => () => {}, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)), lerp: (a, b, t) => a + (b - a) * t };
  const synthetic = v => new vm.SyntheticModule(Object.keys(v), function () { for (const [k, x] of Object.entries(v)) this.setExport(k, x); }, { context });
  const mod = new vm.SourceTextModule(source('src/fx/screenfx.js', baseline), { context });
  await mod.link(spec => spec === 'three' ? synthetic(THREE) : spec.includes('ShaderPass') ? synthetic({ ShaderPass: class { constructor(material) { this.material = material; } } }) : spec.endsWith('ctx.js') ? synthetic(values) : config);
  await mod.evaluate();
  const bound = [];
  const renderer = { getDrawingBufferSize: o => o.set(...drawing), getRenderTarget: () => null, getClearColor: c => c.set(0), getClearAlpha: () => 1,
    setRenderTarget: rt => bound.push(rt), setClearColor() {}, clear() {}, render() {} };
  const R = { renderer, setExtraPass() {} }, fx = new mod.namespace.ScreenFX(R, G);
  const local = { team: 0, enemyTeam: 1, isLocal: true, alive: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), anim: { form: 'kid' }, hp: 100, invuln: 0, weaponRunner: {} };
  const m = { attract: false, state: 'playing', paused: false, local, actors: [local], time: 120 };
  G.match = m; G.local = local;
  const game = { match: m, _skipRender: false };
  fx.update(0, game);   // initial fit (never rendered: still no GPU storage)
  let disposed = 0; fx.lens.rt.addEventListener('dispose', () => disposed++);
  return { G, fx, game, m, bound, THREE, get disposed() { return disposed; }, tick: dt => fx.update(dt, game), droplet: () => fx.lens.droplet(1, 0.5, 0.5, 0.02, { slide: 0.1, life: 0.6 }) };
}
const size = h => [h.fx.lens.rt.width, h.fx.lens.rt.height];

for (const hz of [30, 60, 120]) test(`#932 ${hz}Hz lens target grows on first use, is released after the idle grace and refits on the next hit`, async () => {
  const h = await fixture(), dt = 1 / hz;
  h.tick(dt); h.tick(dt);
  assert.equal(h.fx.lens.parts.length, 0); assert.equal(h.bound.length, 0, 'no lens draw before any lens part exists');
  for (let cycle = 0; cycle < 4; cycle++) {
    h.droplet(); h.tick(dt);
    assert.deepEqual(size(h), [960, 540], 'target is fitted before the first draw'); assert.ok(h.bound.includes(h.fx.lens.rt)); assert.equal(h.fx.U.uLensOn.value, 1);
    assert.equal(h.fx.U.tLens.value, h.fx.lens.rt.texture);
    for (let i = 0; h.fx.lens.parts.length && i < hz * 10; i++) h.tick(dt);   // droplet + its trail evaporate
    assert.equal(h.fx.lens.parts.length, 0); assert.equal(h.fx.U.uLensOn.value, 0);
    assert.deepEqual(size(h), [960, 540], 'idle grace: no allocation thrash between closely spaced hits');
    const before = h.disposed;
    for (let i = 0; i < hz * 2; i++) h.tick(dt);
    assert.deepEqual(size(h), [4, 4], 'released after the grace period'); assert.equal(h.disposed, before + 1, 'old GPU storage disposed exactly once');
    assert.equal(h.fx.U.tLens.value, h.fx.lens.rt.texture, 'same texture owner for tLens');
    for (let i = 0; i < hz; i++) h.tick(dt);
    assert.deepEqual(size(h), [4, 4], 'resize while idle must not regrow the target'); assert.equal(h.disposed, before + 1);
  }
});

test('#932 a hit inside the grace period keeps the target (no dispose/recreate thrash)', async () => {
  const h = await fixture();
  h.droplet(); h.tick(1 / 60); const rt = h.fx.lens.rt;
  for (let n = 0; n < 5; n++) { for (let i = 0; i < 90; i++) h.tick(1 / 60); h.droplet(); h.tick(1 / 60); }
  assert.equal(h.disposed, 0); assert.deepEqual(size(h), [960, 540]); assert.equal(h.fx.lens.rt, rt);
});

test('#932 leaving the match releases the target immediately; the next round refits on first use', async () => {
  const h = await fixture();
  h.droplet(); h.tick(1 / 60); assert.deepEqual(size(h), [960, 540]);
  h.fx.lens.clear(); h.G.mode = 'menu'; h.tick(1 / 60);               // ScreenFX.update detects the match was left and resets
  assert.deepEqual(size(h), [4, 4]); assert.equal(h.disposed, 1);
  h.G.mode = 'match'; h.tick(1 / 60); assert.deepEqual(size(h), [4, 4]);
  h.droplet(); h.tick(1 / 60); assert.deepEqual(size(h), [960, 540]); assert.ok(h.fx.lens.parts.length > 0);
});

test('#932 drawing-buffer and quality changes follow the lens while it is active and never regrow it while idle', async () => {
  const h = await fixture({ quality: 'low', drawing: [1280, 720] });
  h.droplet(); h.tick(1 / 60); assert.deepEqual(size(h), [320, 180]);
  h.fx.renderer.getDrawingBufferSize = o => o.set(1920, 1080); h.tick(1 / 60); assert.deepEqual(size(h), [480, 270]);
  h.fx.lens.clear(); h.fx.lens.park(); h.fx.renderer.getDrawingBufferSize = o => o.set(3840, 2160); h.tick(1 / 60); assert.deepEqual(size(h), [4, 4]);
  h.droplet(); h.tick(1 / 60); assert.deepEqual(size(h), [960, 540]);
});

test('#932 negative control: unpatched ScreenFX keeps the full-size target through idle frames and a match exit', async () => {
  const h = await fixture({ baseline: true });
  h.droplet(); h.tick(1 / 60); assert.deepEqual(size(h), [960, 540]);
  for (let i = 0; i < 60 * 8; i++) h.tick(1 / 60);
  assert.equal(h.fx.lens.parts.length, 0); assert.equal(h.fx.U.uLensOn.value, 0); assert.equal(h.fx.pass.enabled, false);
  assert.deepEqual(size(h), [960, 540]);
  h.G.mode = 'menu'; h.tick(1 / 60); assert.deepEqual(size(h), [960, 540]); assert.equal(h.disposed, 0);
});
