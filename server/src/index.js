// INKWAVE multiplayer relay server for Cloudflare Workers (Durable Objects)
// Implements room management, membership, message forwarding, and Cloudflare
// Durable Objects WebSocket Hibernation API for INKWAVE clients.

// Keep this wire major in step with src/net/transport.js. A room also pins the
// client's gameplay compatibility token, not UI-only asset revisions.
const WIRE_MAJOR = '2';
// Older pinned rooms keep their original START exchange during relay rollouts.
const START_ADMISSION_COMPATS = new Set([
  'iw-gameplay-20261023-start-admission-v1',
  'iw-gameplay-20261024-spawn-start-admission-v1',
]);
const ROOM_CODE = /^[BCEFGHJKLMNPQRTUVXYZ23456789]{5}$/;
const COMPAT_TOKEN = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_FRAME_BYTES = 64 * 1024;
const FRAME_RATE = 80, FRAME_BURST = 160;
const BYTE_RATE = 256 * 1024, BYTE_BURST = 512 * 1024;
const MAX_BACKLOG_BYTES = 512 * 1024;
const JOIN_RATE = 4, JOIN_BURST = 16;
import { validNetworkAppearance } from '../../patches/reliability/session-admission.mjs';
import { utf8ByteLength } from '../../patches/network-replication/utf8-length.mjs';
const decoder = new TextDecoder();

function validRelayPayload(payload) {
  if (!payload.startsWith('{') || payload.length > MAX_FRAME_BYTES) return false;
  try {
    const data = JSON.parse(payload);
    return data !== null && !Array.isArray(data) &&
      typeof data.k === 'string' && data.k.length > 0 && data.k.length <= 32 ? data : false;
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
    this.joinBudgetAt = Date.now();
    this.joinsLeft = JOIN_BURST;
    this.hibernationEnabled = typeof state?.acceptWebSocket === 'function';
    // Heartbeats must enter _handleMessage and spend the same frame/byte quotas.
    // Clear a previously installed runtime auto-response after a rolling upgrade.
    try { state.setWebSocketAutoResponse?.(); } catch {}
    this._restoreHibernatedSockets();
  }

  _restoreHibernatedSockets() {
    if (this._hibernatedSocketsRestored || typeof this.state?.getWebSockets !== 'function') return;
    let sockets;
    try { sockets = this.state.getWebSockets(); } catch { return; }
    this._hibernatedSocketsRestored = true;
    if (!sockets || !sockets.length) return;
    for (const ws of sockets) {
      if (this._memberBySocket(ws)) continue;
      let att = null;
      try { att = ws.deserializeAttachment?.(); } catch {}
      if (!att || typeof att !== 'object' || !att.id || att.closed) continue;
      if (this.members.has(att.id)) {
        try { ws.serializeAttachment?.({ closed: true }); ws.close(1008, 'Duplicate member identity'); } catch {}
        continue;
      }
      if (Number.isFinite(att.joinBudgetAt) && Number.isFinite(att.joinsLeft) &&
          att.joinsLeft >= 0 && att.joinsLeft <= JOIN_BURST &&
          (this._restoredJoinBudgetAt === undefined || att.joinBudgetAt > this._restoredJoinBudgetAt ||
           (att.joinBudgetAt === this._restoredJoinBudgetAt && att.joinsLeft < this.joinsLeft))) {
        this._restoredJoinBudgetAt = this.joinBudgetAt = att.joinBudgetAt;
        this.joinsLeft = att.joinsLeft;
      }
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
        relayClock: att.relayClock === true,
        emoteAt: Number.isFinite(att.emoteAt) ? att.emoteAt : null,
        attachmentSnapshot: att,
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
      const next = {
        id: m.id,
        name: m.name,
        joinedAt: m.joinedAt,
        budgetAt: m.budgetAt,
        framesLeft: m.framesLeft,
        bytesLeft: m.bytesLeft,
        isHost: m.id === this.hostId,
        locked: this.locked,
        compat: this.compat,
        relayClock: m.relayClock === true,
        emoteAt: m.emoteAt ?? null,
        ...(m.id === this.hostId ? { joinBudgetAt: this.joinBudgetAt, joinsLeft: this.joinsLeft } : {}),
      };
      const previous = m.attachmentSnapshot;
      // Accepted frames usually change at least one budget scalar. Prove a
      // difference first; retain full key equality for general unchanged sync.
      if (previous && previous.budgetAt === next.budgetAt
        && previous.framesLeft === next.framesLeft && previous.bytesLeft === next.bytesLeft) {
        const keys = Object.keys(next);
        if (Object.keys(previous).length === keys.length && keys.every(key => previous[key] === next[key])) return;
      }
      m.ws.serializeAttachment?.(next);
      m.attachmentSnapshot = next;
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
    if (!isCreate && this.members.size > 0 && compat !== this.compat)
      return new Response('Incompatible game version: refresh this tab', { status: 409 });

    // Room-wide admission limits cover JOIN/LEAVE fanout, before socket allocation.
    if (!this._admitJoin(false)) return new Response('Room reconnect limit; try again shortly', { status: 429 });
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
    if (this.handleSession(server, name, this.hibernationEnabled, url.searchParams.get('relayClock') === '1') === false)
      return new Response('Could not join room; try again shortly', { status: 503 });

    return new Response(null, { status: 101, webSocket: client });
  }

  _admitJoin(consume = true) {
    const at = Date.now();
    const elapsed = Math.max(0, (at - this.joinBudgetAt) / 1000);
    this.joinsLeft = Math.min(JOIN_BURST, this.joinsLeft + elapsed * JOIN_RATE);
    this.joinBudgetAt = at;
    if (this.joinsLeft < 1) return false;
    if (consume) this.joinsLeft--;
    return true;
  }

  handleSession(ws, name, useHibernation = false, relayClock = false) {
    if (!this._admitJoin()) { try { ws.close(1008, 'Room reconnect limit'); } catch {} return false; }
    // Allocate identity before accept/WELCOME/JOIN. Never overwrite an old socket.
    let id = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      let candidate;
      try { candidate = 'p_' + crypto.randomUUID(); } catch { break; }
      if (!this.members.has(candidate)) { id = candidate; break; }
    }
    if (!id) { try { ws.close(1013, 'Could not allocate member identity'); } catch {} return false; }
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

    const notified = [];
    const rejectJoin = () => {
      try { ws.serializeAttachment?.({ closed: true }); ws.close(1013, 'Could not announce room membership'); } catch {}
      if (this.members.size === 0 && this.hostId === id) { this.hostId = null; this.locked = false; this.compat = null; }
      // Earlier successful JOIN recipients must undo exactly this provisional ID.
      const undo = JSON.stringify({ t: 'leave', id, host: this.hostId });
      for (const member of notified) if (this.members.get(member.id) === member && !relaySend(member.ws, undo)) {
        try { member.ws.close(1013, 'Membership delivery failed'); } catch {}
        this._cleanupMember(member.id, member.ws);
      }
      this._syncAttachments();
      return false;
    };
    // Admission commits only if WELCOME and every current member's JOIN can be
    // accepted locally. Any failure explicitly closes/rolls back the newcomer.
    if (!relaySend(ws, JSON.stringify({
      t: 'welcome', proto: Number(WIRE_MAJOR), compat: this.compat,
      ...(relayClock ? { relayClock: 1 } : {}), id, host: this.hostId, members: memberList
    }))) return rejectJoin();
    const joinMsg = JSON.stringify({ t: 'join', m: { id, name } });
    for (const member of this.members.values()) {
      if (!relaySend(member.ws, joinMsg)) {
        try { member.ws.close(1013, 'Membership delivery failed'); } catch {}
        this._cleanupMember(member.id, member.ws);
        return rejectJoin();
      }
      notified.push(member);
    }

    // Admission budgets are per authenticated socket and reset on reconnect.
    const memberEntry = {
      id, name, ws, joinedAt, relayClock, emoteAt: null,
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
    if (this.members.get(id)?.ws !== ws) return;
    // Inspect the actual view, not its backing buffer, before decoding bytes.
    if ((rawData instanceof ArrayBuffer || ArrayBuffer.isView(rawData)) && rawData.byteLength > MAX_FRAME_BYTES) {
      try { ws.close(1009, 'Message too large'); } catch {}
      this._cleanupMember(id, ws);
      return;
    }
    let s = '';
    if (typeof rawData === 'string') s = rawData;
    else if (rawData instanceof ArrayBuffer) s = decoder.decode(rawData);
    else if (ArrayBuffer.isView(rawData)) s = decoder.decode(rawData);
    if (!s || !this.members.has(id) || this.members.get(id).ws !== ws) return;

    // Enforce byte quotas before JSON.parse or forwarding to up to seven peers.
    const size = s.length > MAX_FRAME_BYTES ? s.length : utf8ByteLength(s);
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
      const data = validRelayPayload(payload);
      if (!data || !this._admitSemantic(m, data)) return;
      if (data.k === 'start' && START_ADMISSION_COMPATS.has(this.compat)) {
        // Admission and this check run synchronously in the same DO event. A
        // JOIN accepted before this point must appear once in the human roster.
        if (id !== this.hostId) return;
        if (typeof data.id !== 'string' || !data.id.length || data.id.length > 64) return;
        const humans = new Set(), nids = new Set();
        let ok = !this.locked && data.host === id && data.proto === Number(WIRE_MAJOR) &&
          data.compat === this.compat && Array.isArray(data.roster) &&
          data.roster.length > 0 && data.roster.length <= 8;
        if (ok) for (const r of data.roster) {
          if (!r || typeof r.bot !== 'boolean' || !Number.isSafeInteger(r.nid) ||
              r.nid < 0 || nids.has(r.nid) || !validNetworkAppearance(r.style) || (r.bot ? r.owner !== id :
                (!this.members.has(r.owner) || humans.has(r.owner)))) { ok = false; break; }
          nids.add(r.nid);
          if (!r.bot) humans.add(r.owner);
        }
        ok = ok && humans.size === this.members.size;
        // No start is forwarded if the host cannot receive its result.
        if (!relaySend(ws, JSON.stringify({ t: 'start_result', id: data.id, ok }))) return;
        if (!ok) return;
        this.locked = true;
        this._syncAttachments();
      }
      let forward, stamped;
      const stampTime = Date.now();
      for (const [targetId, member] of this.members) {
        if (targetId !== id) {
          if (!relaySend(member.ws, member.relayClock
            ? (stamped ??= `m|${id}|@${stampTime}|${payload}`)
            : (forward ??= `m|${id}|${payload}`))) {
            // Native sockets have no `closed` flag and their close event may
            // arrive later. Failed delivery must release membership now.
            try { member.ws.close(1013, 'Delivery failed'); } catch {}
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
        const data = validRelayPayload(payload);
        if (!data || data.k === 'start' || targetId.length > 40 || !this._admitSemantic(m, data)) return;
        const target = this.members.get(targetId);
        let delivered = false;
        if (target) {
          const frame = target.relayClock ? `m|${id}|@${Date.now()}|${payload}` : `m|${id}|${payload}`;
          delivered = relaySend(target.ws, frame);
          if (!delivered) {
            // A throwing send is just as undeliverable as excess backlog.
            // Publish ownership transfer before the matching negative receipt.
            try { target.ws.close(1013, 'Delivery failed'); } catch {}
            this._cleanupMember(targetId, target.ws);
          }
        }
        if (!delivered && data.k === 'hit' && Number.isSafeInteger(data.seq) && data.seq >= 0)
          relaySend(ws, `m|__relay__|${JSON.stringify({k:'hit_nack',seq:data.seq,to:targetId})}`);
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

  _admitSemantic(member, data) {
    if (data.k === 'me' && !validNetworkAppearance(data.style)) return false;
    if (data.k !== 'emote') return true;
    if (this.locked || !['booyah', 'wave', 'dance', 'flex'].includes(data.n)) return false;
    const at = Date.now();
    if (member.emoteAt !== null && at - member.emoteAt < 1300) return false;
    member.emoteAt = at;
    this._syncMemberAttachment(member);
    return true;
  }

  _cleanupMember(id, ws) {
    // Close failed control recipients and elect again. Drain iteratively so a
    // synchronous close callback cannot resume an outer stale-host broadcast.
    const queue = this._cleanupQueue || (this._cleanupQueue = []);
    queue.push({ id, ws });
    if (this._cleaningMembers) return;
    this._cleaningMembers = true;
    try {
      while (queue.length) {
        const next = queue.shift();
        this._cleanupMemberOnce(next.id, next.ws);
      }
    } finally { this._cleaningMembers = false; }
  }

  _cleanupMemberOnce(id, ws) {
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
      if (!relaySend(member.ws, leaveMsg)) {
        try { member.ws.close(1013, 'Membership delivery failed'); } catch {}
        this._cleanupMember(member.id, member.ws);
      }
    }
  }
}
