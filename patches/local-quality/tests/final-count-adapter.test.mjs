// #831: match:count final-countdown milestones stay monotonic when the online
// follower clock is corrected in either direction by the real _hostClock().
// The baseline control reproduces the residual root in actual main (9 replayed
// after 8); the composed source must keep the offline 10 -> 1 sequence, the
// one-shot 1:00 milestone, host TIME UP authority and the attract/Range gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { advanceTenacity } from '../tenacity.mjs';
import { adaptQualitySource, replaceOnce, qualityIdentity } from '../adapter.mjs';
import { adaptFinalCount } from '../final-count-adapter.mjs';
const read = (rel) => fs.readFileSync('inkwave-public/' + rel, 'utf8');

function updateSlice(source) {
  const start = source.indexOf('  update(dt) {');
  const end = source.indexOf('\n  updateController', start);
  assert.ok(start >= 0 && end > start, 'actual Match.update slice');
  return source.slice(start, end);
}
// The real follower half-correction from actual net/netmatch.js — the root is
// proven against this method, not a re-implementation of it.
const NetClock = vm.runInNewContext(`(class NetClock {${
  (() => {
    const net = read('src/net/netmatch.js');
    const start = net.indexOf('  _hostClock([state, time]) {');
    const end = net.indexOf('\n  _hostState', start);
    assert.ok(start >= 0 && end > start, 'actual NetMatch._hostClock slice');
    return net.slice(start, end);
  })()
}})`, {});

function rig(source, { time = 8.4, attract = false, follower = true } = {}) {
  const counts = [], minutes = [];
  const emit = (type, e) => { if (type === 'match:count') counts.push(e.n); if (type === 'match:oneminute') minutes.push(1); };
  const Native = vm.runInNewContext(`class Match {${updateSlice(source)}};Match`,
    { G: { netm: null }, emit, advanceTenacity, PLAYER: { radius: .3 }, MATCH: { finalCountdown: 10 }, Math });
  const m = Object.assign(new Native(), {
    mode: 'turf', state: 'playing', stateT: 0, time, duration: 180, attract, follower,
    paused: false, actors: [], bossMode: null, result: null, lastMinuteFired: false, lastCount: 99,
    setState(s) { this.state = s; }, _judge() { this.judged = true; },
  });
  const nm = new NetClock(); nm.match = m; nm.isHost = false;
  return { m, counts, minutes, nm, tick: (dt = 1 / 60) => m.update(dt) };
}
const until = (h, done, max = 400) => { for (let i = 0; i < max && !done(); i++) h.tick(); };


test('#831 adapter is match.js-only and fails closed on drift, duplication and re-apply', () => {
  const rel = 'src/game/match.js', raw = read(rel);
  const out = adaptFinalCount(rel, raw, replaceOnce);
  assert.notEqual(out, raw);
  assert.ok(out.includes('c > 0 && c < this.lastCount'));
  assert.ok(!out.includes('c !== this.lastCount'));
  assert.throws(() => adaptFinalCount(rel, '', replaceOnce), /conflict/);
  assert.throws(() => adaptFinalCount(rel, raw + raw, replaceOnce), /conflict/);
  assert.throws(() => adaptFinalCount(rel, out, replaceOnce), /conflict/);
  for (const p of ['src/net/netmatch.js', 'src/main.js', 'src/ui/hud.js']) assert.equal(adaptFinalCount(p, read(p), replaceOnce), read(p));
  assert(qualityIdentity()['final-count-adapter.mjs']);
  assert.ok(adaptQualitySource(rel, raw).includes('c > 0 && c < this.lastCount'), 'quality chain wires the monotonic guard');
});

test('baseline negative control: a stale host snapshot replays 9 after 8 in actual main', () => {
  const h = rig(read('src/game/match.js'), { time: 8.4 });
  until(h, () => h.counts.at(-1) === 8);
  assert.equal(h.counts.at(-1), 8, 'countdown reached 8 before the correction');
  h.nm._hostClock(['playing', 8.45]);   // real follower path: ~7.99 rewound to ~8.21
  h.tick();
  assert.equal(h.counts.at(-1), 9, 'residual root: the stale snapshot re-arms 9');
});

test('#831 backward host correction can never replay or reverse a presented number', () => {
  const h = rig(adaptQualitySource('src/game/match.js', read('src/game/match.js')), { time: 8.4 });
  until(h, () => h.counts.at(-1) === 8);
  assert.deepEqual(h.counts, [9, 8]);
  h.nm._hostClock(['playing', 8.45]);
  h.tick();
  assert.deepEqual(h.counts, [9, 8], 'stale backward snapshot emits nothing');
  h.nm._hostClock(['playing', 8.45]);          // repeat the same stale sample
  for (let i = 0; i < 5; i++) h.tick();
  h.nm._hostClock(['playing', 9.4]);           // larger rewind across 8 and 9
  until(h, () => h.m.time === 0, 1200);
  assert.deepEqual(h.counts, [9, 8, 7, 6, 5, 4, 3, 2, 1], 'strictly decreasing, every value once');

test('#831 forward host correction defines a monotonic skip that never replays later', () => {
  const h = rig(adaptQualitySource('src/game/match.js', read('src/game/match.js')), { time: 9.1 });
  h.tick();
  assert.deepEqual(h.counts, [10]);
  h.nm._hostClock(['playing', 5.1]);           // late snapshot: ~9.08 -> ~7.09
  h.tick();
  assert.deepEqual(h.counts, [10, 8], 'crossed 9 is skipped once, never reversed');
  until(h, () => h.m.time <= 6.02, 400);
  h.nm._hostClock(['playing', 9.4]);           // late rewind after the skip
  until(h, () => h.m.time === 0, 1200);
  assert.deepEqual(h.counts, [10, 8, 7, 6, 5, 4, 3, 2, 1], 'skipped 9 never replays; strictly decreasing');
});

test('#831 offline final countdown is identical to baseline at 30/60/120Hz', () => {
  for (const hz of [30, 60, 120]) {
    const raw = rig(read('src/game/match.js'), { time: 10.5 });
    const fixed = rig(adaptQualitySource('src/game/match.js', read('src/game/match.js')), { time: 10.5 });
    const dt = 1 / hz;
    for (let i = 0; i < hz * 4 && raw.m.time > 0; i++) { raw.tick(dt); fixed.tick(dt); }
    const expected = Array.from({ length: 10 }, (_, i) => 10 - i);
    assert.deepEqual(raw.counts, expected, `baseline offline ${hz}Hz`);
    assert.deepEqual(fixed.counts, expected, `composed offline ${hz}Hz`);
    assert.deepEqual(raw.minutes, fixed.minutes, `1:00 parity ${hz}Hz`);
  }
});

test('#831 one-shot 1:00 milestone and host TIME UP authority are untouched', () => {
  const composed = adaptQualitySource('src/game/match.js', read('src/game/match.js'));
  const h = rig(composed, { time: 60.5 });
  until(h, () => h.minutes.length > 0, 120);
  h.nm._hostClock(['playing', 66]);            // rewind across 60 after it fired
  until(h, () => h.m.time <= 59.9, 400);
  assert.equal(h.minutes.length, 1, '1:00 stays one-shot under clock correction');
  const follower = rig(composed, { time: 0.02, follower: true });
  follower.tick();
  assert.equal(follower.m.state, 'playing', 'follower never calls TIME UP');
  const host = rig(composed, { time: 0.02, follower: false });
  host.tick();
  assert.equal(host.m.state, 'finish', 'host still owns TIME UP');
});

test('#831 attract/Range presentation gate stays closed', () => {
  const h = rig(adaptQualitySource('src/game/match.js', read('src/game/match.js')), { time: 5.5, attract: true });
  until(h, () => h.m.time === 0, 600);
  assert.deepEqual(h.counts, []);
  assert.deepEqual(h.minutes, []);
});

});
