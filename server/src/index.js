// INKWAVE multiplayer relay server for Cloudflare Workers (Durable Objects)
// Implements room management, membership, and message forwarding for INKWAVE clients.

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
    if (pathParts[0] === 'room' && pathParts[1]) {
      const roomCode = pathParts[1].toUpperCase();
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
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
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
      id: id,
      host: this.hostId,
      members: memberList
    }));

    // Broadcast join frame to existing members
    const joinMsg = JSON.stringify({ t: 'join', m: { id, name } });
    for (const [_, member] of this.members) {
      try { member.ws.send(joinMsg); } catch (e) {}
    }

    // Save active member
    this.members.set(id, { id, name, ws, joinedAt });

    ws.addEventListener('message', (event) => {
      const s = typeof event.data === 'string' ? event.data : '';
      if (!s) return;

      // Heartbeat ping -> pong
      if (s === 'ping') {
        try { ws.send('pong'); } catch (e) {}
        return;
      }

      // Broadcast message: "b|<json>"
      if (s.startsWith('b|')) {
        const payload = s.slice(2);
        const forward = `m|${id}|${payload}`;
        for (const [targetId, member] of this.members) {
          if (targetId !== id) {
            try { member.ws.send(forward); } catch (e) {}
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
          const target = this.members.get(targetId);
          if (target) {
            try { target.ws.send(`m|${id}|${payload}`); } catch (e) {}
          }
        }
        return;
      }

      // Lock control message: {"t":"lock","v":true}
      if (s.startsWith('{')) {
        try {
          const o = JSON.parse(s);
          if (o.t === 'lock') {
            this.locked = !!o.v;
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
