import { validNetworkAppearance } from './session-admission.mjs';
// Local admission is not a relay ACK. On a refused lifecycle control, fail the
// exact connection explicitly instead of advancing only the local world.
export function sendCriticalControl(session, kind, send, G) {
  const transport = session.tr, attempt = session._roomAttempt, host = session.hostId, netm = session.match;
  const game = G?.game, match = netm?.match;
  let accepted = false;
  try { accepted = send() === true; } catch {}
  if (session.tr !== transport || session._roomAttempt !== attempt || session.hostId !== host || session.match !== netm) return false;
  if (accepted) return true;
  const reason = `Could not send ${kind}. Reconnect to the room.`;
  session.controlFailure = { kind, reason, match: session._startCfg?.id ?? null };
  session._fail?.(new Error(reason));
  if (match && !session.tr && session.state === 'error' && G?.game === game &&
      game?.match === match && G?.match === match) game.netMatchAborted?.(reason);
  return false;
}

// Aggregate guest-induced lobby fanout without dropping the latest player values.
// Session controls, match readiness and combat traffic never enter this timer.
export function installLobbyGuards(Session, validPlayer) {
  const P = Session.prototype, apply = P._applyMe, broadcast = P._broadcastLobby;
  const leave = P.leave, control = P._control, begin = P._begin, message = P._message;
  function cancel(s) {
    clearTimeout(s._lobbyFanoutTimer); s._lobbyFanoutTimer = null;
    s._lobbyFanoutDirty = false; s._lobbyFanoutAt = -Infinity;
  }
  P._reconcileLobbyMembers = function() {
    if(!this.isHost||this.state!=='lobby'||this.match||!this._members.has(this.myId))return;
    const lobby=this.lobby,tr=this.tr,attempt=this._roomAttempt,profile=this._profile(),seen=new Set(),players=[];
    if(this.lobby!==lobby||this.tr!==tr||this._roomAttempt!==attempt)return;
    for(const p of lobby.players)if(p&&this._members.has(p.id)&&!seen.has(p.id)&&
        typeof p.name==='string'&&(p.team===0||p.team===1||p.team==='auto')&&validPlayer(p)) {seen.add(p.id);players.push(p);}
    for(const [id,name] of this._members)if(!seen.has(id)) {
      const local=id===this.myId,style=local&&validNetworkAppearance(profile.style)?profile.style:null;
      const weapon=local&&validPlayer({weapon:profile.weapon})?profile.weapon:'shooter';
      players.push(this._newPlayer(id,name,local?{weapon,style}:{}));seen.add(id);
    }
    if(this.lobby!==lobby||this.tr!==tr||this._roomAttempt!==attempt||!this.isHost||this.state!=='lobby')return false;
    lobby.players=players;return true;
  };
  P._applyMe = function(id, data) {
    if (this.state !== 'lobby' || !this.isHost || (id !== this.myId && !this._members.has(id))) return;
    const previous = this._guestLobbyUpdate;
    this._guestLobbyUpdate = id !== this.myId;
    try { return apply.call(this, id, data); }
    finally { this._guestLobbyUpdate = previous; }
  };
  P._broadcastLobby = function() {
    if (!this.isHost || !this.tr) return;
    const at = performance.now(), remaining = 100 - (at - (this._lobbyFanoutAt ?? -Infinity));
    if (this._guestLobbyUpdate && remaining > 0) {
      this._lobbyFanoutDirty = true;
      if (!this._lobbyFanoutTimer) {
        const tr = this.tr, lobby = this.lobby, host = this.hostId;
        this._lobbyFanoutTimer = setTimeout(() => {
          this._lobbyFanoutTimer = null;
          if (!this._lobbyFanoutDirty || this.tr !== tr || this.lobby !== lobby ||
              this.hostId !== host || !this.isHost || this.state !== 'lobby') return;
          this._lobbyFanoutDirty = false; this._lobbyFanoutAt = performance.now();
          broadcast.call(this);
        }, remaining);
      }
      return;
    }
    clearTimeout(this._lobbyFanoutTimer); this._lobbyFanoutTimer = null;
    this._lobbyFanoutDirty = false; this._lobbyFanoutAt = at;
    return broadcast.call(this);
  };
  P._message = function(from, data) {
    if (data?.k === 'lobby' && this.state !== 'lobby') return;
    if (data?.k === 'emote') {
      if (this.state !== 'lobby' || !this._members.has(from) ||
          !['booyah', 'wave', 'dance', 'flex'].includes(data.n)) return;
      const times = this._emoteTimes || (this._emoteTimes = new Map()), at = performance.now();
      if (at - (times.get(from) ?? -Infinity) < 1300) return;
      times.set(from, at);
    }
    return message.call(this, from, data);
  };
  P._control = function(data) {
    const previousHost = this.hostId, transport=this.tr, attempt=this._roomAttempt, lobby=this.lobby;
    if (data?.t === 'leave') {
      this._emoteTimes?.delete(data.id);
      if (data.host !== this.hostId) cancel(this);
    }
    const result = control.call(this, data);
    if(this.tr!==transport||this._roomAttempt!==attempt||this.lobby!==lobby)return result;
    // END may already have reached the survivors when the former host's
    // UNLOCK failed. A newly elected host that has completed that round can
    // reconcile admission; an active/starting match never enters this path.
    if (data?.t === 'leave' && this.hostId !== previousHost && this.isHost &&
        this.state === 'lobby' && this.tr && !this.match && !this._startCfg && !this._pendingStart)
      sendCriticalControl(this, 'UNLOCK', () => this.tr.lock(false));
    return result;
  };
  P._begin = function(...args) { cancel(this); this._emoteTimes?.clear(); return begin.apply(this, args); };
  P.leave = function(...args) { cancel(this); this._emoteTimes?.clear(); return leave.apply(this, args); };
}
