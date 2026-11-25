import test from 'node:test';
import assert from 'node:assert/strict';
import { installPortraitWork, liveMatchPortraitProtected } from '../portrait-work.mjs';

function withIdleHarness(fn) {
  const pending = new Map();
  let nextId = 0;
  const canceled = [];
  const oldRequestIdleCallback = globalThis.requestIdleCallback;
  const oldCancelIdleCallback = globalThis.cancelIdleCallback;
  globalThis.requestIdleCallback = (callback) => {
    const id = ++nextId;
    pending.set(id, callback);
    return id;
  };
  globalThis.cancelIdleCallback = (id) => {
    canceled.push(id);
    pending.delete(id);
  };
  const fire = () => {
    const next = pending.entries().next().value;
    assert.ok(next, 'expected a pending idle callback');
    pending.delete(next[0]);
    next[1]({ didTimeout: false, timeRemaining: () => 5 });
  };
  const drain = async () => {
    while (pending.size) fire();
    await Promise.resolve();
    await Promise.resolve();
  };
  return Promise.resolve()
    .then(() => fn({ pending, canceled, fire, drain }))
    .finally(() => {
      if (oldRequestIdleCallback === undefined) delete globalThis.requestIdleCallback;
      else globalThis.requestIdleCallback = oldRequestIdleCallback;
      if (oldCancelIdleCallback === undefined) delete globalThis.cancelIdleCallback;
      else globalThis.cancelIdleCallback = oldCancelIdleCallback;
    });
}

function createHarness(G, { includeRender = true, includeHide = true } = {}) {
  const calls = {
    nativeStep: 0,
    nativeRender: 0,
    nativeHide: 0,
    releaseTargets: 0,
    reset: 0,
    update: 0,
    renderPortrait: 0,
  };
  const pool = {
    root: {},
    resetPortraitForRequest() { calls.reset++; },
    update() { calls.update++; },
  };
  class Showcase {
    _anim() { return { time: 0 }; }
    _portraitStep() { calls.nativeStep++; }
    _renderPortrait(req) { return this._renderPortraitRun(req); }
    _renderPortraitRun(req) {
      calls.renderPortrait++;
      return Promise.resolve({ width: req.size || 96, height: req.size || 96, key: req.kind || 'bust' });
    }
    _releasePortraitTargets(final = false) {
      calls.releaseTargets++;
      this._portraitReleasePending = false;
      return true;
    }
    dispose() {}
  }
  if (includeRender) {
    Showcase.prototype.render = function render() {
      calls.nativeRender++;
      if (this._pq.length) this._portraitStep();
    };
  }
  if (includeHide) {
    Showcase.prototype.hide = function hide() {
      calls.nativeHide++;
      this.mode = null;
      this._releasePortraitTargets(false);
      return 'hidden';
    };
  }
  installPortraitWork(Showcase, G, (canvas) => ({ ...canvas, copied: true }), new Set(['locker', 'lobby']));
  const sc = Object.assign(Object.create(Showcase.prototype), {
    mode: 'locker',
    _out: 0,
    _lastMode: null,
    _warmState: 'done',
    _pflight: 0,
    _pq: [],
    _pcache: new Map(),
    _portraitCacheEpoch: 0,
    _portraitReleasePending: false,
    _portraitCharacter: pool,
    _portraitJob: null,
    _portraitTask: null,
  });
  return { Showcase, sc, pool, calls };
}

test('liveMatchPortraitProtected covers all match states, pause states, attract, menu, null match, and minimal G', () => {
  for (const state of ['init', 'intro', 'playing', 'finish', 'judge']) {
    assert.equal(
      liveMatchPortraitProtected({ mode: 'match', match: { state, attract: false, paused: false } }),
      true,
      `live match state "${state}" (unpaused) must be protected`,
    );
    assert.equal(
      liveMatchPortraitProtected({ mode: 'match', match: { state, attract: false, paused: true } }),
      true,
      `live match state "${state}" (paused) must be protected`,
    );
  }
  assert.equal(
    liveMatchPortraitProtected({ mode: 'match', match: { state: 'results', attract: false, paused: false } }),
    false,
    'results state is not live-match protected (handled separately by showcase results protection)',
  );
  assert.equal(
    liveMatchPortraitProtected({ mode: 'match', match: { state: 'playing', attract: true, paused: false } }),
    false,
    'attract mode must not be live-match protected',
  );
  assert.equal(
    liveMatchPortraitProtected({ mode: 'menu', match: { state: 'playing', attract: false, paused: false } }),
    false,
    'menu mode must not be live-match protected',
  );
  assert.equal(
    liveMatchPortraitProtected({ mode: 'match', match: null }),
    false,
    'null match must not be protected',
  );
  assert.equal(
    liveMatchPortraitProtected({ game: { mobile: { touch: false } } }),
    false,
    'minimal mock G must not be protected',
  );
  assert.equal(liveMatchPortraitProtected(null), false);
  assert.equal(liveMatchPortraitProtected(undefined), false);
});

test('installPortraitWork is idempotent per Showcase class and compatible with minimal mocks without render/hide', async () => {
  await withIdleHarness(async ({ drain }) => {
    const G = { game: { mobile: { touch: false } } };
    const { Showcase, sc, calls } = createHarness(G, { includeRender: false, includeHide: false });
    assert.equal(Showcase.prototype.render, undefined, 'render stays undefined on minimal mock');
    assert.equal(Showcase.prototype.hide, undefined, 'hide stays undefined on minimal mock');

    const stepBefore = Showcase.prototype._portraitStep;
    const disposeBefore = Showcase.prototype.dispose;
    const releaseBefore = Showcase.prototype._releasePortraitTargets;
    installPortraitWork(Showcase, G, (c) => c, new Set(['locker']));
    assert.equal(Showcase.prototype._portraitStep, stepBefore, 'second installPortraitWork call is a no-op');
    assert.equal(Showcase.prototype.dispose, disposeBefore);
    assert.equal(Showcase.prototype._releasePortraitTargets, releaseBefore);

    let delivered = null;
    sc._pq.push({ key: 'k1', req: { kind: 'bust', size: 96 }, cbs: [(cv) => { delivered = cv; }] });
    sc._portraitStep();
    await drain();
    assert.equal(calls.renderPortrait, 1);
    assert.equal(delivered.copied, true);
  });
});

test('unwarmed showcase blocks nativePortraitStep during live match and resumes on menu return', () => {
  const G = { mode: 'match', match: { state: 'playing', attract: false, paused: false }, game: { mobile: { touch: false } } };
  const { sc, calls } = createHarness(G);
  sc._portraitCharacter = null;
  sc._pq.push({ key: 'unwarmed', req: { kind: 'bust' }, cbs: [() => {}] });

  sc._portraitStep();
  assert.equal(calls.nativeStep, 0, 'nativePortraitStep must not run during live match when unwarmed');

  G.match.paused = true;
  sc._portraitStep();
  assert.equal(calls.nativeStep, 0, 'nativePortraitStep must not run while paused during live match');

  G.mode = 'menu';
  G.match = null;
  sc._portraitStep();
  assert.equal(calls.nativeStep, 1, 'nativePortraitStep runs once returned to menu');
});

test('warmed showcase defers staged portrait during live match (including paused) and completes after menu return', async () => {
  await withIdleHarness(async ({ pending, drain }) => {
    const G = { mode: 'match', match: { state: 'intro', attract: false, paused: false }, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    let delivered = null;
    sc._pq.push({ key: 'warmed', req: { kind: 'face', size: 128 }, cbs: [(cv) => { delivered = cv; }] });

    sc._portraitStep();
    assert.equal(pending.size, 0);
    assert.equal(calls.reset, 0);
    assert.equal(calls.renderPortrait, 0);

    G.match.state = 'playing';
    G.match.paused = true;
    sc.render();
    assert.equal(pending.size, 0);
    assert.equal(calls.renderPortrait, 0);

    G.mode = 'menu';
    G.match = null;
    sc.mode = 'locker';
    sc.render();
    assert.equal(pending.size, 1);
    await drain();
    assert.equal(calls.reset, 1);
    assert.equal(calls.update, 14);
    assert.equal(calls.renderPortrait, 1);
    assert.equal(delivered.width, 128);
    assert.equal(delivered.copied, true);
  });
});

test('single/last queued job (_pq.length === 0) waiting on _portraitTask is immediately canceled and requeued on first render() after hide() -> G.mode = match', async () => {
  await withIdleHarness(async ({ pending, canceled, fire, drain }) => {
    const G = { mode: 'menu', match: null, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    let delivered = null;
    const job = { key: 'last-job', req: { kind: 'body', size: 160 }, cbs: [(cv) => { delivered = cv; }] };
    sc._pq.push(job);

    // Stage the only job -> _pq becomes empty while _portraitTask is pending.
    sc._portraitStep();
    assert.equal(sc._pq.length, 0);
    assert.equal(sc._portraitJob, job);
    assert.equal(pending.size, 1);
    const taskId = sc._portraitTask.id;

    // Advance through prepare + 2 pose steps to ensure pointers are active too.
    fire();
    fire();
    fire();
    assert.equal(calls.reset, 1);
    assert.equal(calls.update, 2);
    assert.equal(sc._pq.length, 0);
    assert.equal(pending.size, 1);
    const pendingTaskId = sc._portraitTask.id;
    assert.notEqual(pendingTaskId, taskId);

    // Real main.js sequence: hide() BEFORE G.mode = 'match', then render() on first match frame.
    const hideResult = sc.hide();
    assert.equal(hideResult, 'hidden');
    assert.equal(calls.nativeHide, 1);
    assert.equal(pending.size, 1, 'hide() before G.mode = match keeps task until match is entered');

    G.match = { state: 'init', attract: false, paused: false };
    G.mode = 'match';
    sc.render();

    assert.ok(canceled.includes(pendingTaskId), 'first render() in live match immediately cancels pending idle task');
    assert.equal(pending.size, 0);
    assert.equal(sc._portraitTask, null);
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._portraitPreparedCharacter, null);
    assert.equal(sc._portraitActiveCharacter, null);
    assert.deepEqual(sc._pq, [job], 'suspended job is requeued at the front of _pq');
    assert.equal(calls.renderPortrait, 0);
    assert.equal(calls.nativeStep, 0);

    // Stay paused/playing across frames -> no portrait work runs.
    G.match.state = 'playing';
    G.match.paused = true;
    sc.render();
    assert.equal(pending.size, 0);
    assert.equal(calls.renderPortrait, 0);

    // Return to menu -> queued job completes cleanly.
    G.mode = 'menu';
    G.match = null;
    sc.mode = 'locker';
    sc.render();
    await drain();
    assert.equal(calls.renderPortrait, 1);
    assert.equal(delivered.width, 160);
    assert.equal(delivered.copied, true);
  });
});

test('defensive hide() hook cancels pending _portraitTask when already in protected live match state', async () => {
  await withIdleHarness(async ({ pending, canceled }) => {
    const G = { mode: 'menu', match: null, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    const job = { key: 'hide-guard', req: { kind: 'bust' }, cbs: [() => {}] };
    sc._pq.push(job);
    sc._portraitStep();
    assert.equal(pending.size, 1);
    const pendingTaskId = sc._portraitTask.id;

    // Enter protected state first, then call hide().
    G.mode = 'match';
    G.match = { state: 'playing', attract: false, paused: false };
    const res = sc.hide();
    assert.equal(res, 'hidden');
    assert.equal(calls.nativeHide, 1);
    assert.ok(canceled.includes(pendingTaskId), 'hide() defensively cancels idle task when already protected');
    assert.equal(pending.size, 0);
    assert.equal(sc._portraitTask, null);
    assert.equal(sc._portraitJob, null);
    assert.deepEqual(sc._pq, [job]);
    assert.equal(calls.renderPortrait, 0);
  });
});

test('requeuePortraitJob releases pending portrait targets when suspending a job whose callbacks were all canceled', async () => {
  await withIdleHarness(async ({ pending, canceled }) => {
    const G = { mode: 'menu', match: null, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    const job = { key: 'empty-cbs', req: { kind: 'bust' }, cbs: [() => assert.fail('canceled callback must not fire')] };
    sc._pq.push(job);
    sc._portraitStep();
    assert.equal(pending.size, 1);
    const pendingTaskId = sc._portraitTask.id;

    // Simulate hide() requesting target release while staged job is still active.
    sc.hide();
    assert.equal(sc._portraitReleasePending, true);
    assert.equal(calls.releaseTargets, 0, 'targets retained while staged job still has callbacks');

    // All waiters cancel before live match begins.
    job.cbs.length = 0;
    G.mode = 'match';
    G.match = { state: 'playing', attract: false, paused: false };
    sc.render();

    assert.ok(canceled.includes(pendingTaskId));
    assert.equal(pending.size, 0);
    assert.equal(sc._portraitTask, null);
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._pq.length, 0, 'empty-callback job is discarded rather than requeued');
    assert.equal(sc._portraitReleasePending, false);
    assert.equal(calls.releaseTargets, 1, 'releasePendingPortraitTargets fires when empty job is dropped during suspend');
  });
});

test('transition into live match right before staged render() requeues job without calling _renderPortrait and finishes on menu return', async () => {
  await withIdleHarness(async ({ pending, fire, drain }) => {
    const G = { mode: 'menu', match: null, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    let delivered = null;
    const job = { key: 'pre-render', req: { kind: 'bust', size: 112 }, cbs: [(cv) => { delivered = cv; }] };
    sc._pq.push(job);

    sc._portraitStep();
    // 1 prepare + 14 pose updates -> next pending callback is staged render().
    fire();
    for (let i = 0; i < 14; i++) fire();
    assert.equal(calls.reset, 1);
    assert.equal(calls.update, 14);
    assert.equal(calls.renderPortrait, 0);
    assert.equal(pending.size, 1);

    // Transition to live match right before the idle callback executes render().
    G.mode = 'match';
    G.match = { state: 'finish', attract: false, paused: false };
    fire();

    assert.equal(calls.renderPortrait, 0, 'pre-render boundary must not call _renderPortrait during live match');
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._portraitPreparedCharacter, null);
    assert.equal(sc._portraitActiveCharacter, null);
    assert.deepEqual(sc._pq, [job]);
    assert.equal(pending.size, 0);

    // Return to menu -> completes normally.
    G.mode = 'menu';
    G.match = null;
    sc.mode = 'locker';
    sc._portraitStep();
    await drain();
    assert.equal(calls.renderPortrait, 1);
    assert.equal(delivered.width, 112);
    assert.equal(delivered.copied, true);
  });
});

test('attract mode (match.attract === true) allows portrait generation normally', async () => {
  await withIdleHarness(async ({ drain }) => {
    const G = { mode: 'match', match: { state: 'playing', attract: true, paused: false }, game: { mobile: { touch: false } } };
    const { sc, calls } = createHarness(G);
    let delivered = null;
    sc._pq.push({ key: 'attract-ok', req: { kind: 'bust', size: 96 }, cbs: [(cv) => { delivered = cv; }] });

    sc.render();
    await drain();
    assert.equal(calls.renderPortrait, 1);
    assert.equal(delivered.width, 96);
    assert.equal(delivered.copied, true);
  });
});
