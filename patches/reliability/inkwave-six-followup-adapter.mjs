function once(code, before, after, label) {
  const i = code.indexOf(before);
  if (i < 0 || code.indexOf(before, i + before.length) >= 0)
    throw new Error('Six-followup adapter anchor mismatch: ' + label);
  return code.slice(0, i) + after + code.slice(i + before.length);
}

// Build-only source connections for the six-issue INKWAVE follow-up.
// Runtime/gameplay ownership remains in the canonical native classes.
export function adaptSixFollowup(rel, code) {
  if (rel === 'src/net/session.js') {
    code = once(code,
      "    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);",
      "    return (this.lobby.mode !== 'turf' || this.lobby.players.length >= 2) && !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);",
      '#1003 canStart two-human Turf minimum');
    code = once(code,
      "    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;",
      "    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock() || (this.lobby.mode === 'turf' && this.lobby.players.length < 2)) return false;",
      '#1003 start two-human Turf minimum');
  }
  if (rel === 'src/main.js') {
    code = once(code,
      "players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats, deaths: a.stats.deaths, isSelf: a.isLocal, bot: !!a.isBot })),",
      "players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats, deaths: a.stats.deaths, isSelf: a.isLocal, bot: !!a.isBot, disconnected: !!a.s3?.disconnected })),",
      '#201 preserve disconnected result identity');
  }
  return code;
}
