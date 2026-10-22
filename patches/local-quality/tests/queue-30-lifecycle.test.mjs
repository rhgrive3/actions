import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueOutboundEvent, sendOutboundTick, outboundQueueStatus } from '../../network-replication/outbound-prefix.mjs';

const repo = new URL('../../../', import.meta.url);
const source = name => readFileSync(new URL(name, repo), 'utf8');

test('outbound idle ticks do not mutate queue or change packet shape', () => {
  const sent = [];
  const n = { out: [], match: {} };
  n.s = { tr: { broadcast(w) { sent.push(w); return true; } }, match: n };
  for (let k = 0; k < 100; k++) {
    assert.equal(sendOutboundTick(n, { tick: k }, (_, msg) => ({ ...msg })), true);
    assert.equal(n.out.length, 0);
  }
  assert.equal(sent.length, 100);
  assert.ok(sent.every(w => w.e === undefined && w.r === undefined));
  assert.equal(outboundQueueStatus(n).rows, 0);
});

test('outbound event prefix retains exact references and synchronous appended suffix', () => {
  const items = Array.from({ length: 260 }, (_, i) => ({ i }));
  const n = { out: [], match: {} };
  n.s = { tr: { broadcast() { n.out.push(items[259]); return true; } }, match: n };
  for (const event of items.slice(0, 259)) queueOutboundEvent(n, event);
  const firstOut = n.out;
  assert.equal(sendOutboundTick(n, {}, (_, msg) => ({ ...msg })), true);
  assert.equal(n.out, firstOut);
  assert.deepStrictEqual(n.out, items.slice(256));
  assert.equal(n.out[3], items[259]);
});

test('rejected outbound sends retain every event without consuming a prefix', () => {
  const n = { out: [], match: {} };
  n.s = { tr: { broadcast() { return false; } }, match: n };
  const event = { id: 1 };
  queueOutboundEvent(n, event);
  assert.equal(sendOutboundTick(n, {}, (_, msg) => ({ ...msg })), false);
  assert.deepStrictEqual(n.out, [event]);
});

test('known nav node goals cache the exact nearest result on repeated pathing', () => {
  const src = source('inkwave-public/src/game/bots.js');
  const start = src.indexOf('  _pathTo(pos, maxUp = 0.8, nodeId = -1) {');
  const end = src.indexOf('  _pickPaintGoal()', start);
  assert.ok(start >= 0 && end > start);
  const nav = {
    nodes: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 2, z: 0 }],
    valid: new Uint8Array([1, 1]), cells: [],
    nearestCalls: 0,
    nearest(pos) { this.nearestCalls++; return pos.x > 1 ? 1 : 0; },
    path(from, to) { return [from, to]; },
  };
  const G = { nav };
  const Harness = new Function('G', '_nodeGoalLookup', 'return class Harness {\n' +
    src.slice(start, end) + '\n}') (G, new WeakMap());
  const h = new Harness();
  h.a = { pos: { x: 0, y: 0, z: 0 }, team: 0 };
  for (let i = 0; i < 30; i++) {
    assert.equal(h._pathTo(nav.nodes[1], 0.3, 1), true);
    assert.deepStrictEqual(h.path, [0, 1]);
  }
  assert.equal(nav.nearestCalls, 31, 'start checked 30 times, goal only once');
  const otherValid = new Uint8Array([1, 1]);
  nav.valid = otherValid;
  h._pathTo(nav.nodes[1], 0.3, 1);
  assert.equal(nav.nearestCalls, 33, 'graph validity generation invalidates cached target');
});

test('static shadow-render exception always restores dynamic actor castShadow', () => {
  const src = source('inkwave-public/src/core/shadowcache.js');
  const start = src.indexOf('  _render(sm, lights, scene, camera) {');
  const end = src.indexOf('  _rebindTo(', start);
  assert.ok(start >= 0 && end > start);
  class FakeGL {}
  const H = new Function('WebGL2RenderingContext', 'return class H {\n' +
    src.slice(start, end) + '\n}')(FakeGL);
  const h = new H();
  const dyn = { castShadow: true, isMesh: true };
  const stat = { castShadow: true, isMesh: true };
  const scene = { traverse(fn) { fn(stat); fn(dyn); } };
  const light = {
    isDirectionalLight: true,
    position: { x: 0, y: 1, z: 0 },
    shadow: { mapSize: { x: 512 }, camera: { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 300 } },
  };
  h.renderer = { getContext() { return new FakeGL(); } };
  h._orig = { call() { assert.equal(dyn.castShadow, false); throw new Error('shadow-pass-failed'); } };
  h._collect = () => [{ o: stat }];
  h._cullActors = () => [];
  h.dirty = true;
  assert.throws(() => h._render({}, [light], scene, {}), /shadow-pass-failed/);
  assert.equal(dyn.castShadow, true);
  assert.equal(stat.castShadow, true);
});

test('cloud bake restores renderer and target-scissor state after strip draw failure', () => {
  const src = source('inkwave-public/src/world/environment.js');
  const start = src.indexOf('  _bakeClouds(T) {');
  const end = src.indexOf('  _rebuildEnvMap() {', start);
  assert.ok(start >= 0 && end > start);
  const H = new Function('lin', 'CLOUD_W', 'CLOUD_H', 'return class H {\n' +
    src.slice(start, end) + '\n}')(() => ({ ok: true }), 32, 20);
  for (const failAt of [1, 5, 10]) {
    const h = new H();
    const saved = { old: true };
    const scissor = { x: 4, y: 5, z: 6, w: 7,
      clone() { return { x: this.x, y: this.y, z: this.z, w: this.w }; },
      copy(a) { Object.assign(this, a); return this; },
      set(x, y, z, w) { Object.assign(this, { x, y, z, w }); },
    };
    const rt = h._cloudRT = { scissorTest: false, scissor };
    h._cloudMat = { uniforms: {
      uSunCol: { value: { copy() {} } }, uCov: { value: null }, uSeed: { value: null },
    } };
    h._cloudScene = {}; h._cloudCam = {};
    let drawn = 0;
    const r = h.renderer = {
      target: saved, autoClear: true, xr: { enabled: true },
      getRenderTarget() { return this.target; },
      setRenderTarget(t) { this.target = t; },
      setClearColor() {}, clear() {},
      render() { if (++drawn === failAt) throw new Error('cloud-strip-failed'); },
    };
    assert.throws(() => h._bakeClouds({ sunColor: 1, skySun: 2 }), /cloud-strip-failed/);
    assert.equal(r.target, saved);
    assert.equal(r.autoClear, true);
    assert.equal(r.xr.enabled, true);
    assert.equal(rt.scissorTest, false);
    assert.deepStrictEqual([scissor.x, scissor.y, scissor.z, scissor.w], [4, 5, 6, 7]);
  }
});


test('Turf TIME UP retires host bot and local pending weapons but not remote ghosts', () => {
  const src = source('patches/splatoon3/runtime/turf-finish.mjs');
  const start = src.indexOf('export function captureTurfFinish(');
  const end = src.indexOf('// Existing physical command channels', start);
  assert.ok(start >= 0 && end > start);
  const code = src.slice(start, end).replaceAll('export function ', 'function ');
  const { captureTurfFinish } = new Function('captureFinishMapSnapshot', code +
    '\nreturn {captureTurfFinish};')(() => {});
  const calls = [0, 0, 0];
  const actor = i => ({
    bot: i !== 0, remote: i === 2,
    intent: { move: { set() {} }, fire: true, sub: true, squid: true },
    _prevIntent: { fire: true, special: true },
    weaponRunner: { cancelPendingInput() { calls[i]++; } },
  });
  const actors = [actor(0), actor(1), actor(2)];
  const match = { state: 'playing', mode: 'turf', follower: true,
    bossMode: false, local: actors[0], actors };
  captureTurfFinish(match, 'finish', null);
  assert.deepStrictEqual(calls, [1, 1, 0]);
  assert.equal(actors[0].intent.fire, false);
  assert.equal(actors[0]._prevIntent.special, false);
});

test('catalogue pending windups are cancelled with the pre-existing weapon hook', () => {
  const src = source('patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const start = src.indexOf('  const legacyCancelPendingInput = R.cancelPendingInput;');
  const end = src.indexOf('  R.reset = ', start);
  assert.ok(start >= 0 && end > start);
  let legacyCalls = 0;
  const R = { cancelPendingInput() { legacyCalls++; return 'legacy-ok'; } };
  new Function('R', src.slice(start, end))(R);
  const runner = Object.create(R);
  runner.a = { weapon: { catalogRecord: { family: 'charger' } } };
  runner.catalogState = { pending: { fire: true }, birthEpoch: 8 };
  assert.equal(runner.cancelPendingInput(), 'legacy-ok');
  assert.equal(legacyCalls, 1);
  assert.equal(runner.catalogState.pending, null);
  assert.equal(runner.catalogState.birthEpoch, 9);
  runner.cancelPendingInput();
  assert.equal(runner.catalogState.birthEpoch, 9, 'duplicate TIME UP cannot repeat the cancellation epoch');
  runner.a.weapon.catalogRecord = null;
  runner.catalogState.pending = { fire: true };
  runner.cancelPendingInput();
  assert.ok(runner.catalogState.pending, 'non-catalogue weapons keep their own cancellation contract');
});
