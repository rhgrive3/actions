import test from 'node:test';
import assert from 'node:assert/strict';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
for (const hz of [30, 60, 120]) test(`#1767 delayed startup catches up without widening the owner clock guard (${hz} Hz sampling)`, async () => {
  const owner = await combatWorld('A', { network: true });
  const viewer = await combatWorld('B', { network: true });
  const legacy = await combatWorld('B', { network: true });
  try {
    let receipt = 1700000000000;
    viewer.net.s.tr.relayReceipt = from => from === 'A' ? receipt : null;
    const packet = (ts, x) => {
      owner.attacker.pos.x = x; owner.net._sendTick();
      const data = clone(owner.wire.filter(w => w.data.k === 't').at(-1).data);
      data.ts = ts; return data;
    };
    const receive = data => { viewer.net.onMessage('A', clone(data)); legacy.net.onMessage('A', clone(data)); };
    receive(packet(124.04, 2));
    // The issue's observed 51.625 sender seconds vs 37.3 handler seconds.
    // Both packets were forwarded normally; startup delayed the first dispatch.
    for (let i = 0; i < 746; i++) { viewer.advance(); legacy.advance(); }
    receipt += 51625; receive(packet(175.665, 7));
    const peer = viewer.net.peers.get('A');
    assert.equal(peer.lastTs, 175.665);
    assert.equal(viewer.attacker.net.buf.at(-1).x, 7);
    assert.equal(legacy.net.peers.get('A').lastTs, 124.04, 'old local-clock path reproduces the stuck peer');
    peer.tr = 175.665; viewer.net._sample(viewer.attacker, peer.tr, 1 / hz); viewer.net.applyRemote(viewer.attacker, 1 / hz);
    assert.equal(viewer.attacker.pos.x, 7);
    const beforePeer = JSON.stringify(peer), beforeBuffer = JSON.stringify(viewer.attacker.net.buf), incoming = viewer.net.stats.in;
    // Replays, backward clocks, future jumps and attacker JSON metadata remain invalid.
    receipt += 50; viewer.advance();
    for (const ts of [124.04, 175.665, 175.664, 181, 1175.665, 1e308, null]) {
      const forged = packet(ts, 90); forged.relayAt = receipt + 1e9;
      viewer.net.onMessage('A', forged);
      assert.equal(JSON.stringify(peer), beforePeer);
      assert.equal(JSON.stringify(viewer.attacker.net.buf), beforeBuffer);
      assert.equal(viewer.net.stats.in, incoming);
    }
    receive(packet(175.715, 9));
    assert.equal(peer.lastTs, 175.715, 'a rejection cannot poison later legitimate recovery');
    assert.equal(viewer.attacker.net.buf.at(-1).x, 9);
    // Authentication remains independent from the time source.
    const accepted = JSON.stringify(viewer.attacker.net.buf);
    viewer.net.onMessage('B', packet(175.765, 99));
    assert.equal(JSON.stringify(viewer.attacker.net.buf), accepted);
  } finally { owner.dispose(); viewer.dispose(); legacy.dispose(); }
});
