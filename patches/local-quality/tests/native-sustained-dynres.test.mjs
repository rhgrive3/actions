import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {dynamicResolutionBudget} from '../range-frame-pacing.mjs';
import {installDebugAB} from '../debug-ab-runtime.mjs';
import {installGame, installClock} from '../../splatoon3/runtime/clock.mjs';

// Execute the actual fully composed production method, including the earlier
// offline-pause guard. The control removes only this change's sample admission.
const main = adaptBuildSource('src/main.js', fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8'));
const start = main.indexOf('  _dynRes(dt) {');
const end = main.indexOf('\n  _frame(dt) {', start);
assert.ok(start >= 0 && end > start);
const method = main.slice(start, end);
const control = method.replace(/    \/\/ Native overload admission:[\s\S]*?    \/\/ End native overload admission\./,
  '    if (dt <= 0 || dt > 0.25) return;');
assert.notEqual(control, method);

function fixture({before = false, native = true, touch = true, quality = 'high'} = {}) {
  const document = {hidden: false};
  const G = {level: {native}, netm: null};
  const run = vm.runInNewContext(`({${before ? control : method}})._dynRes`, {G, document, dynamicResolutionBudget});
  const transitions = [];
  const game = {settings: {quality, frameRate: 'display'}, mobile: {touch}, match: {state: 'playing', attract: false, paused: false},
    R: {dynScale: 1, setDynamicScale(value) {transitions.push(value); this.dynScale = value;}}, _dynRes: run};
  return {game, G, document, transitions, tick(dt, count = 1) {for (let i = 0; i < count; i++) game._dynRes(dt);}};
}

test('sustained 300ms native frames reach the existing controller; old guard stays blind', () => {
  const old = fixture({before: true}), next = fixture();
  old.tick(.3, 40); next.tick(.3, 40);
  assert.deepEqual(old.transitions, []);
  assert.equal(next.transitions[0], .875);
  assert.ok(next.transitions.includes(1), 'CPU-bound/no-gain trial must still restore quality');
});

test('three long frames, isolated hitches and nonfinite samples never create a reduction', () => {
  const f = fixture();
  for (let round = 0; round < 8; round++) {
    f.tick(.3, 3); f.tick(1 / 60); f.tick(60); f.tick(NaN); f.tick(Infinity); f.tick(0); f.tick(-1);
  }
  assert.deepEqual(f.transitions, []);
  assert.equal(f.game._nativeSlowFrames, null);
  assert.ok(Number.isFinite(f.game._dyn.acc));
});

test('huge repeated stalls contribute at most one second per admitted diagnostic sample', () => {
  const f = fixture();
  f.tick(60, 3);
  assert.equal(f.game._dyn, undefined);
  f.tick(60);
  assert.equal(f.game._dyn.acc, 1);
  assert.equal(f.game._dyn.t, 1);
  assert.equal(f.game._dyn.n, 1);
  assert.deepEqual(f.transitions, []);
});

test('match, stage and quality changes break the consecutive-long-frame streak', () => {
  for (const change of [f => {f.game.match = {...f.game.match};}, f => {f.G.level = {native: true};}, f => {f.game.settings.quality = 'medium';}]) {
    const f = fixture(); f.tick(.3, 3); change(f); f.tick(.3);
    assert.equal(f.game._nativeSlowFrames.count, 1);
    assert.equal(f.game._dyn, undefined);
  }
});

test('hidden, paused, attract, menu, nonnative and ultra states reject slow admission', () => {
  for (const change of [f => {f.document.hidden = true;}, f => {f.game.match.paused = true;},
    f => {f.game.match.attract = true;}, f => {f.game.match.state = 'intro';},
    f => {f.G.level.native = false;}, f => {f.game.settings.quality = 'ultra';}]) {
    const f = fixture(); f.tick(.3, 3); change(f); f.tick(.3, 40);
    assert.deepEqual(f.transitions, []);
    assert.equal(f.game._nativeSlowFrames, null);
  }
});

test('ordinary frame intervals retain exact controller transitions and state', () => {
  const a = fixture({before: true}), b = fixture();
  for (const dt of [1 / 60, 1 / 30, 1 / 48, 1 / 60, 1 / 120, .25, 1 / 60]) {
    a.tick(dt, 360); b.tick(dt, 360);
    assert.deepEqual(b.transitions, a.transitions);
    assert.equal(JSON.stringify(b.game._dyn), JSON.stringify(a.game._dyn));
  }
});

test('productive slow-frame trials retain the existing mobile/desktop floors', () => {
  for (const touch of [false, true]) {
    const f = fixture({touch});
    for (let i = 0; i < 300; i++) f.tick(.5 * f.game.R.dynScale ** 2);
    assert.ok(f.transitions.some(v => v < 1));
    assert.ok(f.transitions.every(v => v >= (touch ? .6 : .75)));
  }
});

test('manual on-device resolution diagnostics still own and restore scale', () => {
  const f = fixture(), original = f.game._dynRes;
  f.tick(.3, 3);
  const diagnostic = installDebugAB({probe: {}, tracer: {lastFrameMetrics() {return null;}}, game: f.game,
    env: {__G: f.G, document: f.document}});
  assert.equal(diagnostic.setResolution('high'), true);
  assert.equal(f.game._nativeSlowFrames, null);
  f.tick(.3, 80);
  assert.deepEqual(f.transitions, [1]);
  assert.equal(diagnostic.setResolution('auto'), true);
  assert.equal(f.game._dynRes, original);
  f.tick(.3, 3);
  assert.equal(f.game._dyn, undefined, 'the diagnostic interval cannot complete a stale streak');
  f.tick(.3, 15);
  assert.ok(f.transitions.includes(.875));
  diagnostic.dispose();
});

test('real hidden/recovery loop clears streak even while dynamic resolution is suspended', () => {
  const oldDocument = globalThis.document, oldRAF = globalThis.requestAnimationFrame;
  let visibility;
  globalThis.document = {hidden: false, addEventListener(name, callback) {if (name === 'visibilitychange') visibility = callback;}};
  globalThis.requestAnimationFrame = () => {};
  try {
    class Game { _loop() {throw Error('hidden loop must not run');} }
    installGame(Game);
    const game = new Game(); let resets = 0;
    installClock({G: {game}});
    game._nativeSlowFrames = {count: 3};
    game.timer = {update() {}}; game.s3Clock = {reset() {resets++;}};
    globalThis.document.hidden = true;
    visibility();
    assert.equal(game._nativeSlowFrames, null, 'visibility edge resets without waiting for another RAF');
    game._nativeSlowFrames = {count: 3};
    game._loop();
    assert.equal(game._nativeSlowFrames, null);
    assert.equal(resets, 1);
  } finally {
    globalThis.document = oldDocument; globalThis.requestAnimationFrame = oldRAF;
  }
});
