import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerRiseBuffer, chargerRecordedStatus, disposeChargerRise } from '../runtime/audio/charger-charge-rise.mjs';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pcm = () => ({ duration: 2, sampleRate: 44100, numberOfChannels: 2 });
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(36571) });

for (const phase of ['fetch', 'body', 'decode']) {
  test('disposing stalled Charger ' + phase + ' settles immediately and rejects late work', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const gate = deferred(); let signal, decodes = 0, bodies = 0, settled = false;
    const ctx = { state: 'running', decodeAudioData: async () => { decodes++; if (phase === 'decode') await gate.promise; return pcm(); } };
    const pending = chargerRiseBuffer(ctx, { fetcher: async (_url, options) => {
      signal = options.signal;
      if (phase === 'fetch') await gate.promise;
      return { ok: true, arrayBuffer: async () => { bodies++; if (phase === 'body') await gate.promise; return new ArrayBuffer(36571); } };
    } }).then(value => { settled = true; return value; });
    await flush();
    disposeChargerRise(ctx);
    await flush();
    assert.equal(signal.aborted, true);
    assert.equal(settled, true, 'disposal must settle without waiting for decoder or 8-second timer');
    assert.equal(await pending, null);
    const before = { bodies, decodes };
    gate.resolve(); await flush();
    assert.deepEqual({ bodies, decodes }, before, 'retired fetch/body must not launch further work');
    assert.equal(chargerRecordedStatus(ctx).ready, false);
  });
}

test('synchronous abort listener can prewarm a replacement without reusing the retired load', async () => {
  const oldResponse = deferred(); const buffer = pcm();
  const ctx = { state: 'running', decodeAudioData: async () => buffer };
  let replacement;
  const old = chargerRiseBuffer(ctx, { fetcher: (_url, options) => {
    options.signal.addEventListener('abort', () => {
      replacement = chargerRiseBuffer(ctx, { fetcher: async () => response() });
    }, { once: true });
    return oldResponse.promise;
  } });
  await flush(); disposeChargerRise(ctx); await flush();
  oldResponse.resolve(response());
  assert.equal(await old, null);
  assert.equal(await replacement, buffer, 'new owner must survive synchronous cancellation of the old one');
  assert.equal(chargerRecordedStatus(ctx).ready, true);
  disposeChargerRise(ctx);
});
