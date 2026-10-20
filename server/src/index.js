// INKWAVE multiplayer relay server for Cloudflare Workers (Durable Objects)
// Implements room management, membership, and message forwarding for INKWAVE clients.

// Room codes are exactly what the client generates (src/net/session.js CODE_CHARS,
// 5 characters). Anything else cannot name a real room and must never allocate a
// Durable Object.
const ROOM_CODE = /^[BCEFGHJKLMNPQRTUVXYZ23456789]{5}$/;

// Client/relay compatibility (#1654). WIRE_MAJOR is the relay wire contract and must
// match PROTO in src/net/transport.js. `compat` is the client's gameplay-compatibility
// token (COMPAT in the same file): clients that disagree on game rules or packet
// semantics must not share a room. The relay does not know which tokens are
// compatible; it pins each room to its creator's token, so a compatibility bump
// needs no relay redeploy. Only a WIRE_MAJOR bump does.
const WIRE_MAJOR = '2';
const COMPAT_TOKEN = /^[A-Za-z0-9_-]{8,80}$/;
const UPDATE_MESSAGE = 'Game update required. Reload this page to play online.';
const VERSION_MISMATCH_MESSAGE = 'This room uses a different game version. Reload this page and try again.';

function clientBuild(url) {
  const compat = url.searchParams.get('compat');
  return url.searchParams.get('v') === WIRE_MAJOR && COMPAT_TOKEN.test(compat || '') ? compat : null;
}

const isWebSocketUpgrade = (request) => request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

// Same refusal shape the room uses for every join error, so the client shows a
// readable message. Answered without touching a Durable Object.
function refusalSocket(message) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ t: 'err', e: message }));
  server.close(1008, message);
  return new Response(null, { status: 101, webSocket: client });
}

// ---- Traffic bounds (#1645) -------------------------------------------------
// A room is at most 8 seats and the relay fans every frame out to the other 7, so
// what one seat may send is what the whole room must absorb. Limits are per
// connection and sized from measured play: a normal tick is a few KiB at 20 Hz;
// the heaviest measured client uplink (reports/inkwave-lossless-paint-codec-
// prototype-2026-10-11.md) is about 108 KB/s, and one 8-owner special burst is a
// single ~13-40 KiB frame. The sustained rates leave 2-4x headroom over play and
// the burst buckets absorb those one-off spikes.
const MAX_FRAME_BYTES = 64 * 1024;           // one frame, measured in UTF-8 bytes
const FRAME_RATE = 80, FRAME_BURST = 160;    // frames per second / bucket size
const BYTE_RATE = 256 * 1024, BYTE_BURST = 512 * 1024; // bytes per second / bucket size
const MAX_BACKLOG_BYTES = 512 * 1024;        // unsent bytes tolerated on a recipient socket
const MAX_KIND_LENGTH = 32;
const encoder = new TextEncoder();

// A relayed game payload is a JSON object with a short string kind ("k"), which
// is how every client message is built. Returns the parsed object or null.
function parseEnvelope(payload) {
  if (payload.charCodeAt(0) !== 123 /* { */) return null;
  try {
    const data = JSON.parse(payload);
    return data !== null && !Array.isArray(data) && typeof data.k === 'string' &&
      data.k.length > 0 && data.k.length <= MAX_KIND_LENGTH ? data : null;
  } catch { return null; }
}

// Never queue onto a socket that is already far behind: closing it lets that
// player reconnect instead of growing relay memory without bound. The sender is
// never penalised for a slow recipient. bufferedAmount exists on browser sockets
// and some runtimes; where it is absent the per-sender quotas still bound input.
function relaySend(socket, data) {
  if (Number.isFinite(socket.bufferedAmount) && socket.bufferedAmount > MAX_BACKLOG_BYTES) {
    try { socket.close(1013, 'Slow connection'); } catch {}
    return false;
  }
  try { socket.send(data); return true; } catch { return false; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const pathParts = url.pathname.split('/').filter(Boolean);

    // Endpoint: /room/:code. Everything that cannot be a real join is answered
    // here, before ROOMS.idFromName / get / fetch (#1646).
    if (pathParts[0] === 'room') {
      if (pathParts.length !== 2) return new Response('Not found', { status: 404 });
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      if (!isWebSocketUpgrade(request)) return new Response('Expected WebSocket upgrade', { status: 426 });
      // ASCII-only before case folding, so no Unicode uppercase can alias a code.
      const roomCode = /^[A-Za-z0-9]{5}$/.test(pathParts[1]) ? pathParts[1].toUpperCase() : '';
      if (!ROOM_CODE.test(roomCode)) return refusalSocket('Room not found');
      // Builds that predate (or postdate) this wire contract are told to reload; the
      // text is readable by the old client too, which shows any error frame verbatim.
      if (!clientBuild(url)) return refusalSocket(UPDATE_MESSAGE);
      const id = env.ROOMS.idFromName(roomCode);
      const roomObj = env.ROOMS.get(id);
      return roomObj.fetch(request);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'inkwave-relay' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.members = new Map(); // id -> { id, name, ws, joinedAt }
    this.hostId = null;
    this.locked = false;
    this.compat = null; // gameplay-compatibility token pinned by the room's creator
  }

  async fetch(request) {
    if (request.method !== 'GET' || !isWebSocketUpgrade(request)) {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    // The Worker has already checked this; keep the room safe if reached directly.
    const build = clientBuild(url);
    if (!build) return refusalSocket(UPDATE_MESSAGE);
    const name = (url.searchParams.get('name') || 'Player').slice(0, 16);
    const isCreate = url.searchParams.get('create') === '1';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Validation
    if (isCreate) {
      if (this.members.size > 0) {
        server.accept();
        server.send(JSON.stringify({ t: 'err', e: 'Room code taken' }));
        server.close(1008, 'Room code taken');
        return new Response(null, { status: 101, webSocket: client });
      }
    } else {
      if (this.members.size === 0) {
        server.accept();
        server.send(JSON.stringify({ t: 'err', e: 'Room not found' }));
        server.close(1008, 'Room not found');
        return new Response(null, { status: 101, webSocket: client });
      }
      // Refuse a different game build before it is admitted: it must never appear
      // in the roster or receive the room's traffic (#1654).
      if (build !== this.compat) {
        server.accept();
        server.send(JSON.stringify({ t: 'err', e: VERSION_MISMATCH_MESSAGE }));
        server.close(1008, VERSION_MISMATCH_MESSAGE);
        return new Response(null, { status: 101, webSocket: client });
      }
      if (this.locked) {
        server.accept();
        server.send(JSON.stringify({ t: 'err', e: 'Match in progress' }));
        server.close(1008, 'Match in progress');
        return new Response(null, { status: 101, webSocket: client });
      }
      if (this.members.size >= 8) {
        server.accept();
        server.send(JSON.stringify({ t: 'err', e: 'Room is full' }));
        server.close(1008, 'Room is full');
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    server.accept();
    if (this.members.size === 0) this.compat = build;
    this.handleSession(server, name);

    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws, name) {
    const id = 'p_' + Math.random().toString(36).substring(2, 9);
    const joinedAt = Date.now();

    // Elect host if room has no host
    if (this.members.size === 0 || !this.hostId) {
      this.hostId = id;
    }

    // Build current members list (including this newly joined player)
    const memberList = Array.from(this.members.values()).map(m => ({ id: m.id, name: m.name }));
    memberList.push({ id, name });

    // Send welcome frame
    ws.send(JSON.stringify({
      t: 'welcome',
      proto: Number(WIRE_MAJOR),   // lets a client detect a relay that predates this admission
      compat: this.compat,
      id: id,
      host: this.hostId,
      members: memberList
    }));

    // Broadcast join frame to existing members
    const joinMsg = JSON.stringify({ t: 'join', m: { id, name } });
    for (const [_, member] of this.members) {
      try { member.ws.send(joinMsg); } catch (e) {}
    }

    // Save active member. Traffic budgets belong to this connection and start full.
    this.members.set(id, { id, name, ws, joinedAt,
      budgetAt: Date.now(), framesLeft: FRAME_BURST, bytesLeft: BYTE_BURST });

    // Remove a misbehaving sender; its peers are never affected.
    const eject = (code, reason) => { try { ws.close(code, reason); } catch (e) {} };

    ws.addEventListener('message', (event) => {
      // A socket that already left (or was replaced) has no authority in the room.
      const member = this.members.get(id);
      if (member?.ws !== ws) return;
      // The protocol is text only.
      if (typeof event.data !== 'string') { eject(1003, 'Unsupported data'); return; }
      const s = event.data;
      // Enforce size and rate before any JSON.parse or fan-out. UTF-16 length is a
      // lower bound of the UTF-8 size, so oversized frames are refused without encoding.
      if (s.length > MAX_FRAME_BYTES) { eject(1009, 'Message too large'); return; }
      const size = encoder.encode(s).byteLength;
      if (size > MAX_FRAME_BYTES) { eject(1009, 'Message too large'); return; }
      const now = Date.now();
      const elapsed = Math.max(0, (now - member.budgetAt) / 1000);
      member.budgetAt = now;
      member.framesLeft = Math.min(FRAME_BURST, member.framesLeft + elapsed * FRAME_RATE);
      member.bytesLeft = Math.min(BYTE_BURST, member.bytesLeft + elapsed * BYTE_RATE);
      if (member.framesLeft < 1 || member.bytesLeft < size) { eject(1008, 'Relay traffic limit'); return; }
      member.framesLeft -= 1;
      member.bytesLeft -= size;

      // Heartbeat ping -> pong
      if (s === 'ping') {
        relaySend(ws, 'pong');
        return;
      }

      // Broadcast message: "b|<json>"
      if (s.startsWith('b|')) {
        const payload = s.slice(2);
        if (!parseEnvelope(payload)) return;
        const forward = `m|${id}|${payload}`;
        for (const [targetId, peer] of this.members) {
          if (targetId !== id) relaySend(peer.ws, forward);
        }
        return;
      }

      // Send to specific target: "s|<targetId>|<json>"
      if (s.startsWith('s|')) {
        const firstPipe = s.indexOf('|', 2);
        if (firstPipe !== -1) {
          const targetId = s.slice(2, firstPipe);
          const payload = s.slice(firstPipe + 1);
          const message = parseEnvelope(payload);
          if (!message) return;
          const target = this.members.get(targetId);
          if (target) {
            relaySend(target.ws, `m|${id}|${payload}`);
          } else {
            // Return a delivery failure for directed combat events. Do not
            // silently lose a hit when its owner has just disconnected.
            if (message.k === 'hit' && Number.isInteger(message.seq) && message.seq >= 0)
              relaySend(ws, `m|__relay__|${JSON.stringify({k:'hit_nack',seq:message.seq,to:targetId})}`);
          }
        }
        return;
      }

      // Lock control message: {"t":"lock","v":true}. Locking and unlocking the
      // roster is host-only (#1644): a guest's frame is ignored, never coerced,
      // and the value must be a real boolean. `this.hostId` follows elections,
      // so the previous host's connection loses this authority on handoff.
      if (s.startsWith('{')) {
        try {
          const o = JSON.parse(s);
          if (o !== null && o.t === 'lock' && id === this.hostId && typeof o.v === 'boolean') {
            this.locked = o.v;
          }
        } catch (e) {}
      }
    });

    const cleanup = () => {
      if (!this.members.has(id)) return;
      this.members.delete(id);

      // Re-elect host if the host left
      if (this.hostId === id) {
        if (this.members.size > 0) {
          const oldest = Array.from(this.members.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
          this.hostId = oldest.id;
        } else {
          this.hostId = null;
          this.locked = false;
          this.compat = null;
        }
      }

      // Broadcast leave notification to remaining members
      const leaveMsg = JSON.stringify({ t: 'leave', id, host: this.hostId });
      for (const [_, member] of this.members) {
        try { member.ws.send(leaveMsg); } catch (e) {}
      }
    };

    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
  }
}
