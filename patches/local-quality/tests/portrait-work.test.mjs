import test from 'node:test';
import assert from 'node:assert/strict';
import { installPortraitWork } from '../portrait-work.mjs';

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
    sc.dispose();
    assert.equal(pending.length, 0, 'dispose cancels queued idle work');
    assert.equal(calls.poolDispose, 1); assert.equal(calls.nativeDispose, 1);
    assert.equal(sc._portraitCharacter, null);
  } finally {
    if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = oldRequestIdleCallback;
    if (oldCancelIdleCallback === undefined) delete globalThis.cancelIdleCallback; else globalThis.cancelIdleCallback = oldCancelIdleCallback;
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
