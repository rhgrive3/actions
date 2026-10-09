// Build-time overlay for the public room lifecycle. Upstream remains untouched.
// Each replacement requires its complete anchor exactly once; source drift fails closed.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Reliability network anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptNet(rel, code) {
  if (rel === 'src/net/session.js') {
    code = replaceOnce(code, `    this.tr = null;
    this.match = null;`, `    this.tr = null;
    this._roomAttempt = 0;
    this.match = null;`, rel);
    code = replaceOnce(code, `  async create(name) {
    let lastErr = null;
    for (let tries = 0; tries < 4; tries++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
      try { await this._connect(code, name, true); return code; } catch (e) { lastErr = e; if (e.message !== 'Room code taken') break; }
    }
    this._fail(lastErr);
    throw lastErr;
  }

  async join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { const e = new Error('Room not found'); this._fail(e); throw e; }
    try { await this._connect(code, name, false); } catch (e) { this._fail(e); throw e; }
  }

  async _connect(code, name, create) {
    this.leave(true);
    this.error = null;
    this._setState('connecting');
    const tr = (this.tr = new Transport());
    tr.onControl = (o) => this._control(o);
    tr.onMessage = (from, d) => this._message(from, d);
    tr.onClose = (reason) => this._closed(reason);
    const me = this._profile();
    const welcome = await tr.connect(code, name || me.name, create);
    this.code = code;
    this.myId = welcome.id;
    this.hostId = welcome.host;
    this._members.clear();
    for (const m of welcome.members) this._members.set(m.id, m.name);
    this.lobby = this._blankLobby();
    this._botsPref = this.isHost ? true : null;   // a new room fills with bots unless its stage forbids them
    if (this.isHost) {
      this.lobby.players = [this._newPlayer(this.myId, name || me.name, { weapon: me.weapon, style: me.style })];
      this._fixTeams();
    }
    this._setState('lobby');
    // tell the host who we are (the host already knows itself)
    if (!this.isHost) tr.sendTo(this.hostId, { k: 'me', name: name || me.name, weapon: me.weapon, style: me.style });
    this._pushLobby();
  }

`, `  async create(name) {
    this.leave(true);
    const attempt = this._roomAttempt;
    let lastErr = null;
    for (let tries = 0; tries < 4; tries++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
      try {
        await this._connect(code, name, true, attempt);
        if (this._roomAttempt !== attempt) throw Object.assign(new Error('Connection cancelled'), { name: 'AbortError' });
        return code;
      }
      catch (e) {
        if (this._roomAttempt !== attempt) throw e;
        lastErr = e;
        if (e.message !== 'Room code taken') break;
      }
    }
    if (this._roomAttempt === attempt) this._fail(lastErr);
    throw lastErr;
  }

  async join(code, name) {
    this.leave(true);
    const attempt = this._roomAttempt;
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { const e = new Error('Room not found'); this._fail(e); throw e; }
    try {
      await this._connect(code, name, false, attempt);
      if (this._roomAttempt !== attempt) throw Object.assign(new Error('Connection cancelled'), { name: 'AbortError' });
    }
    catch (e) { if (this._roomAttempt === attempt) this._fail(e); throw e; }
  }

  async _connect(code, name, create, attempt) {
    const cancelled = () => Object.assign(new Error('Connection cancelled'), { name: 'AbortError' });
    if (this._roomAttempt !== attempt) throw cancelled();
    this.tr?.close();
    this.error = null;
    const tr = (this.tr = new Transport());
    const current = () => this._roomAttempt === attempt && this.tr === tr;
    tr.onControl = (o) => { if (current()) this._control(o); };
    tr.onMessage = (from, d) => { if (current()) this._message(from, d); };
    tr.onClose = (reason) => { if (current()) this._closed(reason); };
    this._setState('connecting');
    // State listeners may cancel synchronously before the socket is acquired.
    if (!current()) throw cancelled();
    const me = this._profile();
    const welcome = await tr.connect(code, name || me.name, create);
    if (!current()) throw cancelled();
    this.code = code;
    this.myId = welcome.id;
    this.hostId = welcome.host;
    this._members.clear();
    for (const m of welcome.members) this._members.set(m.id, m.name);
    this.lobby = this._blankLobby();
    this._botsPref = this.isHost ? true : null;
    if (this.isHost) {
      this.lobby.players = [this._newPlayer(this.myId, name || me.name, { weapon: me.weapon, style: me.style })];
      this._fixTeams();
    }
    this._setState('lobby');
    if (!current()) throw cancelled();
    if (!this.isHost) tr.sendTo(this.hostId, { k: 'me', name: name || me.name, weapon: me.weapon, style: me.style });
    this._pushLobby();
  }

`, rel);
    code = replaceOnce(code, `  leave(silent = false) {
`, `  leave(silent = false) {
    this._roomAttempt++;
    clearTimeout(this._goT); this._goT = null;
`, rel);
    code = replaceOnce(code, `    this._startCfg = null;
    if (!silent`, `    this._startCfg = null;
    this._ready = null; this._botsPref = null; this._pingT = 0;
    if (!silent`, rel);
    code = replaceOnce(code, `  _fail(e) {
    this.error = e?.message || 'Could not connect';
    this.tr?.close(); this.tr = null;`, `  _fail(e) {
    this.leave(true);
    this.error = e?.message || 'Could not connect';`, rel);
    code = replaceOnce(code, `    this.error = reason === 'bye' ? null : 'Lost connection to the room';
    this.match?.dispose(); this.match = null;
    this.tr = null;
    this.code = null;`, `    this.leave(true);
    this.error = reason === 'bye' ? null : 'Lost connection to the room';`, rel);
    code = replaceOnce(code, `  async _begin(cfg) {
    this._startCfg = cfg;`, `  async _begin(cfg) {
    clearTimeout(this._goT); this._goT = null;
    const attempt = this._roomAttempt, tr = this.tr;
    const current = () => this._roomAttempt === attempt && this.tr === tr && this._startCfg === cfg;
    this._startCfg = cfg;`, rel);
    code = replaceOnce(code, `    this._setState('starting');
    this._emit('match', { phase: 'start' });`, `    this._setState('starting');
    if (!current()) return;
    this._emit('match', { phase: 'start' });
    if (!current()) return;`, rel);
    code = replaceOnce(code, `    if (this.state !== 'starting' || this._startCfg !== cfg) return;`, `    if (!current() || this.state !== 'starting') return;`, rel);
    code = replaceOnce(code, `    } catch (e) {
      console.error('[net] match start failed', e);`, `    } catch (e) {
      if (!current()) return;
      console.error('[net] match start failed', e);`, rel);
    code = replaceOnce(code, `    if (this.isHost) this._markReady(this.myId);`, `    if (!current()) return;
    if (this.isHost) this._markReady(this.myId);`, rel);
    code = replaceOnce(code, `    else if (!this._goT) this._goT = setTimeout(() => this._go(), 12000);   // don't hold everyone for one slow load`, `    else if (!this._goT) {
      const attempt = this._roomAttempt, cfg = this._startCfg, tr = this.tr;
      this._goT = setTimeout(() => {
        if (this.state === 'starting' && this._roomAttempt === attempt && this._startCfg === cfg && this.tr === tr) this._go();
      }, 12000);
    }`, rel);
    // #1154: GO may beat lobby launch, world build or shader warmup.
    // Readiness belongs to this exact cfg; a packet never skips local setup.
    code = replaceOnce(code, `    this._startCfg = cfg;`, `    this._startCfg = cfg;
    this._setupReady = false; this._goPending = null;`, rel);
    code = replaceOnce(code, `    if (!current()) return;
    if (this.isHost) this._markReady(this.myId);`, `    if (!current() || !this.match || this.match._disposed) return;
    this._setupReady = true;
    if (this.isHost) this._markReady(this.myId);`, rel);
    code = replaceOnce(code, `    else this.tr?.sendTo(this.hostId, { k: 'ready', id: cfg.id });`, `    else this.tr?.sendTo(this.hostId, { k: 'ready', id: cfg.id });
    if (current() && this._goPending === cfg.id) this._launch(cfg.id);`, rel);
    code = replaceOnce(code, `      case 'go': if (from === this.hostId && this.state === 'starting') this._launch(); break;`,
      `      case 'go': if (from === this.hostId && this.state === 'starting' && d.id === this._startCfg?.id) this._launch(d.id); break;`, rel);
    code = replaceOnce(code, `  _launch() {
    this._setState('match');
    this.match?.go();
    G.game.netMatchGo?.();
  }`, `  _launch(id = this._startCfg?.id) {
    if (this.state !== 'starting' || !this._startCfg || id !== this._startCfg.id) return false;
    if (!this._setupReady || !this.match) { this._goPending = id; return false; }
    const match = this.match, cfg = this._startCfg, tr = this.tr;
    const current = () => this.state === 'match' && this.match === match && this._startCfg === cfg && this.tr === tr && !match._disposed;
    this._goPending = null;
    this._setState('match');
    if (!current()) return false;
    match.go();
    if (!current()) return false;
    G.game.netMatchGo?.();
    return true;
  }`, rel);
    // Both leave() and endMatch() invalidate queued GO, including same-room rematches.
    code = code.replaceAll('    this._startCfg = null;', '    this._startCfg = null;\n    this._setupReady = false; this._goPending = null;');
    code = replaceOnce(code, `  endMatch() {
`, `  endMatch() {
    clearTimeout(this._goT); this._goT = null;
`, rel);
  }
  if (rel === 'src/net/netmatch.js') {
    if (code.includes('const reliabilityBind =')) throw new Error(`Reliability network anchor mismatch: ${rel}`);
    // #1157: wrap the final native methods without competing for bind/dispose
    // entry anchors owned by inventory/replication adapters later in the build.
    code = replaceOnce(code, 'export class NetMatch {', 'export class NetMatch {', rel);
    code += `
const reliabilityBind = NetMatch.prototype.bind, reliabilityDispose = NetMatch.prototype.dispose;
NetMatch.prototype.bind = function(match) {
  if (this._disposed || this.match) return false;
  return reliabilityBind.call(this, match);
};
NetMatch.prototype.dispose = function(...args) {
  if (this._disposed) return;
  this._disposed = true;
  return reliabilityDispose.apply(this, args);
};
`;
  }
  if (rel === 'src/net/transport.js') {
    code = replaceOnce(code, `    this.ws = null;
    this.id = null;`, `    this.ws = null;
    this._disconnect = null;
    this.id = null;`, rel);
    code = replaceOnce(code, `  /** Resolves with the welcome frame, rejects with an Error carrying a player-facing message. */
  connect(code, name, create) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
      const url = \`\${relayURL()}/room/\${encodeURIComponent(code)}?name=\${encodeURIComponent(name)}&v=\${PROTO}\${create ? '&create=1' : ''}\`;
      let ws;
      try { ws = new WebSocket(url); } catch { reject(new Error('Could not connect')); return; }
      this.ws = ws;
      const timer = setTimeout(() => { done(reject, new Error('Could not connect')); try { ws.close(); } catch { /* ignore */ } }, 8000);
      const handle = (ev) => {
        const s = typeof ev.data === 'string' ? ev.data : '';
        this.bytesIn += s.length;
        if (s === 'pong') {   // answered by the relay runtime itself (it doubles as our liveness signal there)
          if (this._pingSent) { const r = performance.now() - this._pingSent; this._pingSent = 0; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; }
          return;
        }
        if (s.charCodeAt(0) === 109 && s.charCodeAt(1) === 124) {            // "m|from|json"
          const k = s.indexOf('|', 2);
          let obj; try { obj = JSON.parse(s.slice(k + 1)); } catch { return; }
          this.onMessage?.(s.slice(2, k), obj);
          return;
        }
        let o; try { o = JSON.parse(s); } catch { return; }
        if (o.t === 'err') { done(reject, new Error(o.e || 'Could not connect')); return; }
        if (o.t === 'pong') { const r = performance.now() - o.c; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; return; }
        if (o.t === 'welcome') { this.id = o.id; this._startPing(); done(resolve, o); }
        this.onControl?.(o);
      };
      ws.onmessage = !SIM ? handle : (ev) => {
        const t = Math.max(performance.now() + SIM.lag + Math.random() * SIM.jit + (Math.random() < SIM.spike ? 250 : 0), SIM.last);
        SIM.last = t;
        setTimeout(() => { if (this.ws === ws) handle(ev); }, t - performance.now());
      };
      ws.onclose = (ev) => {
        this._stopPing();
        if (!settled) { done(reject, new Error(ev.reason || 'Could not connect')); return; }
        this.onClose?.(ev.reason || 'Disconnected');
      };
      ws.onerror = () => { if (!settled) done(reject, new Error('Could not connect')); };
    });
  }

`, `  /** Resolves with welcome; explicit cancellation rejects with an AbortError. */
  connect(code, name, create) {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false, timer = null, ws;
      const delayed = new Set();
      const current = () => this.ws === ws;
      const done = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); timer = null;
        fn(value);
      };
      const disconnect = (error) => {
        clearTimeout(timer); timer = null;
        for (const id of delayed) clearTimeout(id);
        delayed.clear();
        ws.onmessage = null; ws.onclose = null; ws.onerror = null;
        if (current()) {
          this.ws = null; this._disconnect = null;
          this.id = null; this._pingSent = 0;
          this._stopPing();
        }
        done(reject, error);
        try { ws.close(1000, 'bye'); } catch { /* ignore */ }
      };
      const url = \`\${relayURL()}/room/\${encodeURIComponent(code)}?name=\${encodeURIComponent(name)}&v=\${PROTO}\${create ? '&create=1' : ''}\`;
      try { ws = new WebSocket(url); } catch { done(reject, new Error('Could not connect')); return; }
      this.ws = ws;
      this._disconnect = disconnect;
      timer = setTimeout(() => {
        if (current() && !settled) disconnect(new Error('Could not connect'));
      }, 8000);
      const handle = (ev) => {
        if (!current()) return;
        const s = typeof ev.data === 'string' ? ev.data : '';
        this.bytesIn += s.length;
        if (s === 'pong') {
          if (this._pingSent) { const r = performance.now() - this._pingSent; this._pingSent = 0; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; }
          return;
        }
        if (s.charCodeAt(0) === 109 && s.charCodeAt(1) === 124) {
          const k = s.indexOf('|', 2);
          let obj; try { obj = JSON.parse(s.slice(k + 1)); } catch { return; }
          this.onMessage?.(s.slice(2, k), obj);
          return;
        }
        let o; try { o = JSON.parse(s); } catch { return; }
        if (o.t === 'err') { if (!settled) disconnect(new Error(o.e || 'Could not connect')); return; }
        if (o.t === 'pong') { const r = performance.now() - o.c; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; return; }
        if (o.t === 'welcome') {
          if (settled) return;
          this.id = o.id; this._startPing(); done(resolve, o);
        }
        this.onControl?.(o);
      };
      ws.onmessage = !SIM ? handle : (ev) => {
        if (!current()) return;
        const t = Math.max(performance.now() + SIM.lag + Math.random() * SIM.jit + (Math.random() < SIM.spike ? 250 : 0), SIM.last);
        SIM.last = t;
        const id = setTimeout(() => { delayed.delete(id); handle(ev); }, t - performance.now());
        delayed.add(id);
      };
      ws.onclose = (ev) => {
        if (!current()) return;
        const pending = !settled;
        disconnect(new Error(ev.reason || 'Could not connect'));
        if (!pending) this.onClose?.(ev.reason || 'Disconnected');
      };
      ws.onerror = () => {
        if (current() && !settled) disconnect(new Error('Could not connect'));
      };
    });
  }

`, rel);
    code = replaceOnce(code, `    const ping = () => {
`, `    const ws = this.ws;
    const ping = () => {
      if (this.ws !== ws) return;
`, rel);
    code = replaceOnce(code, `  close() {
    this._stopPing();
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; try { ws.close(1000, 'bye'); } catch { /* ignore */ } }
  }`, `  close() {
    const disconnect = this._disconnect;
    if (disconnect) disconnect(Object.assign(new Error('Connection cancelled'), { name: 'AbortError' }));
    else { this._stopPing(); this.ws = null; this.id = null; this._pingSent = 0; }
  }`, rel);
  }
  return code;
}
