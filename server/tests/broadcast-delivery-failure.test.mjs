import { webcrypto as _wc } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: _wc.getRandomValues.bind(_wc),
    randomUUID: _wc.randomUUID.bind(_wc),
    subtle: _wc.subtle,
  };
}
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomDurableObject } from '../src/index.js';

// Native WebSocket close is asynchronous and has no nonstandard `closed` flag.
class Socket {
  constructor() { this.sent = []; this.closes = []; this.listeners = new Map(); this.bufferedAmount = 0; }
  accept() {}
  send(data) { this.sent.push(data); }
  close(code, reason) { this.closes.push({ code, reason }); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  serializeAttachment(data) { this.attachment = structuredClone(data); }
  deserializeAttachment() { return this.attachment; }
  get id() { return JSON.parse(this.sent.find(data => data.startsWith('{"t":"welcome"'))).id; }
}

for (const failure of ['throw', 'backlog', 'close-throws']) {
  test(`broadcast removes a ${failure} recipient before asynchronous close notification`, async () => {
    const sockets = [];
    const state = { acceptWebSocket(ws) { sockets.push(ws); }, getWebSockets() { return sockets; } };
    const room = new RoomDurableObject(state, {});
    const host = new Socket(), sender = new Socket(), survivor = new Socket();
    for (const [socket, name] of [[host, 'host'], [sender, 'sender'], [survivor, 'survivor']]) room.handleSession(socket, name, true);
    const hostId = host.id;
    if (failure === 'backlog') host.bufferedAmount = 1024 * 1024;
    else host.send = () => { throw new Error('unavailable'); };
    if (failure === 'close-throws') host.close = () => { throw new Error('already closed'); };
    await room.webSocketMessage(sender, 'b|{"k":"s","t":1}');
    assert.equal(room.members.has(hostId), false, 'failed socket must not retain membership');
    assert.equal(room.hostId, sender.id, 'ownership migrates without waiting for close');
    assert.equal(host.attachment.closed, true, 'hibernation cannot restore the dead member');
    const leaves = () => survivor.sent.filter(data => data.startsWith('{"t":"leave"')).map(JSON.parse);
    assert.deepEqual(leaves(), [{ t: 'leave', id: hostId, host: sender.id }]);
    assert.ok(survivor.sent.includes(`m|${sender.id}|{"k":"s","t":1}`));
    if (failure !== 'close-throws') assert.ok(host.closes.some(close => close.code === 1013));
    await room.webSocketClose(host, 1006, '', false);
    assert.equal(leaves().length, 1, 'late close is idempotent');
    const restored = new RoomDurableObject(state, {});
    assert.deepEqual([...restored.members.keys()], [sender.id, survivor.id]);
    assert.equal(restored.hostId, sender.id);
  });
}
