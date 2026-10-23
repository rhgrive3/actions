import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { validOwnerTickAdvance } from '../snapshot-guard.mjs';

// NetSession._begin publishes its NetMatch before startNetMatch has built and
// bound the real Match. These tests exercise that lifecycle boundary through
// the complete production adapter chain, without clearing accepted peer state.
async function setup() {
  const f = await fixture({ productionComposition: true });
  const nm = f.makeNetMatch(f.makeSession());
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  const packet = (ts, x = 0) => ({ k: 't', ts, u: Math.floor(ts * 60),
    a: [f.packActor(remote, { x, f: 17 })], l: { 17: 0 } });
  const bind = () => nm.bind({ actors: [remote], state: 'playing', time: 180 });
  return { f, nm, remote, packet, bind };
}

test('#1767 delayed pre-bind snapshot cannot establish a stale owner clock', async () => {
  const x = await setup();
  try {
    // The recorded clock pair demonstrates the old permanent false rejection.
    assert.equal(validOwnerTickAdvance(175.665, 124.04, 129.6118, 92.3055), false);
    x.f.clock.set(92.3055);
    x.nm.onMessage('p2', x.packet(124.04, 2));
    assert.equal(x.nm.peers.has('p2'), false, 'unbound tick established owner clock');
    assert.equal(x.nm.stats.in, 0);

    x.f.clock.set(129.6118);
    x.bind();
    x.nm.onMessage('p2', x.packet(175.665, 7));
    const peer = x.nm.peers.get('p2');
    assert.equal(peer.lastTs, 175.665);
    assert.equal(peer.lastReceiveAt, 129.6118);
    assert.equal(x.remote.net.buf.at(-1).x, 7);
    x.f.clock.advance(.05);
    x.nm.onMessage('p2', x.packet(175.715, 8));
    assert.equal(peer.lastTs, 175.715);
    assert.equal(x.remote.net.buf.at(-1).x, 8);
  } finally { x.nm.dispose(); }
});

test('#1767 unbound snapshots leave existing peer state untouched', async () => {
  const x = await setup();
  try {
    const peer = x.nm._peer('p2');
    peer.lastBossHit = 4;
    const before = JSON.stringify(peer);
    for (const ts of [124.04, 175.665, 1e12]) {
      x.nm.onMessage('p2', x.packet(ts));
      assert.equal(JSON.stringify(peer), before);
    }
    x.bind();
    x.nm.onMessage('p2', x.packet(175.715, 9));
    assert.equal(x.nm.peers.get('p2'), peer, 'binding replaced peer identity');
    assert.equal(peer.lastBossHit, 4, 'startup guard cleared existing replay state');
    assert.equal(peer.lastTs, 175.715);
  } finally { x.nm.dispose(); }
});

test('#1767 bound peers retain future, stale, replay and owner protections', async () => {
  const x = await setup();
  try {
    x.bind();
    x.nm.onMessage('p2', x.packet(1000, 2));
    const peer = x.nm.peers.get('p2');
    const before = JSON.stringify(peer), buffer = JSON.stringify(x.remote.net.buf);
    // Include a modest future jump, not only clocks beyond the scalar limit.
    for (const ts of [1014, 1e12, 1000, 999]) {
      x.nm.onMessage('p2', x.packet(ts, 90));
      assert.equal(JSON.stringify(peer), before);
      assert.equal(JSON.stringify(x.remote.net.buf), buffer);
    }
    x.nm.onMessage('p3', x.packet(1000.025, 90));
    assert.equal(JSON.stringify(x.remote.net.buf), buffer);
    x.f.clock.advance(.05);
    x.nm.onMessage('p2', x.packet(1000.05, 7));
    assert.equal(peer.lastTs, 1000.05);
    assert.equal(x.remote.net.buf.at(-1).x, 7);
  } finally { x.nm.dispose(); }
});
