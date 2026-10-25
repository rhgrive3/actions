import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceFixture } from './resource-fixture.mjs';

let api, idle;
test.before(async () => {
  api = await resourceFixture({ globals: {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) },
    requestIdleCallback: callback => idle.request(callback),
    cancelIdleCallback: id => idle.cancel(id),
    console: { ...console, error() {} },
  } });
});

function fixture() {
  const { Showcase, THREE, G } = api;
  G.game = { mobile: { touch: false } };
  const pending = new Map();
  let serial = 0;
  idle = {
    request(callback) { const id = ++serial; pending.set(id, callback); return id; },
    cancel(id) { pending.delete(id); },
  };
  const calls = { prepared: 0, updated: 0, rendered: 0, delivered: [], disposed: 0 };
  const pool = {
    resetPortraitForRequest() { calls.prepared++; },
    update() { calls.updated++; },
  };
  const sc = Object.assign(Object.create(Showcase.prototype), {
    mode: 'locker', _out: 0, chars: [], _warmState: 'done', _pflight: 0,
    _pq: [], _pcache: new Map(), _portraitCharacter: pool, _portraitCacheEpoch: 0,
    _portraitReleasePending: false, _portraitTask: null, _portraitJob: null,
    _c2: new THREE.Color(), color: new THREE.Color('orange'),
  });
  const targets = [new THREE.WebGLRenderTarget(128, 128), new THREE.WebGLRenderTarget(128, 128)];
  for (const target of targets) target.addEventListener('dispose', () => { calls.disposed++; });
  [sc._prt, sc._prt8] = targets;
  sc._anim = () => ({ time: 0 });
  const reads = [];
  sc._renderPortrait = () => {
    calls.rendered++;
    return new Promise((resolve, reject) => reads.push({ resolve, reject }));
  };
  const fire = () => {
    const next = pending.entries().next().value;
    assert.ok(next, 'one native idle stage is scheduled');
    pending.delete(next[0]);
    next[1]({ didTimeout: false, timeRemaining: () => 5 });
  };
  const drain = () => { while (pending.size) fire(); };
  const portrait = (kind = 'head') => sc.portrait({ kind, size: 128, color: 'orange' }, cv => { calls.delivered.push(cv); });
  return { sc, calls, targets, pending, reads, fire, drain, portrait };
}

for (const rejected of [false, true]) test('Locker exit retires staged readback targets after ' + (rejected ? 'rejection' : 'success'), async () => {
  const h = fixture();
  h.portrait(); h.sc._portraitStep(); h.drain();
  assert.equal(h.sc._pflight, 1);
  h.sc.hide();
  assert.equal(h.sc._portraitReleasePending, true);
  assert.equal(h.calls.disposed, 0, 'a live GPU readback retains both staging attachments');
  if (rejected) h.reads[0].reject(Error('readback failed')); else h.reads[0].resolve({ width: 128, height: 128 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.delivered.length, 1);
  assert.equal(h.calls.delivered[0] === null, rejected);
  assert.equal(h.sc._pflight, 0);
  assert.equal(h.sc._portraitReleasePending, false);
  assert.equal(h.sc._prt, null);
  assert.equal(h.sc._prt8, null);
  assert.equal(h.calls.disposed, 2, 'the existing release helper runs without another menu/render frame');
  h.sc._portraitStep();
  assert.equal(h.calls.disposed, 2, 'an empty staged queue cannot dispose attachments twice');
  h.sc.mode = 'locker';
  h.sc._pres = {}; // keep the existing resolve material; only native targets are needed here
  h.sc._renderPortraitSetup(128);
  assert.notEqual(h.sc._prt, h.targets[0]);
  assert.notEqual(h.sc._prt8, h.targets[1]);
  assert.equal(h.sc._prt.width, 128);
  assert.equal(h.sc._prt.texture.type, api.THREE.HalfFloatType);
  assert.equal(h.sc._prt.samples, 4);
  assert.equal(h.sc._prt8.depthBuffer, false);
  h.sc._releasePortraitTargets(false);
});

test('an active staged portrait keeps existing targets until its canceled next stage retires', () => {
  const h = fixture(), handle = h.portrait();
  h.sc._portraitStep(); h.fire();
  assert.equal(h.calls.prepared, 1);
  assert.equal(h.sc._portraitPreparedCharacter, h.sc._portraitCharacter);
  h.sc.hide();
  assert.equal(h.calls.disposed, 0, 'native queue is empty but the staged owner still has a live callback');
  assert.equal(h.sc._portraitReleasePending, true);
  handle.cancel(); h.fire();
  assert.equal(h.sc._portraitJob, null);
  assert.equal(h.sc._portraitPreparedCharacter, null);
  assert.equal(h.sc._portraitActiveCharacter, null);
  assert.equal(h.calls.updated, 0);
  assert.equal(h.calls.rendered, 0);
  assert.equal(h.calls.delivered.length, 0);
  assert.equal(h.calls.disposed, 2);
  assert.equal(h.sc._portraitReleasePending, false);
});

test('canceling the only queued portrait lets the native release owner finish at the next staged queue pass', () => {
  const h = fixture(), handle = h.portrait();
  h.sc.hide();
  assert.equal(h.sc._portraitReleasePending, true);
  handle.cancel(); h.sc._portraitStep();
  assert.equal(h.pending.size, 0);
  assert.equal(h.calls.rendered, 0);
  assert.equal(h.calls.disposed, 2);
  assert.equal(h.sc._portraitReleasePending, false);
});

test('a surviving queued portrait defers release and receives unchanged native pose work', async () => {
  const h = fixture();
  h.portrait(); h.sc._portraitStep(); h.drain();
  h.portrait('bust'); h.sc.hide();
  h.reads[0].resolve({ width: 128, height: 128 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.disposed, 0, 'release waits for the remaining requested portrait');
  assert.equal(h.sc._portraitReleasePending, true);
  h.sc._portraitStep(); h.drain();
  assert.equal(h.calls.prepared, 2);
  assert.equal(h.calls.updated, 28, 'each live request still receives fourteen 30Hz pose steps');
  assert.equal(h.calls.rendered, 2);
  h.reads[1].resolve({ width: 128, height: 128 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.delivered.length, 2);
  assert.equal(h.calls.disposed, 2);
  assert.equal(h.sc._portraitReleasePending, false);
});
