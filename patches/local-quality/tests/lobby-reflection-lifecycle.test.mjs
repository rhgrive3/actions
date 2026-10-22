import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../inkwave-public/src/game/lobbySet.js', import.meta.url), 'utf8');
const start = source.indexOf('  _createReflectionTarget() {');
const runtime = source.indexOf('  // ---------------------------------------------------------------------------------------------- runtime', start);
const setQuality = source.indexOf('  setQuality(q) {', runtime);
const stats = source.indexOf('  stats() {', setQuality);
assert.ok(start > -1 && runtime > start && stats > setQuality, 'actual LobbySet methods present');
const methods = source.slice(start, runtime) + source.slice(setQuality, stats);

class Value {
  constructor() {
    this.x = 1; this.y = 1; this.z = 1; this.w = 1;
    this.elements = Array(16).fill(1);
    this.normal = { x: 0, y: 1, z: 0 }; this.constant = 0;
  }
  set(x = 1, y = 1, z = 1, w = 1) { Object.assign(this, { x, y, z, w }); return this; }
  copy() { return this; }
  multiply() { return this; }
  invert() { return this; }
  extractRotation() { return this; }
  setFromMatrixPosition() { this.y = 2; return this; }
  applyMatrix4() { return this; }
  add() { return this; }
  multiplyScalar() { return this; }
  dot() { return 1; }
  dispose() { this.disposals = (this.disposals ?? 0) + 1; }
}
class Camera {
  constructor() {
    this.position = new Value(); this.up = new Value();
    this.matrixWorld = new Value(); this.matrixWorldInverse = new Value();
    this.projectionMatrix = new Value(); this.projectionMatrixInverse = new Value();
  }
  lookAt() {}
  updateMatrixWorld() {}
}
const targets = [];
class Target {
  constructor(w, h, options) {
    this.width = w; this.height = h; this.options = options;
    this.texture = { owner: this }; this.disposals = 0;
    targets.push(this);
  }
  setSize(w, h) { this.width = w; this.height = h; }
  dispose() { this.disposals++; }
}
const THREE = {
  PerspectiveCamera: Camera, WebGLRenderTarget: Target, Plane: Value,
  Vector4: Value, Vector2: Value, Vector3: Value, Matrix4: Value,
  HalfFloatType: 1, LinearMipmapLinearFilter: 2, LinearFilter: 3,
};
const QUALITY = {
  high: { refl: 0.5, steam: true, extraLights: true, shadow: 2048 },
  medium: { refl: 0.34, steam: true, extraLights: true, shadow: 1536 },
  low: { refl: 0, steam: false, extraLights: false, shadow: 1024 },
};
const Harness = new Function('THREE', 'QUALITY', 'return class LobbyHarness {\n' + methods + '\n}')(THREE, QUALITY);

function lobby(quality = 'high') {
  const h = new Harness();
  h.Q = QUALITY[quality]; h.quality = quality;
  h.ground = { visible: true }; h.steam = { visible: true }; h.curbs = { visible: true };
  h.mats = { ground: { userData: { refl: {
    tex: { value: null }, on: { value: 0 }, mat: { value: new Value() }, res: { value: new Value() },
  } } } };
  h.lights = { key: { shadow: { mapSize: { x: 2048, set() {} }, map: null } },
    vend: { visible: true }, sweep: { visible: true } };
  h._reflection();
  return h;
}
function renderer(fail = '') {
  const initial = { width: 1000, height: 700 };
  const r = {
    initial, target: initial, autoClear: true,
    xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true },
    state: { buffers: { depth: { setMask() { if (fail === 'mask') throw Error('mask'); } } } },
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return 0; },
    getActiveMipmapLevel() { return 0; },
    getDrawingBufferSize(out) { out.set(initial.width, initial.height); },
    setRenderTarget(t) { if (fail === 'bind' && t !== initial) throw Error('bind'); this.target = t; },
    clear() { if (fail === 'clear') throw Error('clear'); },
    render() { if (fail === 'render') throw Error('render'); },
  };
  return r;
}
function assertRestored(h, r) {
  assert.equal(h._inRefl, false);
  assert.equal(h.ground.visible, true);
  assert.equal(h.steam.visible, true);
  assert.equal(h.curbs.visible, true);
  assert.equal(r.target, r.initial);
  assert.equal(r.xr.enabled, true);
  assert.equal(r.shadowMap.autoUpdate, true);
  assert.equal(r.shadowMap.needsUpdate, true);
  assert.equal(r.autoClear, true);
}
test('normal planar reflection preserves target, renderer flags, visibility and HDR sizing', () => {
  const h = lobby(), r = renderer();
  const rt = h._rRT;
  h.ground.onBeforeRender(r, {}, new Camera());
  assertRestored(h, r);
  assert.equal(h.mats.ground.userData.refl.on.value, 1);
  assert.equal(rt.width, 500); assert.equal(rt.height, 350);
});
test('failure injection never retains hidden children or renderer state; error propagates', () => {
  for (const point of ['bind', 'mask', 'clear', 'render']) {
    const h = lobby(), r = renderer(point);
    assert.throws(() => h.ground.onBeforeRender(r, {}, new Camera()), new RegExp(point));
    assertRestored(h, r);
    assert.equal(h.mats.ground.userData.refl.on.value, 0);
  }
});
test('HIGH/LOW/MEDIUM cycles free GPU targets exactly once and rebind fresh textures', () => {
  const h = lobby(), refl = h.mats.ground.userData.refl;
  const first = h._rRT;
  h.ground.onBeforeRender(renderer(), {}, new Camera());
  assert.equal(first.width, 500);
  for (let i = 0; i < 30; i++) {
    const old = h._rRT;
    h.setQuality('low');
    assert.equal(old.disposals, 1);
    assert.equal(h._rRT, null);
    assert.equal(refl.tex.value, null);
    assert.equal(refl.on.value, 0);
    const count = targets.length;
    h.setQuality('low');
    assert.equal(targets.length, count, 'LOW does not allocate GPU resources');
    h.ground.onBeforeRender(renderer(), {}, new Camera());
    assert.equal(targets.length, count, 'LOW does not render reflection');
    h.setQuality(i % 2 ? 'medium' : 'high');
    assert.ok(h._rRT && h._rRT !== old);
    assert.equal(refl.tex.value, h._rRT.texture);
    h.ground.onBeforeRender(renderer(), {}, new Camera());
    assert.equal(refl.on.value, 1);
  }
  assert.equal(first.disposals, 1);
});

test('nested reflection restores the active cube face and mip level', () => {
  const h = lobby(), r = renderer();
  r.face = 4; r.mip = 2;
  r.getActiveCubeFace = () => r.face;
  r.getActiveMipmapLevel = () => r.mip;
  r.setRenderTarget = (target, face = 0, mip = 0) => {
    r.target = target; r.face = face; r.mip = mip;
  };
  h.ground.onBeforeRender(r, {}, new Camera());
  assertRestored(h, r);
  assert.equal(r.face, 4);
  assert.equal(r.mip, 2);
});

test('restoration failure preserves the original render error and restores object flags', () => {
  const h = lobby(), r = renderer();
  const original = new Error('original render failure');
  r.render = () => { throw original; };
  const bind = r.setRenderTarget.bind(r);
  r.setRenderTarget = target => {
    if (target === r.initial) throw new Error('secondary restore failure');
    bind(target);
  };
  assert.throws(() => h.ground.onBeforeRender(r, {}, new Camera()), error => error === original);
  assert.equal(h._inRefl, false);
  assert.equal(h.ground.visible, true);
  assert.equal(r.autoClear, true);
  assert.equal(r.xr.enabled, true);
  assert.equal(r.shadowMap.autoUpdate, true);
  assert.equal(r.shadowMap.needsUpdate, true);
  assert.equal(h.mats.ground.userData.refl.on.value, 0);
});

test('restoration failure after a successful pass propagates and leaves reflection disabled', () => {
  const h = lobby(), r = renderer();
  const failure = new Error('restore failure');
  const bind = r.setRenderTarget.bind(r);
  r.setRenderTarget = target => {
    if (target === r.initial) throw failure;
    bind(target);
  };
  assert.throws(() => h.ground.onBeforeRender(r, {}, new Camera()), error => error === failure);
  assert.equal(h._inRefl, false);
  assert.equal(h.ground.visible, true);
  assert.equal(h.mats.ground.userData.refl.on.value, 0);
});
