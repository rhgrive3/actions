// Socket-free fixtures for the relay. They drive the real Worker fetch handler
// and the real RoomDurableObject; only the Cloudflare platform globals
// (WebSocketPair, 101 responses) and the sockets themselves are fakes.
import relay, { RoomDurableObject } from '../src/index.js';

export { relay, RoomDurableObject };

export class FakeSocket {
  constructor() {
    this.sent = [];
    this.listeners = new Map();
    this.closed = null;
    this.accepted = false;
    this.bufferedAmount = 0;
  }
  accept() { this.accepted = true; }
  send(data) {
    if (this.closed) throw new Error('send on a closed fake socket');
    this.sent.push(data);
  }
  addEventListener(kind, fn) { this.listeners.set(kind, fn); }
  emit(kind, data) { this.listeners.get(kind)?.({ data }); }
  close(code, reason) {
    if (this.closed) return;
    this.closed = { code, reason };
    this.emit('close');
  }
  control(type) {
    const row = this.sent.find(x => typeof x === 'string' && x.startsWith('{') && JSON.parse(x).t === type);
    return row ? JSON.parse(row) : null;
  }
  get id() { return this.control('welcome')?.id; }
  relayed() { return this.sent.filter(x => typeof x === 'string' && x.startsWith('m|')); }
}

// Wire values a current client sends. Extra query parameters are ignored by
// relays that predate them, so the same helper serves every commit's tests.
export const WIRE = '2';
export const COMPAT = 'iw-gameplay-20261020-r1';

export function request(path, { method = 'GET', upgrade = 'websocket' } = {}) {
  return {
    url: 'https://relay.test' + path,
    method,
    headers: new Headers(upgrade ? { Upgrade: upgrade } : {}),
  };
}

export function joinPath(code, { create = false, name = 'Player', v = WIRE, compat = COMPAT } = {}) {
  const query = new URLSearchParams({ name });
  if (v !== null) query.set('v', v);
  if (compat !== null) query.set('compat', compat);
  if (create) query.set('create', '1');
  return `/room/${code}?${query}`;
}

// The relay constructs WebSocketPair and a status-101 Response synchronously
// inside fetch(). Install minimal stand-ins for exactly that synchronous span.
export function callWithPlatform(call) {
  const pairs = [];
  const savedPair = globalThis.WebSocketPair, savedResponse = globalThis.Response;
  const RealResponse = savedResponse;
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = new FakeSocket();
      this[1] = new FakeSocket();
      pairs.push(this);
    }
  };
  globalThis.Response = function Response(body, init = {}) {
    if (init.status === 101) return { status: 101, webSocket: init.webSocket };
    return new RealResponse(body, init);
  };
  let result;
  try { result = call(); }
  finally {
    if (savedPair === undefined) delete globalThis.WebSocketPair; else globalThis.WebSocketPair = savedPair;
    globalThis.Response = savedResponse;
  }
  return { result, pairs };
}

// Admit one client through RoomDurableObject.fetch. Resolves with the relay's
// server-side socket (what the room sees) and the HTTP-level response.
export async function connect(room, code, options = {}) {
  const { result, pairs } = callWithPlatform(() => room.fetch(request(joinPath(code, options))));
  const response = await result;
  return { response, socket: pairs[0]?.[1] || null, allocated: pairs.length };
}

// A room whose members were seated directly (handleSession), as if created by a
// current client: rooms made through fetch() are pinned to their creator's build.
export function roomWith(...names) {
  const room = new RoomDurableObject({}, {});
  room.compat = COMPAT;
  const sockets = names.map(name => {
    const ws = new FakeSocket();
    room.handleSession(ws, name);
    return ws;
  });
  return { room, sockets };
}
