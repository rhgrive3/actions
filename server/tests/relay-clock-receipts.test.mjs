import { webcrypto as _wc } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: _wc.getRandomValues.bind(_wc),
    randomUUID: _wc.randomUUID.bind(_wc),
    subtle: _wc.subtle,
  };
}
import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomDurableObject } from '../src/index.js';

class Socket {
  sent = []; events = new Map(); bufferedAmount = 0;
  accept() {}
  send(data) { this.sent.push(data); }
  addEventListener(type, fn) { this.events.set(type, fn); }
  emit(data) { this.events.get('message')?.({ data }); }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  get welcome() { return JSON.parse(this.sent.find(x => x.startsWith('{"t":"welcome"'))); }
}

function fixture(hibernate = false) {
  const sockets = [];
  const state = hibernate ? { acceptWebSocket: ws => sockets.push(ws), getWebSockets: () => sockets } : {};
  const room = new RoomDurableObject(state, {});
  const join = optIn => {
    const ws = new Socket(); room.handleSession(ws, 'test', hibernate, optIn); return ws;
  };
  return { room, state, sender: join(false), legacy: join(false), modern: join(true) };
}

function checkFrame(frame, sender, payload, before, after) {
  const prefix = `m|${sender.welcome.id}|@`;
  assert(frame.startsWith(prefix));
  const end = frame.indexOf('|', prefix.length);
  const at = Number(frame.slice(prefix.length, end));
  assert(Number.isSafeInteger(at) && at >= before && at <= after);
  assert.equal(frame.slice(end + 1), payload, 'peer JSON is forwarded byte for byte');
}

test('relay timestamp is opt-in, authenticated out of band, and compatible with legacy recipients', () => {
  const { sender, legacy, modern } = fixture();
  assert.equal(legacy.welcome.relayClock, undefined);
  assert.equal(modern.welcome.relayClock, 1);
  const payload = '{"k":"t","ts":124.04,"relayAt":999999999999999,"from":"forged"}';
  const before = Date.now(); sender.emit('b|' + payload); const after = Date.now();
  assert.equal(legacy.sent.at(-1), `m|${sender.welcome.id}|${payload}`);
  checkFrame(modern.sent.at(-1), sender, payload, before, after);
  for (const target of [legacy, modern]) {
    const start = Date.now(); sender.emit(`s|${target.welcome.id}|${payload}`);
    if (target === legacy) assert.equal(target.sent.at(-1), `m|${sender.welcome.id}|${payload}`);
    else checkFrame(target.sent.at(-1), sender, payload, start, Date.now());
  }
  const counts = [legacy.sent.length, modern.sent.length];
  for (const forged of ['@9999999999999|{"k":"t"}', 'm|forged|@1|{"k":"t"}']) sender.emit('b|' + forged);
  assert.deepEqual([legacy.sent.length, modern.sent.length], counts, 'a peer cannot supply relay framing');
});

test('hibernation preserves each recipient capability without changing legacy frames', async () => {
  const { room, state, sender, legacy, modern } = fixture(true);
  assert.equal(room.members.size, 3);
  const restored = new RoomDurableObject(state, {});
  const payload = '{"k":"t","ts":175.665}', before = Date.now();
  await restored.webSocketMessage(sender, 'b|' + payload);
  assert.equal(legacy.sent.at(-1), `m|${sender.welcome.id}|${payload}`);
  checkFrame(modern.sent.at(-1), sender, payload, before, Date.now());
});
