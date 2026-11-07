// Owner recordings wired on 2026-11-07: title A press + 0.3 s tone, GO, judge reveal, rolling loop.
// Logic only: the levels are provisional and have not been heard in a browser or on a device.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OWNER_SFX, rollRate, swimRate } from '../runtime/audio/owner-sfx-recordings.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
// The upstream files stay byte-identical (upstream-lock.json); the cues come from the composed build.
const menus = adaptBuildSource('src/ui/menus.js', read('src/ui/menus.js'));
const main = adaptBuildSource('src/main.js', read('src/main.js'));

test('the A press recording is the title press and the GO horn', () => {
  assert.equal(OWNER_SFX.title_press.file, 'ui_title_press_a.mp3');
  assert.equal(OWNER_SFX.go_horn.file, OWNER_SFX.title_press.file);
  assert.equal(OWNER_SFX.title_press.fallback, 'ui_confirm', 'if the file fails, the title keeps the synthesized press');
  assert.equal(OWNER_SFX.go_horn.fallback, undefined, 'go_horn already exists as a synthesized cue, so it stays until decoded or on failure');
});

test('the single tone and the judge decision use their own recordings', () => {
  assert.equal(OWNER_SFX.title_follow.file, 'sfx_n0010a10.mp3');
  assert.equal(OWNER_SFX.judge_reveal.file, 'sfx_gear_put_on_cloth.mp3');
  assert.equal(OWNER_SFX.title_follow.fallback, undefined, 'no synthesized equivalent: silent until decoded');
});

test('the rolling recording is a seamless loop that follows the synth pitch range', () => {
  assert.equal(OWNER_SFX.roll.loop, true);
  assert.equal(OWNER_SFX.roll.rate, 'linear');
  assert.equal(OWNER_SFX.roll.crossfade > 0, true);
  assert.equal(rollRate(0.3), 0.6);
  assert.equal(rollRate(1), 1);
  assert.equal(rollRate(2), 1.6);
  assert.ok(swimRate(1.6) < 1.15, 'swim keeps its gentle curve');
});

test('composed build passes playback options to the engine and keeps one title timer', () => {
  assert.match(menus, /  _sfx\(name, minGap = 0\.03, opts\) \{/);
  assert.match(menus, /this\.api\.playSound && this\.api\.playSound\(name, opts\)/);
  assert.match(main, /playSound: \(n, o\) => \{ G\.audio\?\.init\?\.\(\); G\.audio\?\.play\(n, o\); \}/);
  assert.match(main, /G\.audio\?\.play\('special_charged'\)/);
});

test('title screen: A press, then the tone 300 ms later, without the synthesized confirm or splat', () => {
  const body = menus.slice(menus.indexOf('  _titleGo() {'), menus.indexOf('  _titleGo() {') + 500);
  assert.match(body, /this\._sfx\('title_press'\);/);
  assert.match(body, /this\._sfx\('title_follow', 0\.03, \{ delay: 0\.3 \}\);/, 'scheduled on the audio clock, not a second timer');
  assert.equal((body.match(/setTimeout/g) || []).length, 1, 'only the existing 200 ms transition timer');
  assert.doesNotMatch(body, /_sfx\('ui_confirm'\)/);
  // Owner request 2026-11-07: the synthesized splat no longer layers over the recordings.
  assert.doesNotMatch(body, /_sfx\('splat_small'\)/, 'only the two recordings play');
  assert.ok(OWNER_SFX.title_press.gain > 0.1 && OWNER_SFX.title_follow.gain > 0.04, 'both title recordings were raised');
});

test('title cues are fetched at page load and decode without a gesture', async () => {
  const { prefetchOwnerSfx, loadOwnerSfx, TITLE_SFX } = await import('../runtime/audio/owner-sfx-recordings.mjs');
  assert.deepEqual([...TITLE_SFX], ['title_press', 'title_follow']);
  const requested = [];
  prefetchOwnerSfx(TITLE_SFX, async (href) => { requested.push(String(href).split('/').pop()); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4096) }; });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(requested, ['ui_title_press_a.mp3', 'sfx_n0010a10.mp3']);
  // Decoding uses the prefetched bytes: the engine's own fetcher is never called.
  const ctx = {
    state: 'suspended',
    decodeAudioData: async bytes => {
      assert.equal(bytes.byteLength, 4096);
      const seconds = bytes.byteLength === 4096 ? 2.55 : 1.12;
      return { duration: seconds, length: 255, sampleRate: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(255) };
    },
  };
  let engineFetches = 0;
  const engine = { ctx, _ownerSfxFetcher: async () => { engineFetches++; return { ok: false, status: 500 }; } };
  const buffer = await loadOwnerSfx(engine, 'title_press');
  assert.ok(buffer, 'decoded from the prefetched bytes');
  assert.equal(engineFetches, 0);
});
