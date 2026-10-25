import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';
import { fixture as networkFixture } from './net-fixture.mjs';

// This bridge executes the adapted production Transport parser and the complete
// build-composed receiver. WebSocket, timers, scene, physics, paint and audio are
// fixture boundaries: this is not a live-network or real-server integration test.
async function setup() {
  const f = await fixture({ productionComposition: true });
  const nf = await networkFixture();
  const tr = new nf.Transport();
  const pending = tr.connect('BCEFG', 'test', true);
  const ws = nf.sockets.at(-1);
  nf.message(ws, {
    t: 'welcome', proto: nf.PROTO, compat: nf.COMPAT, id: 'p1', host: 'p1',
    members: [{ id: 'p1', name: 'a' }, { id: 'p2', name: 'b' }], relayClock: 1,
  });
  await pending;
  const session = f.makeSession();
  session.ownerClockVersion = 1;
  session.tr = tr;
  const sent = [];
  const send = tr.sendTo.bind(tr);
  tr.sendTo = (to, data) => { sent.push({ to, data }); return send(to, data); };
  f.clock.set(100);
  const nm = f.makeNetMatch(session);
  const actor = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  nm.bind({ actors: [actor], state: 'playing', time: 180 });
  tr.onMessage = (from, data) => nm.onMessage(from, data);
  const tick = (ts, x, extra = {}) => ({
    k: 't', oc: 1, ocm: 'fixture-match', ts, u: Math.floor(ts * 60),
    a: [f.packActor(actor, { x, f: 17 })], l: { 17: 0 }, ...extra,
  });
  const deliver = (data, receipt) => nf.message(ws, `m|p2|@${receipt}|${JSON.stringify(data)}`);
  const query = () => {
    const request = sent.filter(({ to, data }) => to === 'p2' && data.k === 'ocq').at(-1);
    assert.ok(request, 'receiver must issue a clock challenge through Transport');
    return request.data;
  };
  return { f, nm, actor, session, tr, tick, deliver, query,
    close() { nm.dispose(); tr.close(); } };
}

test('relay-clock bridge preserves distinct queued receipts and rejects forged progress while allowing genuine delayed catch-up', async () => {
  const h = await setup();
  try {
    h.deliver(h.tick(80, 1), 1700000000000);
    h.deliver(h.tick(100, 2), 1700000020000);
    assert.equal(h.nm.peers.has('p2'), false, 'ticks remain queued until challenge acknowledgement');
    const before = h.nm.stats.in;
    h.deliver({ ...h.query(), k: 'oca', ts: 100 }, 1700000020000);
    assert.equal(h.nm.stats.in - before, 2, 'both queued ticks retain their distinct receipt times through admission copies');
    assert.equal(h.nm.peers.get('p2').lastTs, 100);
    assert.equal(h.actor.net.buf.at(-1).x, 2);
    assert.equal(h.tr.relayReceipt('p2'), null, 'receipt is scoped to synchronous dispatch');

    const buffer = JSON.stringify(h.actor.net.buf);
    h.f.clock.advance(6);
    h.deliver(h.tick(106, 99, { relayAt: 1700000026000, receipt: 1700000026000 }), 1700000020000);
    assert.equal(h.nm.peers.get('p2').lastTs, 100, 'sender fields cannot forge progress beyond the relay anchor');
    assert.equal(JSON.stringify(h.actor.net.buf), buffer);
    h.deliver(h.tick(106, 3), 1700000026000);
    assert.equal(h.nm.peers.get('p2').lastTs, 106, 'genuine relay-clock progress permits delayed catch-up');
    assert.equal(h.actor.net.buf.at(-1).x, 3);
    assert.equal(h.tr.relayReceipt('p2'), null);
  } finally { h.close(); }
});

test('relay-clock bridge invalidates queued receipts and nonce across leave and same-member reentry', async () => {
  const h = await setup();
  try {
    h.deliver(h.tick(80, 99), 1700000000000);
    const old = h.query();
    h.nm.onLeave('p2', false);
    h.actor.owner = 'p2';
    h.deliver({ ...old, k: 'oca', ts: 100 }, 1700000020000);
    assert.equal(h.nm.peers.has('p2'), false);

    h.session._members.set('p2', 'rejoined');
    h.deliver(h.tick(100, 2), 1700000020000);
    const fresh = h.query();
    assert.notEqual(fresh.n, old.n, 'reentry requires a new challenge nonce');
    h.deliver({ ...old, k: 'oca', ts: 100 }, 1700000020000);
    assert.equal(h.nm.peers.has('p2'), false, 'old nonce cannot acknowledge the new queue');
    const before = h.nm.stats.in;
    h.deliver({ ...fresh, k: 'oca', ts: 100 }, 1700000020000);
    assert.equal(h.nm.peers.get('p2').lastTs, 100);
    assert.equal(h.nm.stats.in - before, 1, 'old queued tick is not replayed');
  } finally { h.close(); }
});
