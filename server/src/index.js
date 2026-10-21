// INKWAVE multiplayer relay server for Cloudflare Workers (Durable Objects)
// Implements room management, membership, message forwarding, and Cloudflare
// Durable Objects WebSocket Hibernation API for INKWAVE clients.

// Keep this wire major in step with src/net/transport.js. A room also pins the
// client's gameplay compatibility token, not UI-only asset revisions.
const WIRE_MAJOR = '2';
const ROOM_CODE = /^[BCEFGHJKLMNPQRTUVXYZ23456789]{5}$/;
const COMPAT_TOKEN = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_FRAME_BYTES = 64 * 1024;
const FRAME_RATE = 80, FRAME_BURST = 160;
const BYTE_RATE = 256 * 1024, BYTE_BURST = 512 * 1024;
const MAX_BACKLOG_BYTES = 512 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function validRelayPayload(payload) {
  if (!payload.startsWith('{') || payload.length > MAX_FRAME_BYTES) return false;
  try {
    const data = JSON.parse(payload);
    return data !== null && !Array.isArray(data) &&
      typeof data.k === 'string' && data.k.length > 0 && data.k.length <= 32;
  } catch { return false; }
}

function relaySend(socket, data) {
  // bufferedAmount is provided by browser sockets and some Worker runtimes.
  // Rate/byte admission above still protects runtimes without this property.
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

    // Endpoint: /room/:code
    if (pathParts[0] === 'room') {
      // Reject invalid/ordinary HTTP requests before allocating a Durable Object.
      if (pathParts.length !== 2 || !ROOM_CODE.test(pathParts[1].toUpperCase()))
        return new Response('Invalid room code', { status: 400 });
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return new Response('Expected WebSocket upgrade', { status: 426 });
      if (url.searchParams.get('v') !== WIRE_MAJOR || !COMPAT_TOKEN.test(url.searchParams.get('compat') || ''))
        return new Response('Update the game to join this room', { status: 426 });
      const id = env.ROOMS.idFromName(pathParts[1].toUpperCase());
      return env.ROOMS.get(id).fetch(request);
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
    this.members = new Map(); // id -> { id, name, ws, joinedAt, budgetAt, framesLeft, bytesLeft }
    this.hostId = null;
    this.locked = false;
    this.compat = null;
    this.hibernationEnabled = typeof state?.acceptWebSocket === 'function';
    if (typeof state?.setWebSocketAutoResponse === 'function') {
      try {
        const pair = typeof WebSocketRequestResponsePair === 'function'
          ? new WebSocketRequestResponsePair('ping', 'pong')
          : { request: 'ping', response: 'pong' };
        state.setWebSocketAutoResponse(pair);
      } catch {}
    }
    this._restoreHibernatedSockets();
  }

  _restoreHibernatedSockets() {
    if (typeof this.state?.getWebSockets !== 'function') return;
    let sockets;
    try { sockets = this.state.getWebSockets(); } catch { return; }
    if (!sockets || !sockets.length) return;
    for (const ws of sockets) {
      if (this._memberBySocket(ws)) continue;
      let att = null;
      try { att = ws.deserializeAttachment?.(); } catch {}
      if (!att || typeof att !== 'object' || !att.id || att.closed) continue;
      if (att.compat && (!this.compat || att.isHost)) this.compat = att.compat;
      if (typeof att.locked === 'boolean' && (att.isHost || !this.hostId)) this.locked = att.locked;
      if (att.isHost && !this.hostId) this.hostId = att.id;
      this.members.set(att.id, {
        id: att.id,
        name: att.name || 'Player',
        ws,
        joinedAt: Number.isFinite(att.joinedAt) ? att.joinedAt : Date.now(),
        budgetAt: Number.isFinite(att.budgetAt) ? att.budgetAt : Date.now(),
        framesLeft: Number.isFinite(att.framesLeft) ? att.framesLeft : FRAME_BURST,
        bytesLeft: Number.isFinite(att.bytesLeft) ? att.bytesLeft : BYTE_BURST,
      });
    }
    if (!this.hostId && this.members.size > 0) {
      const oldest = Array.from(this.members.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.hostId = oldest.id;
    }
  }

  _syncAttachments() {
    for (const m of this.members.values()) {
      this._syncMemberAttachment(m);
    }
  }

  _syncMemberAttachment(m) {
    if (!m || !m.ws) return;
    try {
      m.ws.serializeAttachment?.({
        id: m.id,
        name: m.name,
        joinedAt: m.joinedAt,
        budgetAt: m.budgetAt,
        framesLeft: m.framesLeft,
        bytesLeft: m.bytesLeft,
        isHost: m.id === this.hostId,
        locked: this.locked,
        compat: this.compat,
      });
    } catch {}
  }

  _memberBySocket(ws) {
    for (const m of this.members.values()) {
      if (m.ws === ws) return m;
    }
    return null;
  }

  async fetch(request) {
    this._restoreHibernatedSockets();
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const compat = url.searchParams.get('compat');
    if (url.searchParams.get('v') !== WIRE_MAJOR || !COMPAT_TOKEN.test(compat || ''))
      return new Response('Update the game to join this room', { status: 426 });
    const name = (url.searchParams.get('name') || 'Player').slice(0, 16);
    const isCreate = url.searchParams.get('create') === '1';

    // Validate compatibility *before* admitting a socket, including after host migration.
    if (this.members.size > 0 && compat !== this.compat)
      return new Response('Incompatible game version: refresh this tab', { status: 409 });

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

    if (this.members.size === 0) this.compat = compat;
    this.handleSession(server, name, this.hibernationEnabled);

    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws, name, useHibernation = false) {
    const id = 'p_' + Math.random().toString(36).substring(2, 9);
    const joinedAt = Date.now();

    if (useHibernation && typeof this.state?.acceptWebSocket === 'function') {
      this.state.acceptWebSocket(ws, [id]);
    } else if (typeof ws.accept === 'function') {
      ws.accept();
    }

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
      proto: Number(WIRE_MAJOR),
      compat: this.compat,
      id: id,
      host: this.hostId,
      members: memberList
    }));

    // Broadcast join frame to existing members
    const joinMsg = JSON.stringify({ t: 'join', m: { id, name } });
    for (const [_, member] of this.members) {
      relaySend(member.ws, joinMsg);
    }

    // Admission budgets are per authenticated socket and reset on reconnect.
    const memberEntry = {
      id, name, ws, joinedAt,
      budgetAt: Date.now(), framesLeft: FRAME_BURST, bytesLeft: BYTE_BURST
    };
    this.members.set(id, memberEntry);
    this._syncAttachments();

    if (!(useHibernation && typeof this.state?.acceptWebSocket === 'function')) {
      ws.addEventListener('message', (event) => {
        this._handleMessage(id, ws, event.data);
      });
      const cleanup = () => this._cleanupMember(id, ws);
      ws.addEventListener('close', cleanup);
      ws.addEventListener('error', cleanup);
    }
  }

  async webSocketMessage(ws, raw) {
    this._restoreHibernatedSockets();
    const m = this._memberBySocket(ws);
    if (!m) return;
    this._handleMessage(m.id, ws, raw);
  }

  async webSocketClose(ws, code, reason, _wasClean) {
    this._restoreHibernatedSockets();
    const m = this._memberBySocket(ws);
    try { ws.serializeAttachment?.({ closed: true }); } catch {}
    try { ws.close(code || 1000, reason || 'peer closed'); } catch {}
    if (!m) return;
    this._cleanupMember(m.id, ws);
  }

  async webSocketError(ws, _error) {
    this._restoreHibernatedSockets();
    const m = this._memberBySocket(ws);
    try { ws.serializeAttachment?.({ closed: true }); } catch {}
    if (!m) return;
    this._cleanupMember(m.id, ws);
  }

  _handleMessage(id, ws, rawData) {
    let s = '';
    if (typeof rawData === 'string') s = rawData;
    else if (rawData instanceof ArrayBuffer) s = decoder.decode(rawData);
    else if (ArrayBuffer.isView(rawData)) s = decoder.decode(rawData);
    if (!s || !this.members.has(id) || this.members.get(id).ws !== ws) return;

    // Enforce byte quotas before JSON.parse or forwarding to up to seven peers.
    const size = s.length > MAX_FRAME_BYTES ? s.length : encoder.encode(s).byteLength;
    if (size > MAX_FRAME_BYTES) {
      try { ws.close(1009, 'Message too large'); } catch {}
      this._cleanupMember(id, ws);
      return;
    }
    const m = this.members.get(id), now = Date.now();
    const elapsed = Math.max(0, Math.min(4, (now - m.budgetAt) / 1000));
    m.budgetAt = now;
    m.framesLeft = Math.min(FRAME_BURST, m.framesLeft + elapsed * FRAME_RATE);
    m.bytesLeft = Math.min(BYTE_BURST, m.bytesLeft + elapsed * BYTE_RATE);
    if (m.framesLeft < 1 || m.bytesLeft < size) {
      try { ws.close(1008, 'Relay traffic limit'); } catch {}
      this._cleanupMember(id, ws);
      return;
    }
    m.framesLeft -= 1;
    m.bytesLeft -= size;
    this._syncMemberAttachment(m);

    // Heartbeat ping -> pong
    if (s === 'ping') {
      relaySend(ws, 'pong');
      return;
    }

    // Broadcast message: "b|<json>"
    if (s.startsWith('b|')) {
      const payload = s.slice(2);
      if (!validRelayPayload(payload)) return;
      const forward = `m|${id}|${payload}`;
      for (const [targetId, member] of this.members) {
        if (targetId !== id) {
          if (!relaySend(member.ws, forward) && member.ws.closed) {
            this._cleanupMember(targetId, member.ws);
          }
        }
      }
      return;
    }

    // Send to specific target: "s|<targetId>|<json>"
    if (s.startsWith('s|')) {
      const firstPipe = s.indexOf('|', 2);
      if (firstPipe !== -1) {
        const targetId = s.slice(2, firstPipe);
        const payload = s.slice(firstPipe + 1);
        if (!validRelayPayload(payload) || targetId.length > 40) return;
        const target = this.members.get(targetId);
        if (target) {
          if (!relaySend(target.ws, `m|${id}|${payload}`) && target.ws.closed) {
            this._cleanupMember(targetId, target.ws);
          }
        } else {
          // Return a delivery failure for directed combat events. Do not
          // silently lose a hit when its owner has just disconnected.
          let hit;
          try { hit = JSON.parse(payload); } catch {}
          if (hit?.k === 'hit' && Number.isInteger(hit.seq) && hit.seq >= 0)
            relaySend(ws, `m|__relay__|${JSON.stringify({k:'hit_nack',seq:hit.seq,to:targetId})}`);
        }
      }
      return;
    }

    // Lock control message: {"t":"lock","v":true}
    if (s.startsWith('{')) {
      try {
        const o = JSON.parse(s);
        if (o.t === 'lock' && id === this.hostId && typeof o.v === 'boolean') {
          this.locked = o.v;
          this._syncAttachments();
        }
      } catch (e) {}
    }
  }

  _cleanupMember(id, ws) {
    if (!this.members.has(id)) return;
    const current = this.members.get(id);
    if (ws && current.ws !== ws) return;
    this.members.delete(id);
    try { current.ws?.serializeAttachment?.({ closed: true }); } catch {}

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

    this._syncAttachments();

    // Broadcast leave notification to remaining members
    const leaveMsg = JSON.stringify({ t: 'leave', id, host: this.hostId });
    for (const [_, member] of this.members) {
      relaySend(member.ws, leaveMsg);
    }
  }
}
