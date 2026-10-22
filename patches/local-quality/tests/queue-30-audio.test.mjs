import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AuthorizedSamplePack } from '../../splatoon3/runtime/audio/authorized-samples.mjs';
import { RealS3SampleLoader } from '../../splatoon3/runtime/audio/real-s3-loader.mjs';

const installed = JSON.parse(readFileSync(new URL('../../splatoon3/runtime/audio/real-s3-installed.json', import.meta.url), 'utf8'));

test('real-S3 manifest builds stable id and event indices and ignores blocked cold jobs on full resident hits', async () => {
  const bank = {
    disposed: false, ctx: { state: 'running' },
    authorized: {
      maxBytes: 1024, loaded: new Map(), bytes: 0,
      key: (id, ev, variant) => id + ':' + ev + ':' + variant,
      load: () => { throw new Error('already resident'); },
    },
  };
  let requests = 0;
  const loader = new RealS3SampleLoader(bank, {
    fetcher: async () => { requests++; return { ok: true, json: async () => installed }; },
  });
  const data = await loader.getManifest();
  assert.equal(requests, 1);
  const first = data.clips[0];
  const all = data.clips.filter(c => c.id === first.id && c.event === first.event);
  assert.deepStrictEqual(loader._select(first.id, first.event), all);
  assert.deepStrictEqual(loader._select(first.id), data.clips.filter(c => c.id === first.id));
  for (const c of all) bank.authorized.loaded.set(bank.authorized.key(c.id, c.event, c.variant), c);
  // The newly resident event must not await an unrelated stalled cold import.
  loader.queue = new Promise(() => {});
  assert.deepStrictEqual(await loader.ensure(first.id, first.event), { loaded: 0, cached: true });
  assert.equal(loader.inFlight.size, 0);
  for (let i = 0; i < 1000; i++) loader._error('failure-' + i);
  assert.equal(loader.totalErrorCount, 1000);
  assert.equal(loader.errors.length, 64);
  assert.deepStrictEqual(loader.stats().errors, Array.from({ length: 6 }, (_, i) => 'failure-' + (994 + i)));
});

test('audio staging reuses one file decode across two events and evicts all shared PCM references together', async () => {
  let fetches = 0, decodes = 0;
  const ctx = {
    state: 'running',
    decodeAudioData: async () => {
      decodes++;
      return {
        sampleRate: 48000, duration: 1, length: 256, numberOfChannels: 1,
        getChannelData: () => new Float32Array(256),
      };
    },
  };
  const fetcher = async () => {
    fetches++;
    return {
      ok: true, headers: { get: () => null },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };
  const bank = new AuthorizedSamplePack(ctx, { maxBytes: 1200, fetcher });
  const first = installed.clips[0], second = installed.clips[1];
  const clean = (c, file = c.file, variant = 0) => ({
    id: c.id, event: c.event, variant, file, gain: 1, seamlessLoop: false,
  });
  const pack = clips => ({
    schema: 1, usageRights: 'Isolated synthetic test audio, authored for this harness.',
    clips,
  });
  const loaded = await bank.load(pack([clean(first), clean(second, first.file)]), {
    replace: true, concurrency: 2,
  });
  assert.equal(loaded.loaded, 2);
  assert.equal(fetches, 1, 'one encoded file is fetched across both entries');
  assert.equal(decodes, 1, 'shared encoded file is decoded once');
  assert.equal(bank.bytes, 1024, 'shared PCM is counted once');
  const a = bank.pick(first.id, first.event), b = bank.pick(second.id, second.event);
  assert.equal(a.buffer, b.buffer, 'decoded buffer identity is preserved across events');

  const replacement = await bank.load(pack([clean(first, second.file, 1)]), {
    replace: false, concurrency: 1,
  });
  assert.equal(replacement.loaded, 1);
  assert.equal(fetches, 2);
  assert.equal(decodes, 2);
  assert.equal(bank.bytes, 1024);
  assert.equal(bank.loaded.size, 1, 'both earlier shared references are evicted as a unit');
  assert.ok(bank.loaded.has(bank.key(first.id, first.event, 1)));
});
