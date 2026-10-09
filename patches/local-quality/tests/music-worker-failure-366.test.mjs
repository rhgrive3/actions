import test from 'node:test';
import assert from 'node:assert/strict';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

async function rig(failure) {
  const f = audioFixture(), urls = new Set(), revoked = [], timeouts = new Map();
  let sequence = 0;
  f.globals.URL = {
    createObjectURL() { const url = `blob:music-${++sequence}`; urls.add(url); return url; },
    revokeObjectURL(url) { revoked.push(url); urls.delete(url); },
  };
  f.globals.setTimeout = (callback, delay) => { const id = ++sequence; timeouts.set(id, { callback, delay }); return id; };
  f.globals.clearTimeout = id => timeouts.delete(id);
  f.globals.Worker = class {
    constructor() { if (failure === 'constructor') throw Error('worker construction unavailable'); f.workers.add(this); }
    postMessage() { if (failure === 'postMessage') throw Error('worker startup failed'); }
    terminate() { f.workers.delete(this); }
  };
  const { AudioEngine, music } = await idleFixture({ globals: f.globals });
  const audio = new AudioEngine({ context: f.ctx }); audio.init();
  return { ...f, audio, music, urls, revoked, timeouts };
}

for (const failure of ['constructor', 'postMessage']) {
  test(`#366 ${failure} failure releases the abandoned worker URL before interval fallback`, async () => {
    const f = await rig(failure);
    try {
      f.music.play('title');
      assert.equal(f.urls.size, 0, 'a failed startup must not retain its Blob URL indefinitely');
      assert.equal(f.workers.size, 0, 'a partially started worker must be terminated');
      assert.equal(f.music.worker, null);
      assert.equal(f.intervals.size, 1, 'the existing audible interval fallback remains active');
      const starts = f.counts.starts; f.ctx.currentTime += .5;
      for (const callback of f.intervals.values()) callback();
      assert.ok(f.counts.starts > starts, 'fallback continues scheduling actual native music notes');
      for (let i = 0; i < 8; i++) {
        f.audio.setVolumes({ music: 0 });
        assert.equal(f.intervals.size, 0); assert.equal(f.music.players.length, 0);
        f.audio.setVolumes({ music: .6 });
        assert.equal(f.intervals.size, 1); assert.equal(f.workers.size, 0); assert.equal(f.urls.size, 0);
      }
      assert.equal(f.revoked.length, 9, 'each failed start releases its own URL exactly once');
      assert.equal([...f.timeouts.values()].filter(t => t.delay === 5000).length, 0,
        'failed starts do not need delayed URL cleanup callbacks');
      assert.equal(f.counts.suspended, 0, 'shared SFX AudioContext remains running');
    } finally { f.music.dispose(); }
    assert.equal(f.workers.size + f.intervals.size, 0);
  });
}

test('#366 successful worker startup retains the native delayed URL release and music behavior', async () => {
  const f = await rig();
  try {
    f.music.play('title');
    assert.equal(f.workers.size, 1); assert.equal(f.intervals.size, 0); assert.equal(f.urls.size, 1);
    const cleanup = [...f.timeouts.values()].filter(t => t.delay === 5000);
    assert.equal(cleanup.length, 1);
    cleanup[0].callback();
    assert.equal(f.urls.size, 0); assert.equal(f.revoked.length, 1);
    assert.equal(f.workers.size, 1); assert.equal(f.music.track, 'title');
    f.audio.setVolumes({ master: 0 }); assert.equal(f.workers.size, 0);
    f.audio.setVolumes({ master: .8 }); assert.equal(f.workers.size, 1);
  } finally { f.music.dispose(); }
  assert.equal(f.workers.size + f.intervals.size, 0);
});

test('#366 asynchronous worker failure retires that worker before starting one interval', async () => {
  const f = await rig();
  try {
    f.music.play('title');
    const worker = f.music.worker, error = worker.onerror;
    error();
    assert.equal(f.workers.size, 0, 'worker failure cannot orphan the old scheduler');
    assert.equal(worker.onmessage, null); assert.equal(worker.onerror, null);
    assert.equal(f.music.worker, null); assert.equal(f.intervals.size, 1);
    error(); assert.equal(f.intervals.size, 1, 'duplicate failure delivery creates no second interval');
    f.audio.setVolumes({ music: 0 }); assert.equal(f.intervals.size, 0);
    error(); assert.equal(f.intervals.size, 0, 'retired failure callback cannot resurrect muted scheduling');
    f.audio.setVolumes({ music: .6 });
    const replacement = f.music.worker;
    error(); assert.equal(f.music.worker, replacement, 'old failure cannot detach a newer worker');
    assert.equal(f.workers.size, 1); assert.equal(f.intervals.size, 0);
    const replacementError = replacement.onerror;
    f.music._pauseTimer(); replacementError();
    assert.equal(f.workers.size + f.intervals.size, 0, 'failure while paused does not start fallback work');
    f.music._resumeTimer(); assert.equal(f.workers.size, 1);
    for (const { callback, delay } of f.timeouts.values()) if (delay === 5000) callback();
    assert.equal(f.urls.size, 0, 'asynchronous failure retains bounded native URL cleanup');
    f.music.dispose(); error();
    assert.equal(f.workers.size + f.intervals.size, 0, 'disposed music never restarts');
  } finally { f.music.dispose(); }
});
