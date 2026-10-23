import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOwnerClock, advanceOwnerClock, closeOwnerClock, retireOwnerClock,
  handleOwnerClockMessage, validOwnerClockTick, ownerClockStatus,
  OWNER_CLOCK_PENDING_PACKETS, OWNER_CLOCK_PENDING_BYTES } from '../owner-clock.mjs';
import { validOwnerClockOriginAdvance, validOwnerTickAdvance } from '../snapshot-guard.mjs';

function harness(id = 'match') {
  let at = 92.3055;
  const sent = [], accepted = [];
  const nm = { myId: 'me', cfg: { id }, match: {}, peers: new Map(),
    s: { ownerClockVersion: 1, _members: new Map([['me', 'me'], ['peer', 'peer']]),
      tr: { sendTo(to, data) { sent.push({ to, data }); return true; } } } };
  nm.onMessage = (from, data) => {
    if (handleOwnerClockMessage(nm, from, data, at)) return;
    if (data.k !== 't') return;
    let p = nm.peers.get(from);
    if (!validOwnerClockTick(nm, from, data, at, p)) return;
    if (!p) { p = {}; nm.peers.set(from, p); }
    p.lastTs = data.ts; p.lastReceiveAt = at; accepted.push(data);
  };
  const lastQuery = () => sent.filter(x => x.data.k === 'ocq').at(-1)?.data;
  return { nm, sent, accepted, set(t) { at = t; }, now() { return at; },
    begin() { beginOwnerClock(nm, at); }, retry() { advanceOwnerClock(nm, at); },
    tick(ts, extra = {}) { nm.onMessage('peer', { k: 't', oc: 1, ocm: nm.cfg.id, ts, ...extra }); },
    reply(ts, changes = {}) { const q = lastQuery(); assert.ok(q); nm.onMessage('peer', { ...q, k: 'oca', ts, ...changes }); },
    query: lastQuery, status() { return ownerClockStatus(nm, 'peer'); } };
}

test('#1767 queued first tick catches up against a proven fixed origin, without replaying its events twice', () => {
  const h = harness(); h.begin();
  const initial = { e: [[124.04, 'tr', 17, 'spawn', {}, 1, 1]] };
  h.tick(124.04, initial);
  assert.equal(h.nm.peers.size, 0, 'unproven first snapshot cannot establish a watermark');
  assert.equal(h.status().pendingPackets, 1);
  h.reply(138.3587);
  assert.equal(h.accepted.length, 1);
  assert.deepEqual(h.accepted[0].e, initial.e);
  const origin = h.status().origin;
  h.set(129.6118);
  assert.equal(validOwnerTickAdvance(175.665, 124.04, 129.6118, 92.3055), false, 'original permanent rejection reproduced');
  h.tick(175.665);
  assert.equal(h.nm.peers.get('peer').lastTs, 175.665);
  h.tick(175.665);
  assert.equal(h.accepted.length, 2, 'replay cannot consume the staged event twice');
  assert.deepEqual(h.status().origin, origin, 'catch-up cannot rebase the origin');
});

test('#1767 nonce expiry/retry, late replies and visibility pauses preserve a single bounded origin', () => {
  const h = harness(); h.begin(); const old = h.query();
  h.tick(124.04);
  h.set(h.now() + 14);
  h.reply(138.3587);
  assert.equal(h.status().origin, null, '14-second-old ACK is not a freshness proof');
  h.retry(); const fresh = h.query(); assert.notEqual(fresh.n, old.n);
  h.reply(152.3587, { n: old.n });
  assert.equal(h.status().origin, null, 'late previous nonce cannot initialize the new request');
  h.reply(152.3587);
  const origin = h.status().origin;
  assert.equal(origin.sentAt, h.now());
  h.tick(152.3587);
  h.set(h.now() + 30); // hidden/paused receiver resumes with the sender also advancing
  h.tick(182.3587);
  assert.equal(h.nm.peers.get('peer').lastTs, 182.3587);
  h.reply(1e6, { n: fresh.n });
  assert.deepEqual(h.status().origin, origin, 'an ACK never rebases an established peer epoch');
});

test('#1767 current protocol cannot launder a future leap through a legacy watermark', () => {
  const h = harness(); h.begin();
  h.nm.peers.set('peer', { lastTs: 1000, lastReceiveAt: h.now() });
  h.tick(1014); h.reply(1014);
  assert.equal(h.status().origin, null);
  assert.equal(h.nm.peers.get('peer').lastTs, 1000);
  h.reply(1000);
  const origin = h.status().origin;
  assert.ok(origin);
  h.tick(1014);
  h.nm.onMessage('peer', { k: 't', ts: 1000.05 });
  assert.equal(h.nm.peers.get('peer').lastTs, 1000, 'negotiated peer cannot downgrade to legacy');
  h.set(h.now() + .05); h.tick(1000.05);
  assert.equal(h.nm.peers.get('peer').lastTs, 1000.05);
  h.nm.s.hostId = 'peer';
  h.reply(1e6);
  assert.deepEqual(h.status().origin, origin, 'host ownership migration does not reset owner time');
});

test('#1767 rate-limited same-nonce retry preserves its TTL and queued work until a fresh attempt', () => {
  const h = harness(); h.begin(); const first = h.query();
  h.nm.onMessage('peer', first);
  assert.equal(h.sent.filter(message => message.data.k === 'oca').length, 1);
  h.set(h.now() + .1);
  h.nm.onMessage('peer', first);
  assert.equal(h.sent.filter(message => message.data.k === 'oca').length, 1, 'early repeated query is rate limited');
  h.tick(124.04);
  assert.equal(h.query().n, first.n, 'tick-triggered retransmission retains the original nonce');
  h.set(94.3055); h.retry();
  assert.equal(h.query().n, first.n, 'a retransmit cannot move the original two-second deadline');
  h.set(94.3065); h.retry();
  assert.notEqual(h.query().n, first.n);
  assert.equal(h.status().pendingPackets, 1, 'renewing a nonce preserves staged packet work');
  h.reply(140.3597, { n: first.n });
  assert.equal(h.status().origin, null);
  h.reply(140.3597);
  assert.equal(h.status().origin.sentAt, 94.3065);
  assert.equal(h.accepted.length, 1);
});

test('#1767 a current-session peer cannot opt out by omitting all capability fields and ignoring challenges', () => {
  const h = harness(); h.begin();
  for (let i = 0; i < 30; i++) {
    h.set(92.3055 + i);
    h.nm.onMessage('peer', { k: 't', ts: 1000 + i });
    h.retry();
  }
  assert.equal(h.nm.peers.size, 0);
  assert.equal(h.accepted.length, 0);
  assert.equal(h.status().origin, null);
  assert.equal(h.status().pendingPackets, 0);
  const old = harness(); old.nm.s.ownerClockVersion = undefined;
  old.nm.onMessage('peer', { k: 't', ts: 1000 });
  assert.equal(old.accepted.length, 1, 'explicit older/custom session still uses its unchanged admission');
});

test('#1767 repeated arrivals and replies cannot accumulate five seconds of future credit per packet', () => {
  const h = harness(); h.begin(); h.reply(1000);
  const origin = h.status().origin;
  h.tick(1000);
  for (let i = 1; i <= 100; i++) {
    h.set(92.3055 + i * .05);
    h.tick(1000 + i * .05 + 4.9);
    h.tick(1000 + i * 4);
    h.reply(1000 + i * 4);
  }
  assert.ok(h.nm.peers.get('peer').lastTs <= 1010);
  assert.deepEqual(h.status().origin, origin);
  for (const ts of [Infinity, 1e12, -1, null, '1010']) h.tick(ts);
  h.set(102.3055); h.tick(1010);
  assert.equal(h.nm.peers.get('peer').lastTs, 1010, 'next legal timestamp recovers without resetting proof');
});

test('#1767 cross-match/nonmember/forged replies and disposal cannot create a clock', () => {
  const h = harness(); h.begin(); const q = h.query();
  for (const patch of [{ n: '0'.repeat(32) }, { m: 'other-match' }, { v: 2 }, { ts: '1000' }]) h.reply(1000, patch);
  h.nm.onMessage('unknown', { ...q, k: 'oca', ts: 1000 });
  assert.equal(h.status().origin, null);
  assert.equal(h.nm.peers.size, 0);
  closeOwnerClock(h.nm);
  h.reply(1000); h.tick(1000);
  assert.equal(h.accepted.length, 0);
  const next = harness(); next.begin();
  assert.notEqual(next.query().n, q.n, 'same-ID reconnect needs a fresh unpredictable nonce');
  next.nm.onMessage('peer', { ...q, k: 'oca', ts: 1000 });
  assert.equal(next.status().origin, null);
  next.reply(1000); next.tick(1000);
  assert.equal(next.accepted.length, 1);
  retireOwnerClock(next.nm, 'peer');
  assert.equal(next.status(), null);
});

test('#1767 startup staging is bounded and invalid clocks do not reserve event work', () => {
  const h = harness(); h.begin();
  for (let i = 0; i < OWNER_CLOCK_PENDING_PACKETS + 20; i++) h.tick(1000 + i * .001);
  h.tick(1001, { payload: 'x'.repeat(OWNER_CLOCK_PENDING_BYTES) });
  h.tick(1e12);
  assert.equal(h.status().pendingPackets, OWNER_CLOCK_PENDING_PACKETS);
  assert.ok(h.status().pendingBytes <= OWNER_CLOCK_PENDING_BYTES);
  assert.equal(h.status().dropped, 21);
  h.reply(1001);
  assert.equal(h.status().pendingBytes, 0);
  assert.equal(h.status().pendingPackets, 0);
  assert.equal(h.accepted.length, OWNER_CLOCK_PENDING_PACKETS);
});

test('#1767 fixed-origin guard preserves arbitrary peer offsets and rejects nonmonotonic/nonfinite time', () => {
  assert.equal(validOwnerClockOriginAdvance(175.665, 124.04, 129.6118, 138.3587, 92.3055), true);
  assert.equal(validOwnerClockOriginAdvance(1014, 1000, 0, 1000, 0), false);
  assert.equal(validOwnerClockOriginAdvance(1000, undefined, 50, 1000, 50), true);
  for (const args of [[1000, 1000, 50, 1000, 50], [999, 1000, 50, 1000, 50],
    [1001, 1000, 49, 1000, 50], [1001, 1000, NaN, 1000, 50], [1001, 1000, 50, Infinity, 50]])
    assert.equal(validOwnerClockOriginAdvance(...args), false);
});
