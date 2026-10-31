import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const path = process.env.INKWAVE_RENDERER_TEST_SOURCE || new URL('../../../inkwave-public/src/core/renderer.js', import.meta.url);
const source = adaptBuildSource('src/core/renderer.js', fs.readFileSync(path, 'utf8'));
const declaration = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body
  .find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'Renderer').declaration;
function methods(globals = {}) {
  const context = vm.createContext({ console, G: {}, ...globals });
  return Object.fromEntries(declaration.body.body.filter(node => node.kind === 'method').map(node =>
    [node.key.name, vm.runInContext('(function' + source.slice(node.value.start, node.value.end) + ')', context)]));
}

function fixture({ touch = false, ios = false, qualityRatio = 2, scale = 1, ratio = 1 } = {}) {
  const window = { innerWidth: 801, innerHeight: 601, devicePixelRatio: ratio };
  const sizes = [], ratios = [], texels = [], projections = [];
  const prototype = methods({ window, resizeBattleCamera: (...args) => projections.push(args) });
  const owner = Object.assign(Object.create(prototype), {
    _w: window.innerWidth, _h: window.innerHeight, _dpr: ratio,
    mobile: { touch, ios }, q: { pixelRatio: qualityRatio }, dynScale: scale,
    renderer: { ratio, getPixelRatio() { return this.ratio; }, setPixelRatio(value) { this.ratio = value; ratios.push(value); }, setSize: (...size) => sizes.push(size) },
    composer: { setPixelRatio: value => ratios.push(value), setSize: (...size) => sizes.push(size) },
    fxaa: { uniforms: { uTexel: { value: { set: (...values) => texels.push(values) } } } },
    grade: { uniforms: { uAspect: { value: window.innerWidth / window.innerHeight } } },
    camera: { userData: {}, updateProjectionMatrix() {} },
  });
  return { owner, window, sizes, ratios, texels, projections };
}

test('display-density changes update canvas, composer and FXAA without a CSS resize', () => {
  const f = fixture();
  f.window.devicePixelRatio = 2;
  f.owner.resize();
  assert.equal(f.owner.renderer.ratio, 2);
  assert.deepEqual(f.ratios, [2, 2]);
  assert.deepEqual(f.texels.at(-1), [1 / 1602, 1 / 1202]);
  const updates = [f.sizes.length, f.ratios.length, f.texels.length];
  for (let i = 0; i < 120; i++) f.owner.resize();
  assert.deepEqual([f.sizes.length, f.ratios.length, f.texels.length], updates, 'stable frames do not resize or upload uniforms');
  f.window.devicePixelRatio = 1;
  f.owner.resize();
  assert.equal(f.owner.renderer.ratio, 1, 'moving back releases the oversized drawing buffer');
});

test('density transitions retain quality, mobile and dynamic resolution caps', () => {
  for (const [options, expected] of [
    [{ qualityRatio: 1.5, scale: .8 }, 1.2],
    [{ touch: true, ios: true, scale: .75 }, .9],
    [{ touch: true, ios: false, scale: .6 }, .81],
  ]) {
    const f = fixture(options); f.window.devicePixelRatio = 3; f.owner.resize();
    assert.equal(f.owner.renderer.ratio, expected);
    assert.equal(f.owner.dynScale, options.scale);
    assert.deepEqual(f.texels.at(-1), [1 / Math.floor(801 * expected), 1 / Math.floor(601 * expected)]);
  }
});

test('FXAA samples the integer GL texture dimensions at fractional resolution', () => {
  const f = fixture();
  f.owner._fxaaTexel(802, 602, 1.35);
  assert.deepEqual(f.texels.at(-1), [1 / 1082, 1 / 812]);
  f.owner._fxaaTexel(1, 1, .6);
  assert.deepEqual(f.texels.at(-1), [1, 1], 'tiny dimensions retain finite texels');
});

test('zero viewport resize keeps finite projection inputs and recovers on the next visible size', () => {
  const f = fixture();
  for (const [width, height] of [[0, 0], [801, 0], [0, 601]]) {
    f.window.innerWidth = width; f.window.innerHeight = height;
    f.owner.resize();
    assert.ok(f.owner._w >= 1 && f.owner._h >= 1);
    assert.ok(Number.isFinite(f.owner.grade.uniforms.uAspect.value));
    assert.ok(f.projections.slice(-2).every(([, aspect]) => Number.isFinite(aspect) && aspect > 0));
    assert.ok(f.sizes.slice(-2).every(size => size.every(value => value >= 1)));
  }
  f.window.innerWidth = 801; f.window.innerHeight = 601; f.owner.resize();
  assert.deepEqual([f.owner._w, f.owner._h], [801, 601]);
  assert.equal(f.owner.grade.uniforms.uAspect.value, 801 / 601);
});

test('tiny viewports retain a physical pixel across low quality, dynamic scale and display density changes', () => {
  const f = fixture({touch: true, qualityRatio: .75});
  f.window.innerWidth=0;f.window.innerHeight=1;
  // Exercise an actual DPR transition from the constructor's native ratio.
  f.owner._dpr=undefined;
  const physical=()=>[f.owner._w,f.owner._h].map(n=>Math.floor(n*f.owner.renderer.getPixelRatio()));
  f.owner.resize();assert.equal(f.owner.renderer.ratio,.75);assert.deepEqual(physical(),[1,1]);
  f.owner.setDynamicScale(.6);assert.ok(Math.abs(f.owner.renderer.ratio-.45)<1e-12);assert.deepEqual(physical(),[1,1]);
  f.window.devicePixelRatio=.5;f.owner.resize();assert.equal(f.owner.renderer.ratio,.3);assert.deepEqual(physical(),[1,1]);
  assert.ok(Number.isFinite(f.owner.grade.uniforms.uAspect.value));
  f.window.innerWidth=801;f.window.innerHeight=601;f.owner.resize();
  assert.deepEqual([f.owner._w,f.owner._h],[801,601]);
});

test('composer descriptions can be built while the logical viewport is zero', () => {
  const window = {innerWidth: 0, innerHeight: 0, devicePixelRatio: 1};
  const sizes = [], states = [];
  class Pass {
    constructor() { this.uniforms = {uAspect: {value: 0}, uTexel: {value: {set() {}}}}; }
  }
  const prototype = methods({window, location: {search: ''}, RenderPass: Pass, ShaderPass: Pass,
    OutputPass: Pass, GradeShader: {}, FXAAShader: {},
    createLazyComposerTarget(_create, state) {
      states.push(state);
      return {passes: [], addPass(pass) {this.passes.push(pass);}, setPixelRatio() {},
        setSize: (...size) => sizes.push(size), dispose() {}};
    },
  });
  const owner = Object.assign(Object.create(prototype), {mobile: {touch: true, ios: false}, q: {pixelRatio: 1},
    settings: {shadows: false}, scene: {}, camera: {},
    renderer: {setPixelRatio() {}, setSize: (...size) => sizes.push(size), shadowMap: {}},
  });
  for(const pr of [1,.75,.45]){
    owner.q.pixelRatio=pr;
    owner._buildComposer();
    const state=states.at(-1);
    assert.deepEqual([state.width,state.height],[Math.ceil(1/pr),Math.ceil(1/pr)]);
    assert.ok([state.width,state.height].every(value=>Math.floor(value*pr)>=1));
    assert.ok(sizes.every(size => size.every(value => value >= 1)));
    assert.equal(owner.grade.uniforms.uAspect.value, 1);
  }
});

test('packed composer replacement preserves ownership of both external screen passes', () => {
  const proto = methods();
  let oldDisposed = 0, newDisposed = 0, ownedDisposed = 0, nativeDisposed = 0;
  const previous = { dispose() { oldDisposed++; } }, next = { dispose() { newDisposed++; } };
  const grade = { dispose() { ownedDisposed++; } };
  const owner = Object.assign(Object.create(proto), {
    scene: {}, grade, extraPass: previous, _composerUsesPackedTarget: true,
    composer: { passes: [grade, previous], dispose() { nativeDisposed++; }, insertPass() {}, removePass() {} },
    _buildComposer(...args) { proto._disposeComposer.apply(this, args); },
  });
  owner.setExtraPass(next);
  assert.equal(oldDisposed, 0, 'old ScreenFX remains owned by its creator');
  assert.equal(newDisposed, 0, 'new ScreenFX remains owned by its creator');
  assert.equal(ownedDisposed, 1);
  assert.equal(nativeDisposed, 1);
  assert.equal(owner.extraPass, next);
  previous.dispose();
  assert.equal(oldDisposed, 1, 'external owner can retire its pass exactly once');
});
