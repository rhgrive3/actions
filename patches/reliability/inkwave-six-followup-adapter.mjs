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
    // The host-team adapter may have already replaced both original native
    // anchors. Compose the Turf minimum with its host-confirmation guard instead
    // of requiring the now-absent pre-host-team return expression.
    const withHostTeams = "    return !this.startBlock() && (this.lobby.mode === 'boss' || !!this.lobby.teamsConfirmed) &&\n      this.lobby.players.every(p=>p.ready || (p.id===this.myId && this.lobby.mode==='boss'));";
    if (code.includes(withHostTeams)) {
      code = once(code, withHostTeams,
        "    return (this.lobby.mode !== 'turf' || this.lobby.players.length >= 2) &&\n" +
        withHostTeams.replace('    return ', '    '), '#1003 host-confirmed Turf minimum');
      // Host-team start() delegates to canStart(), so the same new guard
      // applies there without replacing the already-composed start() owner.
      if (!code.includes("    if (!this.isHost || this.state !== 'lobby' || !this.tr || !this.canStart()) return false;"))
        throw new Error('Six-followup adapter anchor mismatch: #1003 confirmed start owner');
    } else {
      code = once(code,
        "    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);",
        "    return (this.lobby.mode !== 'turf' || this.lobby.players.length >= 2) && !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);",
        '#1003 canStart two-human Turf minimum');
      code = once(code,
        "    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;",
        "    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock() || (this.lobby.mode === 'turf' && this.lobby.players.length < 2)) return false;",
        '#1003 start two-human Turf minimum');
    }
  }
  if (rel === 'src/main.js') {
    const judgeStart = code.indexOf('  async _judge() {');
    const judgeEnd = code.indexOf('\n  _fade(', judgeStart);
    if (judgeStart < 0 || judgeEnd < judgeStart) throw new Error('Six-followup adapter anchor mismatch: #201 judge boundary');
    let judge = code.slice(judgeStart, judgeEnd);
    if (!judge.includes('disconnected: !!a.s3?.disconnected')) {
      const rowPattern = /players: m\.actors\.map\(\(a\) => \(\{([^\n]+)\}\)\),/g;
      const rows = [...judge.matchAll(rowPattern)];
      if (rows.length !== 1) throw new Error('Six-followup adapter anchor mismatch: #201 preserve disconnected result identity (' + rows.length + ')');
      judge = judge.replace(rowPattern, (line) => line.replace(' })),', ', disconnected: !!a.s3?.disconnected })),'));
    }
    code = code.slice(0, judgeStart) + judge + code.slice(judgeEnd);
  }
  return code;
}
