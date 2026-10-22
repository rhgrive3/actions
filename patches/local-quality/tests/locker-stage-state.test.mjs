import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeURL = process.env.INKWAVE_BUILT_SITE
  ? pathToFileURL(path.resolve(process.env.INKWAVE_BUILT_SITE, 'patches/local-quality/locker-stage.mjs'))
  : new URL('../locker-stage.mjs', import.meta.url);
const source = fs.readFileSync(runtimeURL, 'utf8');

async function fixture({ loaded = true, autoClear = true, fail = null, thrown = Error('backdrop failed'), restoreError = null } = {}) {
  const events = [], originalTarget = { texture: 'caller target' };
  const texture = { image: { width: 2048, height: 1024 }, repeat: { set(x, y) { this.x = x; this.y = y; } }, offset: { set(x, y) { this.x = x; this.y = y; } } };
  let loads = 0;
  class Color { constructor(value) { this.value = value; } copy(other) { this.value = other.value; return this; } }
  class Scene { add(mesh) { this.mesh = mesh; } }
  class Material { constructor(options) { Object.assign(this, options); } }
  const THREE = {
    Color, Scene, Vector2: class {}, MeshBasicMaterial: Material,
    Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material }); } },
    PlaneGeometry: class {}, OrthographicCamera: class {},
    TextureLoader: class { load(url, onLoad) { loads++; if (loaded) onLoad(texture); } },
    SRGBColorSpace: 'srgb', LinearFilter: 'linear',
  };
  const context = vm.createContext({ URL });
  const module = new vm.SourceTextModule(source, { context, identifier: runtimeURL.href,
    initializeImportMeta(meta) { meta.url = runtimeURL.href; } });
  await module.link(specifier => {
    assert.equal(specifier, 'three');
    return new vm.SyntheticModule(Object.keys(THREE), function () {
      for (const [name, value] of Object.entries(THREE)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  const initial = { autoClear, color: '#123456', alpha: 0.25, target: originalTarget, face: 4, mip: 2 };
  const renderer = {
    ...initial,
    getSize(out) { events.push('size'); Object.assign(out, { x: 1600, y: 900 }); return out; },
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return this.face; },
    getActiveMipmapLevel() { return this.mip; },
    getClearAlpha() { return this.alpha; },
    getClearColor(out) { return out.copy(new Color(this.color)); },
    setRenderTarget(target, face = 0, mip = 0) {
      events.push(['target', target, face, mip]);
      Object.assign(this, { target, face, mip });
      if (fail === 'target' && target === null) throw thrown;
    },
    setClearColor(color, alpha) {
      events.push(['color', color.value, alpha]);
      if (color.value === initial.color && restoreError) throw restoreError;
      Object.assign(this, { color: color.value, alpha });
      if (fail === 'color' && color.value !== initial.color) throw thrown;
    },
    clear(color, depth, stencil) {
      events.push(['clear', color, depth, stencil]);
      if (fail === 'clear') throw thrown;
    },
    render(scene) {
      events.push(['backdrop', scene.mesh.material.map]);
      assert.equal(this.autoClear, false);
      if (fail === 'render') throw thrown;
    },
  };
  const showcase = {
    update(dt) { events.push(['update', dt]); },
    render() { events.push(['showcase', renderer.autoClear, renderer.color, renderer.alpha, renderer.target]); },
  };
  const game = { showcase, _skipRender: false };
  return { renderer, initial, events, texture, game, loads: () => loads,
    run: () => module.namespace.renderLockerStage(game, { renderer }, 1 / 60) };
}

function restored(f) {
  assert.equal(f.renderer.autoClear, f.initial.autoClear);
  assert.equal(f.renderer.color, f.initial.color);
  assert.equal(f.renderer.alpha, f.initial.alpha);
}

test('normal locker backdrop preserves flags and color before the existing canvas showcase composite', async () => {
  for (const autoClear of [true, false]) {
    const f = await fixture({ autoClear }); f.run();
    restored(f);
    assert.equal(f.renderer.target, null, 'successful locker frame intentionally renders to the canvas');
    assert.equal(f.loads(), 1);
    assert.equal(f.events.filter(e => e[0] === 'backdrop').length, 1);
    const composite = f.events.find(e => e[0] === 'showcase');
    assert.deepEqual(composite.slice(1), [autoClear, '#123456', 0.25, null]);
    assert.equal(f.texture.repeat.x, 8 / 9);
    assert.equal(f.texture.repeat.y, 1);
  }
});

test('loading backdrop keeps its fallback clear and normal showcase rendering', async () => {
  const f = await fixture({ loaded: false }); f.run();
  restored(f);
  assert.equal(f.events.filter(e => e[0] === 'backdrop').length, 0);
  assert.equal(f.events.filter(e => e[0] === 'clear').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'showcase').length, 1);
});

test('skipped locker frame updates animation without loading or touching renderer state', async () => {
  const f = await fixture(); f.game._skipRender = true; f.run();
  assert.deepEqual(f.events, [['update', 1 / 60]]);
  assert.equal(f.loads(), 0);
  restored(f);
  assert.equal(f.renderer.target, f.initial.target);
});

test('backdrop failures restore caller flags, color and exact target face/mip before propagating', async () => {
  for (const fail of ['target', 'color', 'clear', 'render']) for (const thrown of [Error(fail), null, 0]) {
    const f = await fixture({ fail, thrown });
    let caught = false;
    try { f.run(); } catch (error) { caught = true; assert.equal(error, thrown); }
    assert.equal(caught, true);
    restored(f);
    assert.equal(f.renderer.target, f.initial.target);
    assert.equal(f.renderer.face, f.initial.face);
    assert.equal(f.renderer.mip, f.initial.mip);
    assert.equal(f.events.some(e => e[0] === 'showcase'), false);
  }
});

test('restoration failure preserves the original backdrop error and still restores target', async () => {
  const thrown = Error('primary draw error'), restoreError = Error('color restore error');
  const f = await fixture({ fail: 'render', thrown, restoreError });
  assert.throws(f.run, error => error === thrown);
  assert.equal(f.renderer.autoClear, f.initial.autoClear);
  assert.equal(f.renderer.target, f.initial.target);
  assert.equal(f.renderer.face, f.initial.face);
  assert.equal(f.renderer.mip, f.initial.mip);
});

test('a sole restoration failure propagates and suppresses the showcase render', async () => {
  const restoreError = Error('color restore error');
  const f = await fixture({ restoreError });
  assert.throws(f.run, error => error === restoreError);
  assert.equal(f.renderer.autoClear, f.initial.autoClear);
  assert.equal(f.renderer.target, f.initial.target);
  assert.equal(f.events.some(e => e[0] === 'showcase'), false);
});
