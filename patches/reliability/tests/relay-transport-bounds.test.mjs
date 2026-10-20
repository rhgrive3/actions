// #1645 (client half): Transport must not hand the relay a frame the relay will
// refuse (it would drop this player), must not pile data behind a stalled socket,
// and must not parse unbounded inbound frames. Runs the real adapted Transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './net-fixture.mjs';

const MAX_BYTES = 64 * 1024, MAX_BACKLOG = 512 * 1024;
const utf8 = s => new TextEncoder().encode(s).byteLength;

async function connected() {
  const f = await fixture();
  const tr = new f.Transport();
  const delivered = [];
  tr.onMessage = (from, obj) => delivered.push({ from, obj });
  const pending = tr.connect('BC235', 'Player', false);
  const socket = f.sockets.at(-1);
  f.welcome(socket, { id: 'me', host: 'host', members: [{ id: 'host', name: 'H' }, { id: 'me', name: 'P' }] });
  await pending;
  socket.sent.length = 0; // the first heartbeat is not under test
  return { f, tr, socket, delivered };
}
// A broadcast object whose "b|<json>" frame is exactly `bytes` UTF-8 bytes.
function objectOfBytes(bytes, filler = 'a') {
  const overhead = utf8('b|' + JSON.stringify({ k: 'x', p: '' }));
  const width = utf8(filler);
  const count = Math.floor((bytes - overhead) / width);
  const obj = { k: 'x', p: filler.repeat(count) };
  return { obj, bytes: utf8('b|' + JSON.stringify(obj)) };
}

test('a frame over 64 KiB of UTF-8 is refused locally and never reaches the socket', async () => {
  const { tr, socket } = await connected();
  const { obj, bytes } = objectOfBytes(MAX_BYTES + 1);
  assert.equal(bytes, MAX_BYTES + 1);
  const bytesOut = tr.bytesOut;
  assert.equal(tr.broadcast(obj), false);
  assert.equal(tr.sendTo('host', obj), false);
  assert.deepEqual(socket.sent, []);
  assert.equal(tr.bytesOut, bytesOut, 'refused frames are not counted as sent');
});

test('the local bound is in UTF-8 bytes: a frame under 64 Ki UTF-16 units can still be too big', async () => {
  const { tr, socket } = await connected();
  const wide = { k: 'x', p: '日'.repeat(30000) };
  const text = 'b|' + JSON.stringify(wide);
  assert.ok(text.length < MAX_BYTES && utf8(text) > MAX_BYTES);
  assert.equal(tr.broadcast(wide), false, 'the relay would close this sender for it');
  assert.deepEqual(socket.sent, []);
  // Astral characters (surrogate pairs) are counted as 4 bytes.
  const astral = { k: 'x', p: '𝟘'.repeat(17000) };
  assert.ok(utf8('b|' + JSON.stringify(astral)) > MAX_BYTES);
  assert.equal(tr.broadcast(astral), false);
});

test('a frame of exactly 64 KiB is sent, byte for byte', async () => {
  const { tr, socket } = await connected();
  for (const filler of ['a', '日']) {
    const { obj, bytes } = objectOfBytes(MAX_BYTES, filler);
    if (bytes !== MAX_BYTES) { // pad with ASCII to land exactly on the limit
      obj.p += 'a'.repeat(MAX_BYTES - bytes);
    }
    assert.equal(utf8('b|' + JSON.stringify(obj)), MAX_BYTES);
    socket.sent.length = 0;
    assert.equal(tr.broadcast(obj), true, `${filler}`);
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.sent[0], 'b|' + JSON.stringify(obj));
  }
});

test('nothing is queued onto a socket whose send backlog is over 512 KiB, and sending resumes when it drains', async () => {
  const { tr, socket } = await connected();
  socket.bufferedAmount = MAX_BACKLOG;
  assert.equal(tr.broadcast({ k: 't' }), true, 'exactly at the cap is still allowed');
  socket.bufferedAmount = MAX_BACKLOG + 1;
  const before = socket.sent.length, bytesOut = tr.bytesOut;
  assert.equal(tr.broadcast({ k: 't' }), false);
  assert.equal(tr.sendTo('host', { k: 'hit', seq: 1 }), false);
  assert.equal(tr.lock(true), false);
  assert.equal(socket.sent.length, before);
  assert.equal(tr.bytesOut, bytesOut);
  socket.bufferedAmount = 0;
  assert.equal(tr.broadcast({ k: 't' }), true);
});

test('an unavailable socket still refuses, and ordinary small frames are unaffected', async () => {
  const { tr, socket } = await connected();
  assert.equal(tr.broadcast({ k: 't', a: [[1, 2, 3]] }), true);
  assert.equal(tr.sendTo('host', { k: 'me', name: 'P' }), true);
  assert.equal(tr.lock(false), true);
  assert.equal(socket.sent.length, 3);
  socket.readyState = 3;
  assert.equal(tr.broadcast({ k: 't' }), false);
});

test('inbound relay frames over the bound are dropped without being parsed or delivered', async () => {
  const { f, socket, delivered, tr } = await connected();
  const parse = JSON.parse; let parsedLarge = 0;
  const limit = MAX_BYTES + 64;
  const frame = n => 'm|host|' + JSON.stringify({ k: 't', p: 'a'.repeat(n - 'm|host|{"k":"t","p":""}'.length) });
  const atLimit = frame(limit), over = frame(limit + 1);
  assert.equal(atLimit.length, limit);
  // Spy through the context's JSON global that the transport actually uses.
  const realJSON = f.context.JSON;
  f.context.JSON = { ...realJSON, parse: (text, ...rest) => { if (typeof text === 'string' && text.length > MAX_BYTES) parsedLarge++; return parse(text, ...rest); } };
  try {
    f.message(socket, over);
    assert.deepEqual(delivered, []);
    assert.equal(parsedLarge, 0, 'oversized frames never reach JSON.parse');
    f.message(socket, atLimit);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].from, 'host');
  } finally { f.context.JSON = realJSON; }
  assert.equal(tr.open, true, 'an oversized frame does not tear the connection down');
});

test('an oversized welcome cannot settle the handshake', async () => {
  const f = await fixture();
  const tr = new f.Transport();
  let settled = false;
  const pending = tr.connect('BC235', 'Player', false);
  pending.then(() => { settled = true; }, () => { settled = true; });
  const socket = f.sockets.at(-1);
  const members = Array.from({ length: 7 }, (_, i) => ({ id: 'p' + i, name: 'x'.repeat(20000) }));
  f.message(socket, { t: 'welcome', id: 'p0', host: 'p0', members });
  await Promise.resolve();
  assert.equal(settled, false);
  f.welcome(socket, { id: 'p0', host: 'p0' });
  assert.equal((await pending).id, 'p0');
});
