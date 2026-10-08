// Host-owned Private Battle team assignments (#1039), fail-closed build adapter.
// The locked public source tree is never changed in place.
export function adaptHostTeams(rel, code, replaceOnce) {
  const patch=(from,to,label)=>{ code=replaceOnce(code,from,to,'host-team: '+label); };
  if (rel==='src/net/session.js') {
    patch("mode: 'turf', players: [], maxPlayers: TEAM * 2",
      "mode: 'turf', teamsConfirmed: false, players: [], maxPlayers: TEAM * 2",'blank lobby');
    patch("mode: l.mode, players: l.players.map(",
      "mode: l.mode, teamsConfirmed: !!l.teamsConfirmed, players: l.players.map(",'wire confirmation');
    patch("          this.lobby.mode = l.mode === 'boss' ? 'boss' : 'turf';",
      "          this.lobby.mode = l.mode === 'boss' ? 'boss' : 'turf';\n          this.lobby.teamsConfirmed = !!l.teamsConfirmed;",'receive host confirmation');
    patch("    if (ch.team === 0 || ch.team === 1 || ch.team === 'auto') o.team = ch.team;",
      "    // Guest-owned setMe cannot author or forge a final team assignment.",'deny self team');
    patch("    if (o.ready != null) p.ready = !!o.ready;",
      "    if (o.ready != null) p.ready = !!o.ready && (this.lobby.mode === 'boss' || !!this.lobby.teamsConfirmed);",'ready after confirm');
    patch("    if (o.team === 'auto') p.team = 'auto';\n    else if (o.team === 0 || o.team === 1) {\n      const n = this.lobby.players.filter((x) => x !== p && x.team === o.team).length;\n      if (n < TEAM) p.team = o.team;\n    }",
      "    // Ignore untrusted guest 'me.team'; team changes are host-authoritative.",'reject forged team');
    patch("  setSettings(s = {}) {",
      "  assignTeam(id, team) {\n    if (!this.isHost || this.state !== 'lobby' || this.lobby.mode !== 'turf' ||\n        (team !== 0 && team !== 1)) return false;\n    const p=this.lobby.players.find(p=>p.id===id);\n    if (!p) return false;\n    if (p.team !== team) {\n      const others=this.lobby.players.filter(x=>x!==p && x.team===team);\n      if (others.length>=TEAM) {\n        const swap=others[0]; if (!swap) return false;\n        swap.team=p.team;\n      }\n      p.team=team;\n    }\n    this._fixTeams();\n    this.lobby.teamsConfirmed=false;\n    for (const x of this.lobby.players) x.ready=false;\n    this._broadcastLobby();\n    return true;\n  }\n  confirmTeams() {\n    if (!this.isHost || this.state !== 'lobby' || this.lobby.mode !== 'turf') return false;\n    this._fixTeams();\n    if (this.lobby.players.some(p=>p.team!==0 && p.team!==1)) return false;\n    this.lobby.teamsConfirmed=true;\n    for (const p of this.lobby.players) p.ready=false;\n    this._broadcastLobby();\n    return true;\n  }\n  setSettings(s = {}) {",'host assignment API');
    patch("    const l = this.lobby, wasMap = l.map;",
      "    const l = this.lobby, wasMap = l.map, oldMode = l.mode;",'save old mode');
    patch("    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);\n    this._broadcastLobby();",
      "    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);\n    if (oldMode !== l.mode) { l.teamsConfirmed=false; for (const p of l.players) p.ready=false; }\n    this._broadcastLobby();",'invalidate changed mode');
    patch("        this._fixTeams();\n        this._broadcastLobby();",
      "        this._fixTeams();\n        this.lobby.teamsConfirmed=false;\n        for (const p of this.lobby.players) p.ready=false;\n        this._broadcastLobby();",'joined player resets teams');
    patch("      if (this.isHost) { this._fixTeams(); this._broadcastLobby(); }",
      "      if (this.isHost) { this._fixTeams(); this.lobby.teamsConfirmed=false;\n        for (const p of this.lobby.players) p.ready=false; this._broadcastLobby(); }",'left player resets teams');
    patch("    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);",
      "    return !this.startBlock() && (this.lobby.mode === 'boss' || !!this.lobby.teamsConfirmed) &&\n      this.lobby.players.every(p=>p.ready || (p.id===this.myId && this.lobby.mode==='boss'));",'all player final ready');
    patch("    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;",
      "    if (!this.isHost || this.state !== 'lobby' || !this.tr || !this.canStart()) return false;",'start respects confirmation');
    patch("    if (this.isHost) { this.tr.lock(false); for (const p of this.lobby.players) p.ready = false; this._broadcastLobby(); }",
      "    if (this.isHost) { this.tr.lock(false); this.lobby.teamsConfirmed=false;\n      for (const p of this.lobby.players) p.ready=false; this._broadcastLobby(); }",'new match requires reassignment');
    return code;
  }
  return code;
}
