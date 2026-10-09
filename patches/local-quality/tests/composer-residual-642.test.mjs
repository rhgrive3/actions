// #642 residual proof (lane cl8): current-main visible post stack pins two
// full-resolution HalfFloat composer targets on every quality/device path.
// Cheap real composed native test: vendored Three r186 real WebGLRenderTarget +
// EffectComposer objects with a stub renderer (no WebGL/GPU, no pixels).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');

function compose(rel) {
  const raw = fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
  return adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
}

async function linkEntry(src) {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  const resolve = (spec, from) =>
    spec === 'three' ? path.join(UPSTREAM, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/')
      ? path.join(UPSTREAM, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from), spec);
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file);
    let code;
    if (rel.startsWith('..')) code = fs.readFileSync(file, 'utf8');
    else code = rel === 'src/config.js' ? compose(rel) : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  };
  const entry = new vm.SourceTextModule(src, { context, identifier: path.join(ROOT, 'c642-entry.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

const stubRenderer = (pixelRatio) => ({
  getPixelRatio: () => pixelRatio,
  getSize: (target) => target.set(1, 1),
  getRenderTarget: () => null,
  setRenderTarget: () => {},
});

const PROFILES = [
  { name: 'touch-ios-HIGH', quality: 'high', mobile: { touch: true, ios: true }, css: [744, 1133], dpr: 3 },
  { name: 'touch-android-HIGH', quality: 'high', mobile: { touch: true, ios: false }, css: [800, 1280], dpr: 3 },
  { name: 'touch-ios-LOW', quality: 'low', mobile: { touch: true, ios: true }, css: [744, 1133], dpr: 3 },
  { name: 'desktop-HIGH', quality: 'high', mobile: { touch: false }, css: [1920, 1080], dpr: 1.5 },
  { name: 'desktop-ULTRA', quality: 'ultra', mobile: { touch: false }, css: [1920, 1080], dpr: 2 },
];

test('#642 residual: composed main still pins two full-res HalfFloat targets', async () => {
  const composed = compose('src/core/renderer.js');
  const baseline = 'const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
  assert.ok(composed.includes(baseline), 'main keeps the unconditional HalfFloat target line');
  assert.ok(!composed.includes('createLazyComposerTarget'), 'no PR #1175 lazy adapter here');
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';\n` +
    `export { effectiveQuality } from './inkwave-public/src/config.js';`);
  assert.equal(ns.THREE.REVISION, '186');
  for (const p of PROFILES) {
    const q = ns.effectiveQuality({ quality: p.quality }, p.mobile);
    const cap = p.mobile.touch ? (p.mobile.ios ? 1.2 : 1.35) : Infinity;
    const pr = Math.min(p.dpr, q.pixelRatio, cap);
    const dw = Math.round(p.css[0] * pr), dh = Math.round(p.css[1] * pr);
    const samples = p.mobile.touch ? 0 : (q.msaa || 0);
    const rt = new ns.THREE.WebGLRenderTarget(dw, dh, { type: ns.THREE.HalfFloatType, samples });
    const comp = new ns.EffectComposer(stubRenderer(pr), rt);
    assert.equal(comp.passes.length, 0, `${p.name}: pair exists before any pass`);
    assert.ok(comp.renderTarget1.isWebGLRenderTarget && comp.renderTarget2.isWebGLRenderTarget);
    assert.notEqual(comp.renderTarget1, comp.renderTarget2);
    for (const t of [comp.renderTarget1, comp.renderTarget2]) {
      assert.equal(t.width, dw, `${p.name} width`);
      assert.equal(t.height, dh, `${p.name} height`);
      assert.equal(t.texture.type, ns.THREE.HalfFloatType, `${p.name} HalfFloat`);
      assert.equal(t.samples, samples, `${p.name} samples`);
    }
    const colorMiB = (dw * dh * 2 * 8) / 1048576;
    assert.ok(colorMiB > 0, `${p.name} bound positive (${colorMiB.toFixed(1)} MiB)`);
    if (p.mobile.touch && p.quality === 'high') assert.ok(colorMiB > 10, `${p.name} tens of MiB`);
    comp.dispose();
  }
});

test('#642 residual: 30/60/120 Hz frame dt does not change the pinned pair', async () => {
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';`);
  for (const hz of [30, 60, 120]) {
    const rt = new ns.THREE.WebGLRenderTarget(960, 540, { type: ns.THREE.HalfFloatType, samples: 0 });
    const comp = new ns.EffectComposer(stubRenderer(1), rt);
    comp.render(1 / hz);
    assert.equal(comp.renderTarget1.texture.type, ns.THREE.HalfFloatType);
    assert.equal(comp.renderTarget2.texture.type, ns.THREE.HalfFloatType);
    assert.equal(comp.renderTarget1.width, 960);
    assert.equal(comp.renderTarget2.width, 960);
    comp.dispose();
  }
});

test('#642 residual: resize/quality rebuild releases the old pair exactly once', async () => {
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';`);
  let disposals = 0;
  const mk = (w, h, samples) => {
    const rt = new ns.THREE.WebGLRenderTarget(w, h, { type: ns.THREE.HalfFloatType, samples });
    const comp = new ns.EffectComposer(stubRenderer(1), rt);
    for (const t of [comp.renderTarget1, comp.renderTarget2]) t.addEventListener('dispose', () => disposals++);
    return comp;
  };
  const a = mk(960, 540, 0);
  a.setSize(640, 360);
  assert.equal(disposals, 2);
  a.dispose();
  assert.equal(disposals, 4);
  const b = mk(640, 360, 4);
  assert.equal(b.renderTarget1.samples, 4);
  assert.equal(b.renderTarget2.samples, 4);
  b.dispose();
  assert.equal(disposals, 6);
});
