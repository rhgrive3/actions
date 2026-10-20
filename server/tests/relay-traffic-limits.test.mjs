// #1645: one joined peer must not be able to amplify arbitrary bytes to the
// room. Frame size, sender rate, envelope shape and recipient backlog are all
// bounded before fan-out, and only the misbehaving sender is removed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { roomWith } from './relay-fixture.mjs';

const MAX_FRAME_BYTES = 64 * 1024;
const frame = obj => 'b|' + JSON.stringify(obj);
const clockAt = (t, start = 1_000_000) => {
  const clock = { now: start };
  t.mock.method(Date, 'now', () => clock.now);
  return clock;
};
// A JSON broadcast whose whole "b|..." frame is exactly `bytes` UTF-8 bytes.
function frameOfBytes(bytes) {
  const head = 'b|{"k":"x","p":"', tail = '"}';
  return head + 'a'.repeat(bytes - head.length - tail.length) + tail;
}

test('a frame over 64 KiB is never relayed and closes only its sender', () => {
  const { room, sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  guest.emit('message', frameOfBytes(MAX_FRAME_BYTES + 1));
  assert.equal(guest.closed?.code, 1009);
  assert.equal(host.relayed().length, 0);
  assert.equal(other.relayed().length, 0);
  assert.equal(host.closed, null);
  assert.equal(other.closed, null);
  assert.ok(!room.members.has(guest.id));
});

test('the limit is in UTF-8 bytes, not UTF-16 code units', () => {
  const { sockets: [host, guest] } = roomWith('H', 'G');
  // 30,000 code units but 90,000 bytes: under a code-unit limit, over the byte limit.
  const wide = 'b|' + JSON.stringify({ k: 'x', p: '日'.repeat(30000) });
  assert.ok(wide.length < MAX_FRAME_BYTES);
  guest.emit('message', wide);
  assert.equal(guest.closed?.code, 1009);
  assert.equal(host.relayed().length, 0);
});

test('a frame of exactly 64 KiB is relayed byte for byte', () => {
  const { sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  const exact = frameOfBytes(MAX_FRAME_BYTES);
  assert.equal(new TextEncoder().encode(exact).byteLength, MAX_FRAME_BYTES);
  guest.emit('message', exact);
  assert.equal(guest.closed, null);
  assert.deepEqual(host.relayed(), ['m|' + guest.id + '|' + exact.slice(2)]);
  assert.deepEqual(other.relayed(), host.relayed());
});

test('directed frames obey the same size limit', () => {
  const { sockets: [host, guest] } = roomWith('H', 'G');
  guest.emit('message', 's|' + host.id + '|' + frameOfBytes(MAX_FRAME_BYTES + 100).slice(2));
  assert.equal(guest.closed?.code, 1009);
  assert.equal(host.relayed().length, 0);
});

test('only recognised JSON object envelopes with a short string kind are relayed', () => {
  const { sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  const rejected = [
    'b|not-json', 'b|', 'b|{', 'b|[]', 'b|null', 'b|"str"', 'b|123', 'b|true', 'b|{}', 'b|{"x":1}',
    'b|{"k":1}', 'b|{"k":null}', 'b|{"k":""}', 'b|{"k":["t"]}', 'b|{"k":"' + 'a'.repeat(33) + '"}',
    'b| {"k":"t"}', 'b|[{"k":"t"}]',
    's|' + other.id + '|{"k":null}', 's|' + other.id + '|garbage', 's|' + other.id + '|', 's|' + other.id,
  ];
  for (const bad of rejected) guest.emit('message', bad);
  assert.equal(host.relayed().length, 0);
  assert.equal(other.relayed().length, 0);
  assert.equal(guest.closed, null, 'small malformed frames are dropped, not punished one by one');
  guest.emit('message', frame({ k: 't', ts: 1, a: [[1, 2, 3]] }));
  guest.emit('message', 's|' + other.id + '|{"k":"hit","seq":1}');
  assert.deepEqual(host.relayed(), ['m|' + guest.id + '|{"k":"t","ts":1,"a":[[1,2,3]]}']);
  assert.deepEqual(other.relayed(), [
    'm|' + guest.id + '|{"k":"t","ts":1,"a":[[1,2,3]]}',
    'm|' + guest.id + '|{"k":"hit","seq":1}',
  ]);
});

test('binary frames are not part of the protocol and close their sender', () => {
  const { sockets: [host, guest] } = roomWith('H', 'G');
  guest.emit('message', new Uint8Array(1024));
  assert.equal(guest.closed?.code, 1003);
  assert.equal(host.relayed().length, 0);
  assert.equal(host.closed, null);
});

test('an instantaneous frame flood closes the flooder after its burst, not its peers', t => {
  clockAt(t);
  const { sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  let sent = 0;
  while (!guest.closed && sent < 5000) { guest.emit('message', frame({ k: 's', n: sent })); sent++; }
  assert.equal(guest.closed?.code, 1008);
  assert.ok(sent >= 100 && sent <= 400, `burst allowance is bounded (${sent})`);
  assert.equal(host.relayed().length, other.relayed().length);
  assert.ok(host.relayed().length <= 200, 'forwarding stopped at the burst, not at the end of the flood');
  assert.equal(host.closed, null);
  assert.equal(other.closed, null);
});

test('a byte flood is stopped by the byte budget even when the frame count is low', t => {
  clockAt(t);
  const { sockets: [host, guest] } = roomWith('H', 'G');
  const big = frameOfBytes(60 * 1024);
  let sent = 0;
  while (!guest.closed && sent < 200) { guest.emit('message', big); sent++; }
  assert.equal(guest.closed?.code, 1008);
  assert.ok(sent < 20, `byte burst is bounded (${sent} frames of 60 KiB)`);
  assert.equal(host.relayed().length, sent - 1);
});

test('ping flooding is limited like any other frame', t => {
  clockAt(t);
  const { sockets: [, guest] } = roomWith('H', 'G');
  for (let i = 0; i < 5000 && !guest.closed; i++) guest.emit('message', 'ping');
  assert.equal(guest.closed?.code, 1008);
});

test('legitimate 20 Hz traffic from every seat of an 8-player room is never limited', t => {
  const clock = clockAt(t);
  const { sockets } = roomWith('H', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8');
  // One minute of play. Every 50 ms each seat sends a ~8 KiB tick (host-sized: 8 actors and a boss snapshot);
  // once per second a 40 KiB burst frame (the heaviest special-event tick measured for an 8-owner room);
  // every 2 s a ping.
  const tick = frameOfBytes(8 * 1024), spike = frameOfBytes(40 * 1024);
  for (let i = 0; i < 20 * 60; i++) {
    clock.now += 50;
    for (const ws of sockets) {
      ws.emit('message', i % 20 === 0 ? spike : tick);
      if (i % 40 === 0) ws.emit('message', 'ping');
    }
  }
  assert.deepEqual(sockets.map(ws => ws.closed), Array(8).fill(null));
  const expected = 20 * 60 * 7;
  for (const ws of sockets) assert.equal(ws.relayed().length, expected);
});

test('a flooder that was removed leaves the room usable and host migration intact', t => {
  clockAt(t);
  const { room, sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  for (let i = 0; i < 5000 && !host.closed; i++) host.emit('message', frame({ k: 's' }));
  assert.equal(host.closed?.code, 1008);
  assert.equal(room.hostId, guest.id, 'a new host is elected when the flooding host is removed');
  assert.deepEqual(JSON.parse(other.sent.at(-1)), { t: 'leave', id: host.id, host: guest.id });
  const before = other.relayed().length;
  guest.emit('message', frame({ k: 't', ts: 2 }));
  assert.equal(other.relayed().length, before + 1);
  guest.emit('message', '{"t":"lock","v":true}');
  assert.equal(room.locked, true, 'the elected host can still lock');
});

test('quota refills with time, so a sustained moderate sender keeps its seat', t => {
  const clock = clockAt(t);
  const { sockets: [, guest] } = roomWith('H', 'G');
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < 100; i++) guest.emit('message', frame({ k: 's' }));
    clock.now += 4000; // a pause longer than the refill window
  }
  assert.equal(guest.closed, null);
});

test('a recipient whose socket backlog exceeds the cap is dropped, never fed further', () => {
  const { room, sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  host.bufferedAmount = 1024 * 1024;
  const before = host.sent.length;
  guest.emit('message', frame({ k: 't' }));
  assert.equal(host.sent.length, before, 'nothing is queued on the backed-up socket');
  assert.equal(host.closed?.code, 1013);
  assert.equal(other.relayed().length, 1, 'healthy peers still receive it');
  assert.equal(guest.closed, null, 'the sender is not punished for a slow recipient');
  assert.ok(!room.members.has(host.id));
});

test('a socket that throws on send does not stop fan-out to the rest of the room', () => {
  const { sockets: [host, guest, other] } = roomWith('H', 'G', 'O');
  host.send = () => { throw new Error('socket is gone'); };
  guest.emit('message', frame({ k: 't' }));
  assert.equal(other.relayed().length, 1);
});
