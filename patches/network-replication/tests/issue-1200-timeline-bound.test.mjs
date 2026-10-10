// #1200: owner timeline events must never poison the receiver's chronological FIFO.
// Uses the complete composed NetMatch and the #1209 kit-paint admission layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

async function receiver() {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2']]));
  f.bind(nm, []);
  const peer = nm._peer('p2'), played = [];
  nm._play = (from, event) => played.push([from, event]);
  return { nm, peer, played };
}
function tick(nm, ts, u, e, r = 2) {
  nm.onMessage('p2', { k: 't', ts, r, u, e });
}
const row = (ts, u, seq) => [ts, 'ev', 'respawn', {}, u, seq];

test('#1200 far-future timestamp and simulation tick are rejected before FIFO insertion', async () => {
  const { nm, peer, played } = await receiver();
  tick(nm, 1000, 60000, [row(1e12, 60000, 1)]);
  assert.equal(peer.events.length, 0, 'future timestamp entered the owner FIFO');
  tick(nm, 1000.05, 60003, [row(1000.04, 999999999, 2)]);
  assert.equal(peer.events.length, 0, 'future sender-tick metadata entered FIFO');
  tick(nm, 1000.10, 60006, [row(1000.09, 60006, 3)]);
  peer.tr = 1000.10; peer.sim = 60006;
  nm._playEvents();
  assert.equal(played.length, 1, 'normal event after invalid prefix must still play');
  assert.equal(played[0][1][5], 3);
});

test('#1200 bounded owner event envelopes cannot exceed 256 per tick or 512 per peer', async () => {
  const { nm, peer } = await receiver();
  const flood = (ts, u, start) => Array.from({ length: 600 }, (_, i) => row(ts - .001, u, start + i));
  tick(nm, 1000.15, 60009, flood(1000.15, 60009, 1000));
  assert.equal(peer.events.length, 256, 'per-packet event budget was not enforced');
  tick(nm, 1000.20, 60012, flood(1000.20, 60012, 2000));
  assert.equal(peer.events.length, 512, 'per-peer event queue exceeded 512');
  tick(nm, 1000.25, 60015, flood(1000.25, 60015, 3000));
  assert.equal(peer.events.length, 512, 'third flood grew event queue');
});

test('#1200 malformed envelope members and stale ticks do not consume valid sender order', async () => {
  const { nm, peer, played } = await receiver();
  tick(nm, 1000, 60000, [null, 0, {}, row(1000.01, 60000, 1), row(1000, 60001, 2), row(999.99, 60000, 3)]);
  assert.equal(peer.events.length, 1);
  peer.tr = 1000; peer.sim = 60000; nm._playEvents();
  assert.deepEqual(played.map(([_,e]) => e[5]), [3]);
});
