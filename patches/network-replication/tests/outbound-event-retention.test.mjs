// #1692: the owner's queued event rows (NetMatch.out) must survive a frame the
// Transport refuses, and one tick must never carry more than the recipient row
// cap or the relay frame budget. Runs the real production-composed NetMatch; the
// transport is a stub that applies the same acceptance rules as Transport._raw
// (frame <= 64 KiB of UTF-8, or refuses on request).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { MAX_ROWS_PER_TICK, MAX_QUEUED_ROWS, OUTBOUND_ROW_BUDGET_BYTES } from '../outbound-queue.mjs';

const FRAME_BYTES = 64 * 1024;
const utf8 = s => new TextEncoder().encode(s).byteLength;

async function sender({ actors = 1, ranked = false } = {}) {
  const f = await fixture({ productionComposition: true, rankedNetwork: ranked });
  const members = Array.from({ length: 8 }, (_, i) => ['p' + i, 'P' + i]);
  const session = f.makeSession('p0', 'p0', members);
  const wire = { frames: [], refused: 0, accept: () => true, frameLimit: FRAME_BYTES };
  session.tr = {
    broadcast(d) {
      const text = JSON.stringify(d);
      this.refused = null;
      if (utf8('b|' + text) > wire.frameLimit) { wire.refused++; this.refused = 'size'; return false; }
      if (!wire.accept(d, text)) { wire.refused++; return false; }
      wire.frames.push(JSON.parse(text));
      return true;
    },
    sendTo() { return true; },
  };
  const nm = f.makeNetMatch(session, { id: 'retain' });
  f.bind(nm, Array.from({ length: actors }, (_, i) => f.makeActor({ nid: i, owner: 'p0', remote: false, roller: false, team: i % 2 })));
  const tick = () => { f.clock.advance(0.05); nm._sendTick(); };
  const rec = (n, pad = '') => { for (let i = 0; i < n; i++) nm._rec(['test', rec.next++, pad]); };
  rec.next = 0;
  return { f, nm, wire, session, tick, rec };
}
const ids = rows => Array.from(rows, r => r[2]); // Array.from: nm.out lives in the VM realm
const sent = wire => wire.frames.flatMap(frame => frame.e || []);
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test('a refused frame keeps every queued row, in order, and a later accepted tick delivers each exactly once', async () => {
  const { nm, wire, tick, rec } = await sender();
  rec(5);
  const queued = nm.out.slice();
  wire.accept = () => false;
  tick(); tick();
  assert.equal(wire.frames.length, 0);
  assert.deepEqual(nm.out, queued, 'rows are retained untouched, not cleared');
  wire.accept = () => true;
  tick();
  assert.deepEqual(ids(wire.frames.at(-1).e), range(0, 5));
  assert.equal(wire.frames.at(-1).r, 2);
  assert.equal(nm.out.length, 0, 'removed only after the transport accepted the frame');
  tick();
  assert.equal(wire.frames.at(-1).e, undefined, 'nothing is resent');
  assert.deepEqual(ids(sent(wire)), range(0, 5));
});

test('an accepted frame behaves as before: one frame carries the rows and the queue empties', async () => {
  const { nm, wire, tick, rec } = await sender();
  rec(3);
  tick();
  assert.equal(wire.frames.length, 1);
  assert.deepEqual(ids(wire.frames[0].e), [0, 1, 2]);
  assert.equal(nm.out.length, 0);
});

test('rows recorded while the tick is being built are neither lost on refusal nor duplicated on success', async () => {
  for (const accept of [false, true]) {
    const { nm, wire, tick, rec } = await sender();
    rec(2);
    wire.accept = () => { nm._rec(['test', 100, 'late']); return accept; };
    tick();
    if (accept) assert.deepEqual(ids(sent(wire)), [0, 1]);
    assert.deepEqual(ids(nm.out), accept ? [100] : [0, 1, 100], `accepted=${accept}`);
    wire.accept = () => true;
    tick();
    assert.deepEqual(ids(sent(wire)), accept ? [0, 1, 100] : [0, 1, 100]);
    assert.equal(nm.out.length, 0);
  }
});

test('a tick never carries more rows than the recipient accepts; the tail follows on later ticks in order', async () => {
  assert.equal(MAX_ROWS_PER_TICK, 256, 'recipients truncate longer event lists');
  const { nm, wire, tick, rec } = await sender();
  rec(600);
  const stamps = [];
  for (let i = 0; i < 6; i++) { tick(); stamps.push(wire.frames.at(-1)?.ts); }
  assert.deepEqual(wire.frames.map(f => (f.e || []).length), [256, 256, 88, 0, 0, 0]);
  assert.deepEqual(ids(sent(wire)), range(0, 600), 'exact order, exactly once');
  assert.equal(nm.out.length, 0);
  assert.ok(stamps.every((t, i) => i === 0 || t > stamps[i - 1]), 'every tick has a new timestamp; one tick is never split into equal-timestamp packets');
});

test('the prefix is chosen so the whole frame fits the relay budget without any refusal', async () => {
  const { nm, wire, tick, rec } = await sender({ actors: 8 });
  rec(100, 'x'.repeat(2000));
  for (let i = 0; i < 8; i++) tick();
  assert.equal(wire.refused, 0, 'the budget is respected up front');
  assert.deepEqual(ids(sent(wire)), range(0, 100));
  for (const frame of wire.frames) assert.ok(utf8('b|' + JSON.stringify(frame)) <= FRAME_BYTES);
  assert.ok(wire.frames.filter(f => f.e).length >= 4, 'the queue needed several ticks');
  assert.equal(nm.out.length, 0);
});

test('the budget counts UTF-8 bytes, not UTF-16 units', async () => {
  const { wire, tick, rec } = await sender({ actors: 8 });
  rec(60, '日本語'.repeat(500)); // 1,500 code units but 4,500 bytes per row
  for (let i = 0; i < 8; i++) tick();
  assert.equal(wire.refused, 0);
  assert.deepEqual(ids(sent(wire)), range(0, 60));
  for (const frame of wire.frames) assert.ok(utf8('b|' + JSON.stringify(frame)) <= FRAME_BYTES);
});

test('a transport with a tighter size limit than our estimate: the batch shrinks, nothing is lost, and it recovers', async () => {
  const { nm, wire, tick, rec } = await sender();
  rec(200, 'x'.repeat(500));
  wire.frameLimit = 12 * 1024; // refuses the ~48 KiB first batch
  const outcome = [];
  for (let i = 0; i < 24; i++) { const before = wire.frames.length; tick(); outcome.push(wire.frames.length > before ? (wire.frames.at(-1).e?.length ?? 0) : 'refused'); }
  assert.ok(outcome.filter(b => b === 'refused').length <= 8, `converges rather than oscillating: ${outcome}`);
  assert.deepEqual(ids(sent(wire)), range(0, 200), 'every row delivered once, in order');
  assert.equal(nm.out.length, 0);
  wire.frameLimit = FRAME_BYTES;
  rec(2000);
  for (let i = 0; i < 40; i++) tick();
  assert.equal(Math.max(...wire.frames.map(f => f.e?.length || 0)), 256, 'the batch size recovers once the transport accepts larger frames again');
  assert.deepEqual(ids(sent(wire)), range(0, 2200));
});

test('refusals that are not about size (backlog, closed socket) never shrink the batch', async () => {
  const { nm, wire, session, tick, rec } = await sender();
  rec(100);
  wire.accept = () => false; // the stub reports no size reason, like a backlog refusal
  for (let i = 0; i < 6; i++) tick();
  assert.equal(nm.out.length, 100);
  wire.accept = () => true;
  tick();
  assert.equal(wire.frames.at(-1).e.length, 100, 'the whole queue goes out in one frame once the transport is ready');
  void session;
});

test('an unavailable or throwing transport keeps the rows', async () => {
  const { nm, session, wire, tick, rec } = await sender();
  rec(4);
  const transport = session.tr;
  session.tr = null;
  tick();
  assert.deepEqual(ids(nm.out), [0, 1, 2, 3], 'no transport: retained');
  session.tr = { broadcast() { throw new Error('socket exploded'); }, sendTo() { return true; } };
  assert.throws(() => tick(), /socket exploded/);
  assert.deepEqual(ids(nm.out), [0, 1, 2, 3], 'a throwing send does not eat the queue');
  session.tr = transport;
  tick();
  assert.deepEqual(ids(sent(wire)), [0, 1, 2, 3]);
});

test('a stub transport that returns nothing is treated as accepting, as before', async () => {
  const { nm, session, tick, rec } = await sender();
  const frames = [];
  session.tr = { broadcast(d) { frames.push(d); }, sendTo() {} };
  rec(3);
  tick();
  assert.equal(frames.at(-1).e.length, 3);
  assert.equal(nm.out.length, 0);
});

test('retention is bounded: the oldest rows are dropped and counted, the newest kept', async () => {
  const { nm, wire, tick, rec } = await sender();
  rec(MAX_QUEUED_ROWS + 904);
  wire.accept = () => false;
  tick();
  assert.equal(nm.out.length, MAX_QUEUED_ROWS);
  assert.equal(nm.out[0][2], 904);
  assert.equal(nm.out.at(-1)[2], MAX_QUEUED_ROWS + 903);
  assert.equal(nm.stats.outDropped, 904);
});

test('a single row that can never fit is dropped and counted, and does not block the rows behind it', async () => {
  const { nm, wire, tick, rec } = await sender();
  rec(2);
  nm._rec(['test', 50, 'y'.repeat(OUTBOUND_ROW_BUDGET_BYTES + 1)]);
  rec.next = 51;
  rec(2);
  tick();
  assert.deepEqual(ids(sent(wire)), [0, 1, 51, 52]);
  assert.equal(nm.stats.outDropped, 1);
  assert.equal(nm.out.length, 0);
});

test('a guest ranked throw edge is not consumed by a refused frame', async () => {
  const { f, nm, wire, session, tick } = await sender({ ranked: true });
  Object.assign(session, { myId: 'p1', isHost: false, hostId: 'p0' });
  const local = nm.byNid.get(0);
  Object.assign(local, { owner: 'p1', remote: false, _rankedThrowPending: true, nid: 0 });
  nm.match.local = local;
  nm.match.ranked = { snapshot: () => ({}) };
  assert.equal(nm._rankedAPI.G.netm, nm);
  wire.accept = () => false;
  tick();
  assert.equal(wire.frames.length, 0);
  assert.equal(local._rankedThrowPending, true, 'the throw is still owed to the host');
  wire.accept = () => true;
  tick();
  assert.equal(wire.frames.at(-1).rki.throw, true, 'delivered on the next accepted tick');
  assert.equal(local._rankedThrowPending, false, 'consumed only once delivered');
  tick();
  assert.equal(wire.frames.at(-1).rki.throw, false, 'and only once');
  void f;
});
