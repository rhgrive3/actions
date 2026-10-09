import test from 'node:test';
import assert from 'node:assert/strict';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
async function pair(transformSource) {
  const owner = await combatWorld('A', { network: true });
  const viewer = await combatWorld('B', { network: true, transformSource });
  const packet = x => {
    owner.attacker.pos.x = x; owner.net._sendTick();
    const data = owner.wire.filter(w => w.data.k === 't').at(-1).data;
    owner.advance(); return clone(data);
  };
  const receive = data => viewer.net.onMessage('A', clone(data));
  return { owner, viewer, packet, receive, dispose() { owner.dispose(); viewer.dispose(); } };
}
const oldClockGate = (rel, source) => rel === 'src/net/netmatch.js'
  ? source.replace('if (!validSnapshotTimestamp(d.ts)) return;', 'if (!Number.isFinite(d.ts)) return;')
      // The original row guard checked timestamp finiteness only. Reproduce
      // its admission without replacing the entire runtime helper module.
      .replace('validActorSnapshotRow(s, d.ts)', 'validActorSnapshotRow(s, 0)')
  : source;

test('#1178 old finite-only clock accepts an extreme timestamp and rejects the next native owner tick', async () => {
  const f = await pair(oldClockGate);
  try {
    f.receive(f.packet(2));
    const invalid = f.packet(40); invalid.ts = 1e308; f.receive(invalid);
    const next = f.packet(7); f.receive(next);
    assert.equal(f.viewer.net.peers.get('A').lastTs, 1e308);
    assert.equal(f.viewer.attacker.net.buf.at(-1).x, 40);
    assert.notEqual(f.viewer.attacker.net.buf.at(-1).t, next.ts);
  } finally { f.dispose(); }
});

for (const hz of [30, 60, 120]) test(`#1178 unsafe clock cannot mutate owner state or stop normal recovery at ${hz} Hz`, async () => {
  const f = await pair();
  try {
    const first = f.packet(2); f.receive(first);
    const peer = f.viewer.net.peers.get('A');
    const beforePeer = JSON.stringify(peer), beforeBuffer = JSON.stringify(f.viewer.attacker.net.buf);
    const incoming = f.viewer.net.stats.in;
    for (const ts of [1e308, Number.MAX_SAFE_INTEGER, -1, null, '1000.05']) {
      const bad = clone(first); bad.ts = ts; bad.a[0][1] = 40;
      f.receive(bad);
      assert.equal(JSON.stringify(peer), beforePeer, `rejected clock ${String(ts)} changes peer state`);
      assert.equal(JSON.stringify(f.viewer.attacker.net.buf), beforeBuffer);
      assert.equal(f.viewer.net.stats.in, incoming);
    }
    const next = f.packet(7); f.receive(next);
    assert.equal(peer.lastTs, next.ts);
    assert.equal(f.viewer.attacker.net.buf.at(-1).x, 7);
    // Sample the real native sender snapshots through the public remote path.
    for (let i = 0; i <= hz / 20; i++) {
      peer.tr = first.ts + Math.min(i / hz, next.ts - first.ts);
      f.viewer.net._sample(f.viewer.attacker, peer.tr, 1 / hz);
      f.viewer.net.applyRemote(f.viewer.attacker, 1 / hz);
      assert(f.viewer.attacker.pos.toArray().every(Number.isFinite));
      assert.equal(f.viewer.attacker.character.root.visible, true);
    }
    peer.tr = next.ts; f.viewer.net._sample(f.viewer.attacker, peer.tr, 0);
    f.viewer.net.applyRemote(f.viewer.attacker, 1 / hz);
    assert.equal(f.viewer.attacker.pos.x, 7);
    const acceptedBuffer = JSON.stringify(f.viewer.attacker.net.buf);
    f.receive(next); // Replay remains rejected.
    assert.equal(JSON.stringify(f.viewer.attacker.net.buf), acceptedBuffer);
    const forged = f.packet(90); f.viewer.net.onMessage('B', forged);
    assert.equal(JSON.stringify(f.viewer.attacker.net.buf), acceptedBuffer, 'timestamp validity cannot bypass actor ownership');
  } finally { f.dispose(); }
});

test('#1178 invalid first clock cannot create a peer or consume its first normal snapshot', async () => {
  const f = await pair();
  try {
    const first = f.packet(2), invalid = clone(first); invalid.ts = 1e308;
    f.receive(invalid);
    assert.equal(f.viewer.net.peers.has('A'), false);
    assert.equal(f.viewer.attacker.net.buf.length, 0);
    f.receive(first);
    assert.equal(f.viewer.net.peers.get('A').lastTs, first.ts);
    assert.equal(f.viewer.attacker.net.buf.length, 1);
  } finally { f.dispose(); }
});
