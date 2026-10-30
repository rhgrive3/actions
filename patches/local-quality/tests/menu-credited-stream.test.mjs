import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

const asset = new URL('../../../inkwave-public/assets/audio/menu_the_ika_swing_aoi_kenban.mp3', import.meta.url);
const musicSource = new URL('../../../inkwave-public/src/audio/music.js', import.meta.url);

test('credited menu MP3 is a real vendored asset, identified in source', () => {
  const buf = fs.readFileSync(asset);
  assert.ok(buf.length > 1_000_000, 'menu MP3 should not be an empty placeholder');
  assert.ok(buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0), 'valid MP3 header');
  const source = fs.readFileSync(musicSource, 'utf8');
  assert.match(source, /蒼い鍵盤/);
  assert.match(source, /menu:\s*new URL\('\.\.\/\.\.\/assets\/audio\/menu_the_ika_swing_aoi_kenban\.mp3'/);
  assert.match(source, /battle:\s*new URL\('\.\.\/\.\.\/assets\/audio\/Jet_Arrow\.mp3'/);
});

test('live menu stream keeps looping through the existing WebAudio music bus', async () => {
  const f = audioFixture();
  class FakeAudio {
    constructor() { this.paused = true; this.src = ''; this.loop = false; }
    addEventListener() {}
    removeEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
  }
  const { MusicEngine } = await idleFixture({ globals: { ...f.globals, Audio: FakeAudio, window: {} } });
  const engine = new MusicEngine();
  engine._init(f.ctx, {});
  engine.play('menu');
  assert.equal(engine.current?.id, 'menu');
  assert.ok(engine.current.element instanceof FakeAudio);
  assert.equal(engine.current.element.loop, true);
  assert.match(engine.current.element.src, /menu_the_ika_swing_aoi_kenban\.mp3/);
  assert.equal(engine.current.engine, engine);
  engine.dispose();
});

test('missing browser MP3 never reverts to the old generated menu BGM', async () => {
  const f = audioFixture();
  class BrokenAudio { constructor() { throw new Error('decode unavailable'); } }
  const { MusicEngine } = await idleFixture({ globals: { ...f.globals, Audio: BrokenAudio, window: {} } });
  const engine = new MusicEngine();
  engine._init(f.ctx, {});
  engine.play('menu');
  assert.equal(engine.current, null);
  assert.equal(engine.players.length, 0);
  assert.equal(engine._desiredTrack, 'menu');
  assert.equal(engine._fileRetryCount, 1);
  engine.dispose();
});
