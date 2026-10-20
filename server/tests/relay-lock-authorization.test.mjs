// #1644: the room join lock is host-only. Guests (and sockets that have left or
// lost host status) must not be able to open or close the room.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeSocket, RoomDurableObject, connect, roomWith } from './relay-fixture.mjs';

const lock = v => JSON.stringify({ t: 'lock', v });

test('a guest cannot lock the room, so a third client still joins during the lobby', async () => {
  const { room, sockets: [host, guest] } = roomWith('H', 'G');
  guest.emit('message', lock(true));
  assert.equal(room.locked, false, 'guest lock must not change room state');
  const third = await connect(room, 'BCEFG', { name: 'T' });
  assert.ok(third.socket.control('welcome'), 'third client is welcomed');
  assert.equal(third.socket.control('err'), null, 'no "Match in progress" refusal');
  assert.equal(room.members.size, 3);
  assert.equal(host.closed, null);
});

test('a guest cannot unlock a room the host locked for a running match', async () => {
  const { room, sockets: [host, guest] } = roomWith('H', 'G');
  host.emit('message', lock(true));
  assert.equal(room.locked, true);
  guest.emit('message', lock(false));
  assert.equal(room.locked, true, 'guest unlock must not reopen a running match');
  const outsider = await connect(room, 'BCEFG', { name: 'O' });
  assert.equal(outsider.socket.control('err')?.e, 'Match in progress');
  assert.equal(room.members.size, 2);
});

test('the host can lock and unlock with a strict boolean only', () => {
  const { room, sockets: [host] } = roomWith('H', 'G');
  for (const bad of ['true', 1, 0, null, undefined, [], {}]) {
    host.emit('message', JSON.stringify({ t: 'lock', v: bad }));
    assert.equal(room.locked, false, `non-boolean ${JSON.stringify(bad)} is refused`);
  }
  host.emit('message', lock(true));
  assert.equal(room.locked, true);
  host.emit('message', lock(false));
  assert.equal(room.locked, false);
  host.emit('message', '{"t":"lock"}');
  assert.equal(room.locked, false, 'a missing value is not coerced to false/true');
});

test('lock authority follows host migration and never stays with the old connection', () => {
  const { room, sockets: [oldHost, next, third] } = roomWith('H', 'N', 'T');
  oldHost.emit('message', lock(true));
  assert.equal(room.locked, true);
  oldHost.emit('close');
  assert.equal(room.hostId, next.id, 'oldest remaining member is elected');
  oldHost.emit('message', lock(false));
  assert.equal(room.locked, true, 'the departed host connection is stale');
  third.emit('message', lock(false));
  assert.equal(room.locked, true, 'a non-host still cannot unlock after the election');
  next.emit('message', lock(false));
  assert.equal(room.locked, false, 'the newly elected host can unlock');
  next.emit('message', lock(true));
  assert.equal(room.locked, true);
});

test('a stale socket of a vanished room cannot mutate the next room generation', () => {
  const room = new RoomDurableObject({}, {});
  const oldHost = new FakeSocket();
  room.handleSession(oldHost, 'H');
  oldHost.emit('close');
  assert.equal(room.hostId, null);
  room.handleSession(new FakeSocket(), 'N');
  oldHost.emit('message', lock(true));
  assert.equal(room.locked, false, 'the old connection id is not the new host');
});
