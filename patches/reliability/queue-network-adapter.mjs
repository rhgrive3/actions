// Queue fixes on the pinned network input. Each anchor is checked exactly once.
function once(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error(`Queue network anchor mismatch: ${rel}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptQueueNetwork(rel, code) {
  if (rel === "src/net/netmatch.js") {
    code = once(code, `    this.myId = session.myId;
    this.byNid = new Map();
    this.hitNextSeq = 0;
    this.hitPending = new Map(); // capped, for relay-confirmed undeliverable hits
`,
      `    this.myId = session.myId;
    this.byNid = new Map();
    this.bossHitPending = []; // only packets refused locally; never replay accepted sends
    this.hitNextSeq = 0;
    this.hitPending = new Map(); // capped, for relay-confirmed undeliverable hits
`, rel);
    code = once(code, `    this.unsubs.length = 0;
    this.hitPending.clear();
    for (const a of this.byNid.values()) this._stopLoops(a);
    if (G.netm === this) G.netm = null;
`,
      `    this.unsubs.length = 0;
    this.hitPending.clear();
    this.bossHitPending.length = 0;
    for (const a of this.byNid.values()) this._stopLoops(a);
    if (G.netm === this) G.netm = null;
`, rel);
    code = once(code, `  sendBossHit(attacker, d, weak, w, crab = -1) {
    if (this.isHost || attacker.nid === undefined) return;
    const L = this.match?.boss?.log; if (L) { L.sent++; L.sentDmg += d; }
    this.s.tr?.sendTo(this.s.hostId, { k: 'bhit', a: attacker.nid, d: r2(d), weak: weak ? 1 : 0, w, c: crab });
  }

`,
      `  sendBossHit(attacker, d, weak, w, crab = -1) {
    if (this.isHost || attacker.nid === undefined) return;
    const message = { k: 'bhit', a: attacker.nid, d: r2(d), weak: weak ? 1 : 0, w, c: crab };
    const L = this.match?.boss?.log;
    if (this.bossHitPending.length >= 64) {
      if (L) L.sendDropped = (L.sendDropped || 0) + 1;
      return false;
    }
    const pending = { message, attacker, life: attacker.netLife ?? 0,
      host: this.s.hostId, tr: this.s.tr, match: this.cfg.id, at: now(), attempts: 0, damage: d };
    this.bossHitPending.push(pending);
    this._flushBossHits();
    return pending.accepted === true;
  }

  _flushBossHits() {
    const L = this.match?.boss?.log, pending = this.bossHitPending;
    let budget = 4;
    while (pending.length && budget-- > 0) {
      const p = pending[0], a = p.attacker;
      if (this._disposed || this.isHost || this.s.hostId !== p.host || this.s.tr !== p.tr ||
          this.cfg.id !== p.match || a.remote || a.owner !== this.myId || a.alive === false ||
          (a.netLife ?? 0) !== p.life || now() - p.at > 0.75 || p.attempts >= 8) {
        pending.shift();
        if (L) L.sendDropped = (L.sendDropped || 0) + 1;
        continue;
      }
      if (p.retryAt > now()) break;
      p.attempts++;
      p.retryAt = now() + TICK;
      let accepted = false;
      try { accepted = p.tr?.sendTo(p.host, p.message) === true; } catch {}
      if (!accepted) {
        if (L) L.sendRefused = (L.sendRefused || 0) + 1;
        break; // preserve sequence order; newer hits cannot overtake a refused one
      }
      pending.shift();
      p.accepted = true;
      if (L) { L.sent++; L.sentDmg += p.damage; }
    }
  }

`, rel);
    code = once(code, `      if (this.tickT < 0) this.tickT = TICK;
      this._sendTick();
    }
  }
`,
      `      if (this.tickT < 0) this.tickT = TICK;
      this._sendTick();
      this._flushBossHits();
    }
  }
`, rel);
    code = once(code, '      if (buf.length > 40) buf.splice(0, buf.length - 40);',
      '      while (buf.length > 40) buf.shift();', rel);
    code = once(code, 'if (buf.length > 40) buf.splice(0, buf.length - 40);',
      'while (buf.length > 40) buf.shift();', rel);
    code = once(code, `  // screen; the clock and judge still move with the host)
  onLeave(id, hostChanged) {
    if (!this.match) return;
    const drop = mapNoBots(this.cfg.map);
`,
      `  // screen; the clock and judge still move with the host)
  onLeave(id, hostChanged) {
    if (hostChanged) this.bossHitPending.length = 0;
    if (!this.match) return;
    const drop = mapNoBots(this.cfg.map);
`, rel);
  }
  if (rel === "src/net/session.js") {
    code = once(code, `
  leave(silent = false) {
    this.match?.dispose(); this.match = null;
    this.tr?.close(); this.tr = null;
`,
      `
  leave(silent = false) {
    this._cancelStartRequest();
    this.match?.dispose(); this.match = null;
    this.tr?.close(); this.tr = null;
`, rel);
    code = once(code, `  _closed(reason) {
    const inMatch = this.state === 'match' || this.state === 'starting';
    this.error = reason === 'bye' ? null : 'Lost connection to the room';
    this.match?.dispose(); this.match = null;
`,
      `  _closed(reason) {
    const inMatch = this.state === 'match' || this.state === 'starting';
    this._cancelStartRequest();
    this.error = reason === 'bye' ? null : 'Lost connection to the room';
    this.match?.dispose(); this.match = null;
`, rel);
    code = once(code, `  // ------------------------------------------------------------------ relay membership
  _control(o) {
    if (o.t === 'join') {
      this._members.set(o.m.id, o.m.name);
      if (this.isHost) {
`,
      `  // ------------------------------------------------------------------ relay membership
  _control(o) {
    if (o.t === 'start_result') {
      const cfg = this._pendingStart;
      if (!this.isHost || this.state !== 'lobby' || !cfg || o.id !== cfg.id) return;
      this._cancelStartRequest();
      if (o.ok) this._begin(cfg);
      else {
        this._emit('startBlocked', { message: 'Room membership changed. Check ready status and start again.' });
        this._pushLobby();
      }
    } else if (o.t === 'join') {
      this._members.set(o.m.id, o.m.name);
      if (this.isHost) {
`, rel);
    code = once(code, `      const hostChanged = o.host && o.host !== this.hostId;
      this.hostId = o.host;
      this.lobby.players = this.lobby.players.filter((p) => p.id !== o.id);
      for (const p of this.lobby.players) p.host = p.id === this.hostId;
`,
      `      const hostChanged = o.host && o.host !== this.hostId;
      this.hostId = o.host;
      if (hostChanged) this._cancelStartRequest();
      this.lobby.players = this.lobby.players.filter((p) => p.id !== o.id);
      for (const p of this.lobby.players) p.host = p.id === this.hostId;
`, rel);
    code = once(code, '  canStart() {', '  canStart() {\n    if (this._pendingStart) return false;', rel);
    code = once(code, '  start() {', '  start() {\n    if (this._pendingStart) return false;', rel);
    code = once(code, `    }
    const cfg = { k: 'start', roster, map: l.map, time: l.time, duration: l.duration, difficulty: l.difficulty, palette: l.palette, mode: boss ? 'boss' : 'turf', host: this.myId, id: Math.random().toString(36).slice(2, 8) };
    this.tr.lock(true);
    this.tr.broadcast(cfg);
    this._begin(cfg);
    return true;
  }

`,
      `    }
    const cfg = { k: 'start', roster, map: l.map, time: l.time, duration: l.duration, difficulty: l.difficulty, palette: l.palette, mode: boss ? 'boss' : 'turf', host: this.myId, id: Math.random().toString(36).slice(2, 8) };
    // The relay atomically checks this roster against admitted sockets and locks.
    // Local construction must wait for its authenticated acceptance.
    this._pendingStart = cfg;
    this._startAckT = setTimeout(() => {
      if (this._pendingStart !== cfg) return;
      this._cancelStartRequest();
      this._fail(new Error('Could not confirm the match start. Reconnect to the room.'));
    }, 5000);
    if (!sendCriticalControl(this, 'START', () => this.tr.broadcast(cfg), G)) return false;
    return true;
  }

  _cancelStartRequest() {
    clearTimeout(this._startAckT);
    this._startAckT = null;
    this._pendingStart = null;
  }

`, rel);
    code = once(code, `  // the match's results have been shown: everyone back to the lobby (the room stays)
  endMatch() {
    this.match?.dispose(); this.match = null;
    this._startCfg = null;
`,
      `  // the match's results have been shown: everyone back to the lobby (the room stays)
  endMatch() {
    this._cancelStartRequest();
    this.match?.dispose(); this.match = null;
    this._startCfg = null;
`, rel);
  }
  if (rel === "src/net/transport.js") {
    code = once(code, "export const COMPAT = 'iw-gameplay-20261023-spawn-exclusion-v1';",
      "export const COMPAT = 'iw-gameplay-20261030-device-source-v2';", rel);
  }
  if (rel === 'src/game/character-style.js') {
    code = once(code, 'const wrap = (v, n) => ((Math.round(v) % n) + n) % n;',
      "const wrap = (v, n) => ((Math.round(typeof v === 'number' && Number.isFinite(v) ? v : 0) % n) + n) % n;", rel);
  }
  if (rel === 'src/core/input.js') {
    code = once(code, '    pad.buttons.forEach((b, i) => {',
      '    const buttons = pad.buttons;\n    for (let i = 0, count = buttons.length; i < count; i++) {\n      if (!(i in buttons)) continue;\n      let b = buttons[i];', rel);
    code = once(code, '      this.padPrev[i] = b.pressed;\n    });',
      '      this.padPrev[i] = b.pressed;\n    }', rel);
  }
  if (rel === 'src/net/session.js') {
    code = once(code, '  _control(o) {',
      '  _control(o) {\n    const controlTransport=this.tr,controlAttempt=this._roomAttempt,controlLobby=this.lobby;', rel);
    code = once(code, "      if (hostChanged) this._emit('host', { hostId: this.hostId });",
      "      if (hostChanged) this._emit('host', { hostId: this.hostId });\n      if(this.tr!==controlTransport||this._roomAttempt!==controlAttempt||this.lobby!==controlLobby)return;\n      if(hostChanged&&this.isHost&&this.state==='lobby'&&!this._reconcileLobbyMembers())return;", rel);
    code = once(code, "    this.tr?.broadcast({ k: 'go', id: this._startCfg.id });",
      "    if (!sendCriticalControl(this, 'GO', () => this.tr?.broadcast({ k: 'go', id: this._startCfg.id }), G)) return false;", rel);
    code = once(code, '  endMatch() {',
      "  endMatch() {\n    if (this.isHost && !sendCriticalControl(this, 'UNLOCK', () => this.tr?.lock(false), G)) return false;", rel);
    code = once(code, 'this.tr.lock(false); ', '', rel);
  }
  if (rel === 'src/net/netmatch.js') {
    code = once(code, '  _sendNow(d) { this.s.tr?.broadcast(d); }',
      "  _sendNow(d) {\n    if (this._disposed || ('match' in this.s && this.s.match !== this)) return false;\n    if (d?.k === 'res' || d?.k === 'end') return sendCriticalControl(this.s, d.k === 'res' ? 'RESULT' : 'END', () => this.s.tr?.broadcast(d), G);\n    return this.s.tr?.broadcast(d);\n  }", rel);
    code = once(code, "    this._sendNow({ k: 'res', cov:", "    return this._sendNow({ k: 'res', cov:", rel);
    code = once(code, "  sendEnd() { if (this.isHost) this._sendNow({ k: 'end' }); }",
      "  sendEnd() { return this.isHost ? this._sendNow({ k: 'end' }) : false; }", rel);
  }
  return code;
}
