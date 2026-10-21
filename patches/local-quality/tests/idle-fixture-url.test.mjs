import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { idleFixture, audioFixture, ROOT } from './idle-fixture.mjs';

// Probe only language-level module metadata; never reference a private name that
// a production minifier may rename. Observe real URL construction separately.
const inspectMusic = (rel, source) => rel === 'src/audio/music.js'
  ? source + '\nexport const fixtureMusicModuleURL = import.meta.url;\n'
  : source;
const moduleURL = built => pathToFileURL(path.join(built || path.join(ROOT, 'inkwave-public'),
  'src/audio/music.js')).href;

for (const baseline of [false, true]) test('source idle VM resolves the actual music file URL, baseline=' + baseline, async () => {
  const calls = [];
  class ObservedURL extends URL {
    constructor(input, base) { super(input, base); calls.push({ input: String(input), base, href: this.href }); }
  }
  // This contract concerns the current source track, even when an older emitted
  // artifact is supplied for the separate constructor/module-metadata test.
  const f = await idleFixture({ baseline, built: null, transform: inspectMusic });
  await idleFixture({ baseline, built: null, globals: { URL: ObservedURL } });
  assert.equal(f.fixtureMusicModuleURL, moduleURL(null));
  assert.deepEqual(calls.filter(call => call.input === '../../assets/audio/Jet_Arrow.mp3'), [{
    input: '../../assets/audio/Jet_Arrow.mp3', base: moduleURL(null),
    href: new URL('../../assets/audio/Jet_Arrow.mp3', moduleURL(null)).href,
  }], 'actual module initialization resolves the file track once');
  assert.equal(typeof f.MusicEngine, 'function');
});

test('source or provided emitted music retains module metadata and the audio URL constructor', async () => {
  const audio = audioFixture();
  assert.equal(new audio.globals.URL('../clip.mp3', 'https://fixture.invalid/audio/workers/').href,
    'https://fixture.invalid/audio/clip.mp3');
  assert.equal(audio.globals.URL.createObjectURL(new audio.globals.Blob()), 'blob:fixture');
  assert.equal(audio.globals.URL.revokeObjectURL('blob:fixture'), undefined);
  const f = await idleFixture({ globals: audio.globals, transform: inspectMusic });
  assert.equal(f.fixtureMusicModuleURL, moduleURL(process.env.INKWAVE_IDLE_BUILD));
  assert.equal(typeof f.MusicEngine, 'function');
  assert.equal(new audio.globals.URL('../../assets/audio/Jet_Arrow.mp3', f.fixtureMusicModuleURL).href,
    new URL('../../assets/audio/Jet_Arrow.mp3', moduleURL(process.env.INKWAVE_IDLE_BUILD)).href);
  assert.equal(audio.workers.size, 0, 'module evaluation does not start a music worker');
  assert.equal(audio.intervals.size, 0, 'module evaluation does not start a fallback scheduler');
});
