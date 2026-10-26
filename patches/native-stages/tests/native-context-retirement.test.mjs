import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRecoveryFixture} from './native-world-recovery-fixture.mjs';
import {nativeGpuTier} from '../runtime/native-gpu-budget.mjs';

async function probe() {
  assert.equal(typeof globalThis.gc, 'function');
  const listeners = [], values = new Map();
  const store = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: store});
  const f = await createRecoveryFixture({shadow: 0, env: 0, palette: 0, minimap: 0}, {modify({mock, G}) {
    G.renderer.domElement = {addEventListener(type, callback) { listeners.push({type, callback}); }};
    const Level = mock.NativeLevel, Paint = mock.PaintSystem;
    mock.NativeLevel = class extends Level { constructor(data) { super(); this.data = data; this.native = true; }};
    mock.NativePhysics = class { constructor(level) { this.level = level; }};
    mock.PaintSystem = class extends Paint { constructor(renderer, level) { super(); this.level = level; }};
    mock.loadNativeData = async () => ({manifest: {geometry: {vertices: 3, triangles: 1}}, payload: new Uint8Array(1024 * 1024)});
  }});
  await f.build(f.game, {id: 'native-first', name: 'Native'}, () => true);
  assert.equal(listeners.length, 1); assert.equal(listeners[0].type, 'webglcontextlost');
  listeners[0].callback(); assert.equal(nativeGpuTier(store), 1);
  const level = new WeakRef(f.G.level), data = new WeakRef(f.game.nativeWorld.textureProfile.data), physics = new WeakRef(f.G.physics);
  f.game.nativeWorld.dispose(); f.game.nativeWorld = null;
  // Model releaseNativeWorld's pointer retirement too: its decor callbacks
  // belong to the old publication scope, and the real transition clears them.
  f.game.decor = null;
  f.G.level = {native: false}; f.G.physics = {}; f.G.paint = {}; f.G.nav = {};
  listeners[0].callback(); assert.equal(nativeGpuTier(store), 1, 'current legacy world does not step down');
  for (let i = 0; i < 12; i++) { await new Promise(resolve => setImmediate(resolve)); globalThis.gc(); }
  const collected = {level: !level.deref(), data: !data.deref(), physics: !physics.deref()};
  assert.deepEqual(collected, {level: true, data: true, physics: true}, 'canvas listener must not retain a retired load scope');
  await f.build(f.game, {id: 'native-next', name: 'Next'}, () => true);
  assert.equal(listeners.length, 1, 're-entry keeps exactly one listener');
  listeners[0].callback(); assert.equal(nativeGpuTier(store), 2, 'same listener observes the current native world');
  console.log(JSON.stringify({collected, listeners: listeners.length, tier: nativeGpuTier(store)}));
}

if (process.env.INKWAVE_NATIVE_CONTEXT_GC_CHILD === '1') await probe();
else test('actual native publication releases its load scope while the canvas watcher remains live', () => {
  const child = spawnSync(process.execPath, ['--expose-gc', '--experimental-vm-modules', fileURLToPath(import.meta.url)], {
    env: {...process.env, INKWAVE_NATIVE_CONTEXT_GC_CHILD: '1'}, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.match(child.stdout, /"collected":\{"level":true,"data":true,"physics":true\}/);
});
