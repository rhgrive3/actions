// Model-level ordering and fallback controls. Real atlas pixels and native
// match state are covered independently by the browser replay harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../native-paint-tick-batch.mjs', import.meta.url), 'utf8');
async function fixture(options = {}) {
  class Object3D {}
  Object3D.prototype.onBeforeRender = function () {};
  Object3D.prototype.onAfterRender = function () {};
  class Scene {}
  Scene.prototype.onBeforeRender = function () {};
  Scene.prototype.onAfterRender = function () {};
  class Material {}
  Material.prototype.onBeforeRender = function () {};
  Material.prototype.onBeforeCompile = function () {};
  const document = { hidden: !!options.hidden };
  const context = vm.createContext({ console, document });
  const three = new vm.SyntheticModule(['Object3D', 'Scene', 'Material'], function () {
    this.setExport('Object3D', Object3D); this.setExport('Scene', Scene); this.setExport('Material', Material);
  }, { context });
  const entry = new vm.SourceTextModule(source, { context });
  await entry.link(() => three); await entry.evaluate();
  const game = { s3Clock: { advancing: false, finalTick: true }, match: { mode: options.boss ? 'boss' : 'turf', state: 'playing', ranked: !!options.ranked, paused: !!options.paused } };
  const G = { mode: 'match', game, netm: options.network ? {} : null };
  const material = Object.assign(new Material(), { vertexShader: 'v', fragmentShader: 'f', uniforms: {}, onBeforeRender: Material.prototype.onBeforeRender, onBeforeCompile: Material.prototype.onBeforeCompile });
  if (options.hook) material.onBeforeRender = function () {};
  const geometry = {}, scene = Object.assign(new Scene(), { onBeforeRender: Scene.prototype.onBeforeRender, onAfterRender: Scene.prototype.onAfterRender });
  const mesh = Object.assign(new Object3D(), { geometry, material, onBeforeRender: Object3D.prototype.onBeforeRender, onAfterRender: Object3D.prototype.onAfterRender });
  const events = [], draws = []; let queued = [];
  class Paint {
    constructor() {
      Object.assign(this, { level: { native: options.native !== false }, mat: material, mesh, geo: geometry, scene, cam: {}, rt: { texture: { generateMipmaps: false } }, dryMesh: { visible: false }, aPos: new Float32Array(48000), quads: 0, clock: 0, _wetUntil: 100, _dryAcc: 0, _paintUsesFixedClock: true, _paintSimulationAccumulator: 0, _mipRequested: false, _paintRenderError: null });
    }
    _initGPU() {}
    _pushQuad(name) { if (this.quads >= 6000) this._drawQuads(); queued.push(name); this.quads++; }
    _drawQuads() { if (!this.quads && !this.dryMesh.visible) return; if (this.dryMesh.visible) events.push('dry'); events.push(...queued); draws.push({ dry: this.dryMesh.visible, quads: this.quads }); queued = []; this.quads = 0; this.dryMesh.visible = false; }
    advanceSimulation(dt) { this._paintSimulationAccumulator += dt; this._dryAcc += dt; const n = Math.floor(this._dryAcc * 40); if (n >= 2) { this._dryAcc -= Math.min(n, 12) / 40; this.dryMesh.visible = true; } this._pushQuad('growth-' + this.tick); this._drawQuads(); this.dryMesh.visible = false; this._paintSimulationAccumulator -= dt; }
    flush() { this._drawQuads(); }
    clear() { queued = []; this.quads = 0; events.push('clear'); }
    dispose() {}
  }
  if (options.optimized) assert.equal(entry.namespace.installNativePaintTickBatch(Paint, G), true);
  const paint = new Paint(); G.paint = paint; paint._initGPU();
  return { paint, game, G, document, events, draws, Paint, entry };
}
async function sequence(options = {}) {
  const f = await fixture(options), frames = []; let tick = 0;
  for (const count of [1, 2, 3, 4, 1, 3, 2, 4, 1, 2, 3, 4]) {
    for (let i = 0; i < count; i++) {
      f.game.s3Clock.advancing = true; f.game.s3Clock.finalTick = i === count - 1; f.paint.tick = tick;
      if (tick % 2 === 0) f.paint._pushQuad('shot-' + tick);
      f.paint.advanceSimulation(1 / 60);
      if (i === count - 1) assert.equal(f.paint.quads, 0, 'last tick submits pending quads');
      f.game.s3Clock.advancing = false; tick++;
    }
    f.paint.flush(); frames.push({ events: [...f.events], dryAcc: f.paint._dryAcc, quads: f.paint.quads });
  }
  return { ...f, frames };
}

test('coalesces submissions without changing quad or drying order at 1–4 ticks per frame', async () => {
  const base = await sequence(), trial = await sequence({ optimized: true });
  assert.deepEqual(trial.frames, base.frames); assert(trial.draws.length < base.draws.length);
});
test('online, ranked, boss, paused, hidden and custom hooks retain original submissions', async () => {
  for (const option of ['network', 'ranked', 'boss', 'paused', 'hidden', 'hook']) {
    const base = await sequence({ [option]: true }), trial = await sequence({ [option]: true, optimized: true });
    assert.deepEqual(trial.frames, base.frames, option); assert.equal(trial.draws.length, base.draws.length, option);
  }
});
test('capacity overflow, clock mismatch and stale-wetness boundary preserve ordering', async () => {
  for (const extra of ['overflow', 'clock', 'wet']) {
    const base = await fixture(), trial = await fixture({ optimized: true });
    for (const f of [base, trial]) {
      f.game.s3Clock.advancing = true; f.game.s3Clock.finalTick = false;
      if (extra === 'overflow') for (let i = 0; i < 6001; i++) f.paint._pushQuad(i);
      else { f.paint._pushQuad('first'); f.paint.advanceSimulation(1 / 60); if (extra === 'clock') f.paint._paintSimulationAccumulator = 0.1; else f.paint._wetUntil = 0; f.paint._pushQuad('second'); }
      f.paint.advanceSimulation(1 / 60); f.game.s3Clock.finalTick = true; f.paint.advanceSimulation(1 / 60);
      f.game.s3Clock.advancing = false; f.paint.flush();
    }
    assert.deepEqual(trial.events, base.events, extra); assert.equal(trial.paint.quads, 0);
  }
});
test('clear and disposal retire pending work and installer is idempotent', async () => {
  const f = await fixture({ optimized: true });
  assert.equal(f.entry.namespace.installNativePaintTickBatch(f.Paint, f.G), false);
  f.game.s3Clock.advancing = true; f.game.s3Clock.finalTick = false;
  f.paint._pushQuad('discarded'); f.paint.advanceSimulation(1 / 60); f.paint.clear();
  f.game.s3Clock.finalTick = true; f.paint._pushQuad('kept'); f.paint.advanceSimulation(1 / 60);
  f.game.s3Clock.advancing = false; f.paint.flush(); f.paint.dispose();
  assert(!f.events.includes('discarded')); assert(f.events.includes('clear')); assert(f.events.includes('kept'));
});
