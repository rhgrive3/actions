import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamedTrack } from '../inkwave-public/src/audio/streamedTrack.js';

function makeMock() {
  const calls = [];
  const param = { value: 0, cancelScheduledValues: (t) => calls.push(['cancel', t]), setValueAtTime(v, t) { this.value = v; calls.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { this.value = v; calls.push(['ramp', v, t]); } };
  let failed = 0, played = 0, paused = 0, removed = 0;
  const listeners = new Map();
  const element = {
    loop: false,
    addEventListener: (n, cb) => listeners.set(n, cb),
    removeEventListener: (n) => { listeners.delete(n); removed++; },
    play: () => { played++; return Promise.resolve(); },
    pause: () => { paused++; },
    removeAttribute: () => {},
    load: () => {},
  };
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const engine = { ctx: { createGain: () => ({ ...node(), gain: param }), createMediaElementSource: () => node() }, mix: node(), now: () => 7 };
  const track = new StreamedTrack(engine, 'battle', { bpm: 150 }, element, () => { failed++; });
  return { track, element, calls, listeners, get failed() { return failed; }, get played() { return played; }, get paused() { return paused; }, get removed() { return removed; } };
}

test('streamed track connects a looping element, fades in and releases it', async () => {
  const a = makeMock();
  assert.equal(a.element.loop, true);
  a.track.fadeIn(7.1, 0.2);
  await Promise.resolve();
  assert.equal(a.played, 1);
  assert.ok(a.calls.some(c => c[0] === 'ramp' && c[1] === 0.7));
  a.track.dispose();
  a.track.dispose();
  assert.equal(a.paused, 1);
  assert.equal(a.removed, 1);
});

test('media load failure is reported only once', () => {
  const a = makeMock();
  a.listeners.get('error')();
  a.track._fail();
  assert.equal(a.failed, 1);
  a.track.dispose();
  a.track._fail();
  assert.equal(a.failed, 1);
});

test('fade out stops and pauses without full-file decoding', () => {
  const a = makeMock();
  a.track.fadeOut(7, 0.01);
  assert.ok(Number.isFinite(a.track.stopAt));
  a.track.dispose();
  assert.equal(a.paused, 1);
});
