import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomDurableObject } from '../src/index.js';

// A native close notification can arrive after other room events. Do not use
// synchronous fake close callbacks to hide stranded membership or host state.
class Socket {
  constructor() { this.sent = []; this.closes = []; this.bufferedAmount = 0; }
  send(data) { this.sent.push(data); }
  close(code, reason) { this.closes.push({ code, reason }); }
  serializeAttachment(data) { this.attachment = structuredClone(data); }
  deserializeAttachment() { return this.attachment; }
  get id() { return JSON.parse(this.sent.find(data => data.startsWith('{"t":"welcome"'))).id; }
}

for (const control of ['pong', 'start_result', 'hit_nack']) {
  for (const failure of ['throw', 'backlog', 'close-throws']) {
    test(control + ' ' + failure + ' releases membership and host ownership before a close event', async () => {
      const sockets = [];
      const state = { acceptWebSocket(ws) { sockets.push(ws); }, getWebSockets() { return sockets; } };
      const room = new RoomDurableObject(state, {});
      room.compat = 'iw-gameplay-20261024-spawn-start-admission-v1';
      const host = new Socket(), survivor = new Socket();
      room.handleSession(host, 'host', true);
      room.handleSession(survivor, 'survivor', true);
      const id = host.id;
      if (failure === 'backlog') host.bufferedAmount = 1024 * 1024;
      else host.send = () => { throw Error('socket unavailable'); };
      if (failure === 'close-throws') host.close = () => { throw Error('already closed'); };
      const input = control === 'pong' ? 'ping' : control === 'hit_nack'
        ? 's|departed-member|{"k":"hit","seq":1}'
        : 'b|' + JSON.stringify({ k: 'start', id: 'round', proto: 2, compat: room.compat,
          host: id, roster: [host, survivor].map((ws, nid) => ({ nid, owner: ws.id, bot: false, style: null })) });
      await room.webSocketMessage(host, input);
      assert.equal(room.members.has(id), false, 'failed control recipient must leave immediately');
      assert.equal(room.hostId, survivor.id);
      assert.equal(host.attachment.closed, true);
      assert.equal(room.locked, false, 'failed START acknowledgment must not lock the room');
      assert.equal(survivor.sent.some(data => data.startsWith('m|')), false, 'failed START must not reach a peer');
      const leaves = () => survivor.sent.filter(data => data.startsWith('{"t":"leave"')).map(JSON.parse);
      assert.deepEqual(leaves(), [{ t: 'leave', id, host: survivor.id }]);
      await room.webSocketClose(host, 1006, '', false);
      assert.equal(leaves().length, 1, 'late close must not publish a second leave');
      const restored = new RoomDurableObject(state, {});
      assert.deepEqual([...restored.members.keys()], [survivor.id]);
      assert.equal(restored.hostId, survivor.id);
    });
  }
}
