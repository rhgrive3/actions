// #1692 end to end: the production-composed NetMatch._sendTick driving the real,
// adapted Transport (only the browser WebSocket is a fake). A frame the Transport
// refuses must not cost the sender its queued rows, whatever the refusal reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { MAX_ROWS_PER_TICK, OUTBOUND_FRAME_BYTES } from '../outbound-queue.mjs';

const utf8 = s => new TextEncoder().encode(s).byteLength;
const ids = rows => Array.from(rows, r => r[2]);
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

async function sender() {
  const f = await fixture({ productionComposition: true, includeSession: true });
  const session = f.makeSession('p0', 'p0', Array.from({ length: 8 }, (_, i) => ['p' + i, 'P' + i]));
  const transport = new f.Transport();
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(x) { this.sent.push(x); } };
  transport.ws = socket;
  session.tr = transport;
  const nm = f.makeNetMatch(session, { id: 'real-transport' });
  f.bind(nm, Array.from({ length: 8 }, (_, i) => f.makeActor({ nid: i, owner: 'p0', remote: false, roller: false, team: i % 2 })));
  let next = 0;
  const rec = (n, pad = '') => { for (let i = 0; i < n; i++) nm._rec(['test', next++, pad]); };
  const tick = () => { f.clock.advance(0.05); nm._sendTick(); };
  // Rows as the relay would forward them: only 'b|' frames carry ticks.
  const frames = () => socket.sent.filter(x => x.startsWith('b|')).map(x => JSON.parse(x.slice(2)));
  const rows = () => frames().flatMap(frame => frame.e || []);
  return { f, nm, transport, socket, rec, tick, frames, rows };
}

test('the shared constants agree: queue frame budget equals the transport and relay limit', async () => {
  const { f } = await sender();
  assert.equal(OUTBOUND_FRAME_BYTES, 64 * 1024);
  // The Transport refuses exactly the frames the queue budgets for.
  const transport = new f.Transport();
  transport.ws = { readyState: 1, bufferedAmount: 0, send() {} };
  assert.equal(transport.broadcast({ k: 'x', p: 'a'.repeat(OUTBOUND_FRAME_BYTES - 18) }), true);   // 'b|' + {"k":"x","p":""} is 18 bytes
  assert.equal(transport.broadcast({ k: 'x', p: 'a'.repeat(OUTBOUND_FRAME_BYTES - 17) }), false);
  assert.equal(transport.refused, 'size');
});

test('a send backlog past the cap refuses the frame, and every row is delivered once the socket drains', async () => {
  const { nm, transport, socket, rec, tick, rows, frames } = await sender();
  rec(40);
  socket.bufferedAmount = 600 * 1024;
  tick(); tick();
  assert.equal(transport.refused, 'backlog');
  assert.equal(frames().length, 0, 'nothing reached the socket');
  assert.equal(nm.out.length, 40, 'the rows are still queued');
  socket.bufferedAmount = 0;
  tick();
  assert.deepEqual(ids(rows()), range(0, 40));
  assert.equal(nm.out.length, 0);
});

test('a closed socket keeps the rows for later', async () => {
  const { nm, transport, socket, rec, tick, rows } = await sender();
  rec(10);
  socket.readyState = 3;
  tick();
  assert.equal(transport.refused, 'closed');
  assert.equal(nm.out.length, 10);
  socket.readyState = 1;
  tick();
  assert.deepEqual(ids(rows()), range(0, 10));
});

test('rows larger than one frame go out over several ticks without the transport ever refusing', async () => {
  const { nm, transport, socket, rec, tick, rows, frames } = await sender();
  rec(90, 'x'.repeat(2000));   // ~180 KB of events for eight actors
  for (let i = 0; i < 8; i++) tick();
  assert.equal(frames().filter(frame => frame.e).length >= 4, true);
  for (const x of socket.sent.filter(y => y.startsWith('b|'))) assert.ok(utf8(x) <= OUTBOUND_FRAME_BYTES, 'every frame fits the relay limit');
  assert.equal(transport.refused, null);
  assert.deepEqual(ids(rows()), range(0, 90), 'exact order, exactly once');
  assert.equal(nm.out.length, 0);
});

test('a burst of more rows than a recipient accepts is split over ticks, each within the row cap', async () => {
  const { rec, tick, rows, frames } = await sender();
  rec(700);
  for (let i = 0; i < 5; i++) tick();
  assert.ok(frames().every(frame => (frame.e || []).length <= MAX_ROWS_PER_TICK));
  assert.deepEqual(ids(rows()), range(0, 700));
});

test('non-ASCII rows are budgeted in UTF-8 bytes against the real transport', async () => {
  const { transport, socket, rec, tick, rows } = await sender();
  rec(40, '日本語'.repeat(600));  // 1,800 code units, 5,400 bytes per row
  for (let i = 0; i < 8; i++) tick();
  assert.equal(transport.refused, null);
  for (const x of socket.sent.filter(y => y.startsWith('b|'))) assert.ok(utf8(x) <= OUTBOUND_FRAME_BYTES);
  assert.deepEqual(ids(rows()), range(0, 40));
});
