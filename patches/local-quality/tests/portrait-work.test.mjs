import test from 'node:test';
import assert from 'node:assert/strict';
import { installPortraitWork } from '../portrait-work.mjs';
import { clearPortraitCache } from '../resource-budget.mjs';
import { resourceFixture } from './resource-fixture.mjs';

let nativeApi;
let nativeIdle;
const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) });
test.before(async () => {
  nativeApi = await resourceFixture({ globals: {
    document: { createElement: canvas },
    requestIdleCallback: (callback) => nativeIdle.request(callback),
    cancelIdleCallback: (id) => nativeIdle?.cancel(id),
  } });
});

test('cold portrait jobs reuse one character, stage 14 updates outside render callbacks and keep distinct requests', async () => {
  const pending = [];
  let taskId = 0;
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  const oldCancelIdleCallback = globalThis.cancelIdleCallback;
  globalThis.requestIdleCallback = (callback) => { const task = { id: ++taskId, callback }; pending.push(task); return task.id; };
  globalThis.cancelIdleCallback = (id) => { const index = pending.findIndex((task) => task.id === id); if (index >= 0) pending.splice(index, 1); };
  try {
    const requests = [
      { kind: 'bust', size: 176, style: { hair: 0, skin: 1, outfit: 2, eyes: 3, hat: 0, brows: 1 }, color: '#ed4e86', weapon: 'shooter' },
      { kind: 'face', size: 176, style: { hair: 3, skin: 5, outfit: 7, eyes: 2, hat: 1, brows: 2 }, color: '#25b99c', weapon: 'roller' },
      { kind: 'body', size: 224, style: { hair: 6, skin: 8, outfit: 9, eyes: 6, hat: 3, brows: 3 }, color: '#6289f2', weapon: 'charger' },
    ];
    const calls = { constructed: 1, animations: 0, requests: [], updates: [], rendered: [], callbacks: [] };
    const pool = {
      resetPortraitForRequest(request) { calls.requests.push(request); },
      update(dt, animation) { calls.updates.push({ dt, time: animation.time, inRender: calls.inRender }); },
    };
    class Showcase {
      _anim() { calls.animations++; return { time: 0 }; }
      _renderPortrait(req) { return this._renderPortraitRun(req); }
      _renderPortraitRun(req) {
        assert.equal(this._portraitActiveCharacter, pool);
        calls.rendered.push(req);
        return Promise.resolve({ width: req.size, height: req.size, source: req.kind });
      }
    }
    installPortraitWork(Showcase, { game: { mobile: { touch: false } } }, (canvas) => ({ ...canvas, copied: true }), new Set(['locker']));
    const sc = Object.assign(Object.create(Showcase.prototype), {
      mode: 'locker', _out: 0, _warmState: 'done', _pflight: 0, _pq: [], _pcache: new Map(), _portraitCacheEpoch: 0,
      _portraitCharacter: pool,
    });
    const drain = async () => {
      while (pending.length) {
        const task = pending.shift();
        task.callback({ didTimeout: false, timeRemaining: () => 5 });
      }
      await Promise.resolve();
      await Promise.resolve();
    };
    for (const request of requests) {
      const delivered = new Promise((resolve) => sc._pq.push({ key: request.kind, req: request, cbs: [(canvas) => resolve(canvas)] }));
      calls.inRender = true;
      sc._portraitStep();
      calls.inRender = false;
      assert.equal(calls.updates.length, (requests.indexOf(request)) * 14, 'render callback only schedules the first idle stage');
      await drain();
      const image = await delivered;
      assert.equal(image.source, request.kind);
      assert.equal(image.copied, true, 'the callback receives its own canvas copy');
      if (request !== requests.at(-1)) sc._portraitStep();
    }
    assert.equal(calls.constructed, 1, 'the warmed character is reused across unique cold keys');
    assert.equal(calls.animations, 3, 'each request keeps one native animation-state object for all 14 steps');
    assert.deepEqual(calls.requests, requests, 'full style, color, weapon and crop inputs reach the pool');
    assert.deepEqual(calls.rendered, requests);
    assert.equal(calls.updates.length, 42);
    assert.ok(calls.updates.every((update) => !update.inRender && update.dt === 1 / 30));
    assert.deepEqual(calls.updates.slice(0, 14).map((update) => update.time), Array.from({ length: 14 }, (_, i) => i / 30));
    assert.equal(sc._pcache.size, 3);
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
    if (oldCancelIdleCallback === undefined) delete globalThis.cancelIdleCallback; else globalThis.cancelIdleCallback = oldCancelIdleCallback;
  }
});

test('cancellation before staged work keeps the native no-waiter skip behavior', () => {
  const pending = [];
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (callback) => { pending.push(callback); return pending.length; };
  try {
    const pool = { resetPortraitForRequest() { assert.fail('canceled job must be skipped'); }, update() { assert.fail('canceled job must be skipped'); } };
    class Showcase { _anim() { return {}; } _renderPortrait() { assert.fail('canceled job must be skipped'); } _renderPortraitRun() {} }
    installPortraitWork(Showcase, { game: { mobile: { touch: false } } }, (canvas) => canvas, new Set(['locker']));
    const sc = Object.assign(Object.create(Showcase.prototype), { mode: 'locker', _warmState: 'done', _pq: [], _pcache: new Map(), _portraitCharacter: pool });
    sc._pq.push({ key: 'canceled', req: {}, cbs: [] });
    sc._portraitStep();
    assert.equal(pending.length, 0);
    assert.equal(sc._portraitJob, null);
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
  }
});

test('canceling an active idle stage stops its next step and dispose retires the pool', () => {
  const pending = [];
  let taskId = 0;
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  const oldCancelIdleCallback = globalThis.cancelIdleCallback;
  globalThis.requestIdleCallback = (callback) => { const task = { id: ++taskId, callback }; pending.push(task); return task.id; };
  globalThis.cancelIdleCallback = (id) => { const index = pending.findIndex((task) => task.id === id); if (index >= 0) pending.splice(index, 1); };
  try {
    const calls = { reset: 0, update: 0, poolDispose: 0, nativeDispose: 0 };
    const pool = {
      root: {},
      resetPortraitForRequest() { calls.reset++; },
      update() { calls.update++; },
      dispose() { calls.poolDispose++; },
    };
    class Showcase {
      _anim() { return { time: 0 }; }
      _renderPortraitRun() { assert.fail('canceled portrait must not render'); }
      dispose() { calls.nativeDispose++; }
    }
    installPortraitWork(Showcase, { game: { mobile: { touch: false } } }, (canvas) => canvas, new Set(['locker']));
    const canceled = { key: 'cancel', req: {}, cbs: [() => assert.fail('canceled callback must not fire')] };
    const sc = Object.assign(Object.create(Showcase.prototype), {
      mode: 'locker', _warmState: 'done', _pq: [canceled], _pcache: new Map(), _portraitCharacter: pool,
      scene: { remove() {} },
    });
    sc._portraitStep();
    canceled.cbs.length = 0;
    pending.shift().callback({ didTimeout: false, timeRemaining: () => 5 });
    assert.equal(sc._portraitJob, null);
    assert.equal(calls.reset, 0); assert.equal(calls.update, 0);

    sc._pq.push({ key: 'dispose', req: {}, cbs: [() => assert.fail('disposed callback must not fire')] });
    sc._portraitStep(); assert.equal(pending.length, 1);
    pending.shift().callback({ didTimeout: false, timeRemaining: () => 5 });
    assert.equal(calls.reset, 1);
    assert.equal(sc._portraitPreparedCharacter, pool);
    assert.equal(pending.length, 1, 'the first pose stage is queued after preparation');
    sc.dispose();
    assert.equal(pending.length, 0, 'dispose cancels queued idle work');
    assert.equal(calls.poolDispose, 1); assert.equal(calls.nativeDispose, 1);
    assert.equal(sc._portraitCharacter, null);
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._portraitPreparedCharacter, null);
    assert.equal(sc._portraitActiveCharacter, null);
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
    if (oldCancelIdleCallback === undefined) delete globalThis.cancelIdleCallback; else globalThis.cancelIdleCallback = oldCancelIdleCallback;
  }
});

test('native composed Character keeps style snapshots in weak keys across repeated rig refreshes', () => {
  const { Character } = nativeApi;
  const styles = [
    { hair: 0, skin: 1, outfit: 2, eyes: 3, hat: 0, brows: 1 },
    { hair: 3, skin: 5, outfit: 7, eyes: 2, hat: 1, brows: 2 },
  ];
  const character = new Character({ name: 'portrait weak-key retention', weapon: 'shooter', style: styles[0] });
  try {
    character.preparePortraitReuse();
    assert.equal(Object.prototype.toString.call(character._portraitObjects), '[object WeakMap]', 'detached mesh keys cannot be strongly enumerated or retained by the snapshot cache');
    for (let i = 0; i < 40; i++) {
      const style = styles[i % styles.length];
      character.root.position.x = 100 + i;
      character.resetPortraitForRequest({ kind: 'bust', style, color: '#ed4e86', weapon: 'shooter' });
      assert.equal(character.root.position.x, 0, 'root transform snapshots still restore after style changes');
      const mesh = character.lodSets.flatMap((set) => set?.list || [])[0];
      assert.ok(mesh, 'the native rig has an active style mesh');
      const savedPosition = mesh.position.toArray();
      mesh.position.x += 17;
      character.resetPortraitForRequest({ kind: 'bust', style, color: '#ed4e86', weapon: 'shooter' });
      assert.deepEqual(mesh.position.toArray(), savedPosition, 'weak-key lookup restores snapshots for live meshes');
    }
  } finally {
    character.dispose();
  }
});

test('native Showcase requeues staged portraits across Results at prepare, pose, and pre-render boundaries', async () => {
  const { Showcase, THREE, G } = nativeApi;
  const pending = new Map();
  let taskId = 0;
  nativeIdle = {
    request(callback) { const id = ++taskId; pending.set(id, callback); return id; },
    cancel(id) { pending.delete(id); },
  };
  const oldGame = G.game;
  G.game = { mobile: { touch: false } };
  const calls = { reset: 0, update: 0, render: 0 };
  const pool = {
    root: {},
    resetPortraitForRequest() { calls.reset++; },
    update() { calls.update++; },
  };
  const sc = Object.assign(Object.create(Showcase.prototype), {
    mode: 'locker', _out: 0, _lastMode: null, _warmState: 'done', _pflight: 2,
    _pq: [], _pcache: new Map(), _portraitCacheEpoch: 0, _portraitCharacter: pool,
    _portraitJob: null, _portraitTask: null,
    _c2: new THREE.Color(), color: new THREE.Color('orange'),
  });
  const source = { width: 96, height: 96 };
  sc._anim = () => ({ time: 0 });
  sc._renderPortrait = function renderPortrait() {
    assert.equal(this._portraitActiveCharacter, pool);
    calls.render++;
    return Promise.resolve(source);
  };
  const fire = () => {
    const next = pending.entries().next().value;
    assert.ok(next, 'one idle stage should be pending');
    pending.delete(next[0]);
    next[1]({ didTimeout: false, timeRemaining: () => 5 });
  };
  try {
    let delivered;
    sc.portrait({ kind: 'bust', size: 96, color: '#ed4e86', style: { hair: 0 } }, (image) => { delivered = image; });
    sc._portraitStep();
    assert.equal(pending.size, 0, 'the native two-flight ceiling keeps new work queued');
    assert.equal(sc._portraitJob, null);
    sc._pflight = 0;
    sc._portraitStep();
    const job = sc._portraitJob;
    assert.ok(job);
    assert.equal(job._portraitCacheEpoch, 0);

    sc.mode = 'results';
    fire();
    assert.equal(calls.reset, 0, 'Results entered before preparation prevents the stage from running');
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._pq[0], job, 'the pending job remains queued for the next safe mode');
    assert.equal(pending.size, 0, 'pausing in Results does not schedule another idle callback');
    sc._portraitStep();
    assert.equal(pending.size, 0, 'native frame attempts in Results stay unscheduled');
    clearPortraitCache(sc);
    assert.equal(sc._portraitCacheEpoch, 1);

    sc.mode = 'locker';
    sc._portraitStep(); fire();
    assert.equal(calls.reset, 1);
    fire(); fire();
    assert.equal(calls.update, 2);
    sc.mode = null; sc._out = 0.1; sc._lastMode = 'results';
    fire();
    assert.equal(calls.update, 2, 'an outgoing-Results pose callback rechecks the native protected-mode condition before updating');
    assert.equal(sc._pq[0], job);
    assert.equal(pending.size, 0);
    sc._portraitStep();
    assert.equal(pending.size, 0, 'the outgoing-Results mode also does not reschedule idle work');

    sc.mode = 'locker'; sc._out = 0; sc._lastMode = null;
    sc._portraitStep(); fire();
    for (let i = 0; i < 14; i++) fire();
    assert.equal(calls.update, 16, 'safe resumption prepares again and completes all fourteen native pose steps');
    sc.mode = 'results';
    fire();
    assert.equal(calls.render, 0, 'the render submission is checked again after the pose stages');
    assert.equal(sc._pq[0], job);
    assert.equal(pending.size, 0);
    assert.equal(sc._portraitPreparedCharacter, null);
    assert.equal(sc._portraitActiveCharacter, null);
    sc._portraitStep();
    assert.equal(pending.size, 0);

    sc.mode = 'locker';
    sc._portraitStep(); fire();
    for (let i = 0; i < 14; i++) fire();
    fire();
    assert.equal(calls.render, 1);
    assert.equal(sc._portraitJob, null, 'render submission releases the staging slot');
    assert.equal(sc._pflight, 1, 'the pending readback still consumes one of the two flight slots');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(delivered.width, 96, 'callbacks still receive a copied readback');
    assert.equal(source.width, 0, 'the expired epoch releases the uncached source after callback delivery');
    assert.equal(sc._pcache.size, 0, 'a paused job cannot repopulate an expired cache epoch');
    assert.equal(sc._pflight, 0);
  } finally {
    G.game = oldGame;
    nativeIdle = null;
  }
});

test('staged update and render errors clear prepared and active Character references', () => {
  const pending = [];
  let taskId = 0;
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  const oldCancelIdleCallback = globalThis.cancelIdleCallback;
  const oldError = console.error;
  globalThis.requestIdleCallback = (callback) => { const task = { id: ++taskId, callback }; pending.push(task); return task.id; };
  globalThis.cancelIdleCallback = (id) => { const index = pending.findIndex((task) => task.id === id); if (index >= 0) pending.splice(index, 1); };
  console.error = () => {};
  try {
    const exercise = (failureAt) => {
      const pool = {
        root: {},
        resetPortraitForRequest() {},
        update() { if (failureAt === 'update') throw new Error('update failed'); },
      };
      class Showcase {
        _anim() { return { time: 0 }; }
        _renderPortrait() { if (failureAt === 'render') throw new Error('render failed'); return null; }
        _renderPortraitRun() {}
      }
      installPortraitWork(Showcase, { game: { mobile: { touch: false } } }, (image) => image, new Set(['locker']));
      let delivered = 'pending';
      const job = { key: failureAt, req: {}, cbs: [(image) => { delivered = image; }] };
      const sc = Object.assign(Object.create(Showcase.prototype), {
        mode: 'locker', _out: 0, _warmState: 'done', _pq: [job], _pcache: new Map(),
        _portraitCacheEpoch: 0, _portraitCharacter: pool,
      });
      sc._portraitStep();
      while (pending.length) pending.shift().callback({ didTimeout: false, timeRemaining: () => 5 });
      assert.equal(delivered, null);
      assert.equal(sc._portraitJob, null);
      assert.equal(sc._portraitPreparedCharacter, null);
      assert.equal(sc._portraitActiveCharacter, null);
    };
    exercise('update');
    exercise('render');
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
    if (oldCancelIdleCallback === undefined) delete globalThis.cancelIdleCallback; else globalThis.cancelIdleCallback = oldCancelIdleCallback;
    console.error = oldError;
  }
});

test('late staged readback delivers the callback but cannot refill an expired cache epoch', async () => {
  const pending = [];
  let taskId = 0, resolveRead;
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (callback) => { const task = { id: ++taskId, callback }; pending.push(task); return task.id; };
  try {
    const pool = { root: {}, resetPortraitForRequest() {}, update() {} };
    class Showcase {
      _anim() { return { time: 0 }; }
      _renderPortrait() { return this._renderPortraitRun(this._portraitJob.req); }
      _renderPortraitRun() { return new Promise((resolve) => { resolveRead = resolve; }); }
    }
    installPortraitWork(Showcase, { game: { mobile: { touch: false } } }, (canvas) => ({ ...canvas, copied: true }), new Set(['locker']));
    const sc = Object.assign(Object.create(Showcase.prototype), {
      mode: 'locker', _warmState: 'done', _pq: [{ key: 'late', req: { size: 128 }, cbs: [] }],
      _pcache: new Map(), _portraitCacheEpoch: 0, _portraitCharacter: pool,
    });
    let delivered = null;
    sc._pq[0].cbs.push((canvas) => { delivered = canvas; });
    sc._portraitStep();
    while (pending.length) pending.shift().callback({ didTimeout: false, timeRemaining: () => 5 });
    const source = { width: 128, height: 128 };
    sc._portraitCacheEpoch = 1;
    resolveRead(source);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(delivered.width, 128);
    assert.equal(delivered.copied, true);
    assert.equal(sc._pcache.size, 0, 'the stale epoch cannot repopulate the cache');
    assert.equal(source.width, 0, 'uncached readback storage is released');
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
  }
});
