// Host-owned Private Battle team assignments (#1039), fail-closed build adapter.
// The locked public source tree is never changed in place.
export function adaptHostTeams(rel, code, replaceOnce) {
  const patch=(from,to,label)=>{ code=replaceOnce(code,from,to,'host-team: '+label); };
  if (rel === 'styles/mobile.css') return code + `
/* #1039 host assignment is an interactive roster on every input surface. */
.iw-lobby.is-host-teams .iw-lob__roster { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.iw-lobby.is-host-teams .iw-lob__member { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 10px; background: #21192f; border-radius: 10px; font-size: 13px; }
.iw-lobby.is-host-teams .iw-lob__member > i { width: 24px; height: 24px; flex: none; }
.iw-lobby.is-host-teams .iw-lob__member svg { width: 100%; height: 100%; }
.iw-lobby.is-host-teams .iw-lob__membername { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.iw-lobby.is-host-teams .iw-lob__membername :is(b,small) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-lobby.is-host-teams .iw-lob__memberstate { width: 20px; height: 20px; flex: none; }
.iw-lob__hostteams { display: flex; gap: 4px; flex: none; }
.iw-lob__teamassign, .iw-lob__teamconfirm { color: #fff; background: #392955; border: 2px solid #fff; border-radius: 8px; min-height: 36px; padding: 6px 10px; font: inherit; cursor: pointer; }
.iw-lob__teamassign.is-selected { background: #62501c; border-color: #ffe05a; }
.iw-lob__teamassign.is-focus, .iw-lob__teamconfirm.is-focus { outline: 3px solid #ffe05a; outline-offset: 2px; }
.iw-lob__teamconfirm { flex: 0 1 160px; font-size: 12px; }
@media (max-width: 640px) { .iw-lobby.is-host-teams .iw-lob__roster { grid-template-columns: minmax(0, 1fr); } }
html:not(.iw-touch) .iw-ui:not(.is-touch) .iw-lobby.is-host-teams .iw-lob__roster { position: absolute; left: calc(var(--u) * 32); right: calc(var(--u) * 3.4); top: calc(var(--u) * 14); max-height: calc(100% - var(--u) * 30); overflow: auto; }
`;

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

  if (rel==='src/ui/menus.js') {
    patch("const sig = JSON.stringify([bossMode(), players().map((p) => [p.id, p.name, p.team, p.weapon, p.ready, p.host, p.you])]);",
      "const sig = JSON.stringify([bossMode(), isHost(), !!lob.teamsConfirmed, players().map((p) => [p.id, p.name, p.team, p.weapon, p.ready, p.host, p.you])]);",'host roster refresh');
    patch("    let rosterSignature = '';", "    let rosterSignature = '';\n    const teamAssignButtons = [];",'assignment input owners');
    patch("      rosterSignature = sig;\n      touchRoster.replaceChildren(",
      "      rosterSignature = sig;\n      const focusedTeamAction = teamAssignButtons.find(b => b === this._focus)?.dataset.id;\n      for (const button of teamAssignButtons) this._binds.delete(button);\n      teamAssignButtons.length = 0;\n      touchRoster.replaceChildren(",'retire old roster bindings');
    patch("        return row;\n      }));",
      "        if (isHost() && !bossMode()) {\n          const buttons = [0, 1].map(team => {\n            const button = h('button', { type: 'button', class: 'iw-lob__teamassign' + (p.team === team ? ' is-selected' : ''),\n              title: 'Assign ' + p.name + ' to ' + (team ? 'Bravo' : 'Alpha'), 'aria-pressed': String(p.team === team) }, team ? 'B' : 'A');\n            this._bind(button, { id: 'team-' + p.id + '-' + team, accept: () => {\n              if (isHost() && !bossMode() && !S.launching) safeCall(() => net.assignTeam(p.id,team));\n            } });\n            teamAssignButtons.push(button);\n            return button;\n          });\n          row.appendChild(h('span', { class: 'iw-lob__hostteams' }, buttons));\n        }\n        return row;\n      }));\n      if (focusedTeamAction) {\n        const next = teamAssignButtons.find(b => b.dataset.id === focusedTeamAction);\n        this._setFocus(next || (isHost() && !bossMode() ? confirmTeamsBtn : isHost() ? startBtn : readyBtn), { sound: false });\n      }",'bind host roster assignments');
    patch("    const open = Array.from({ length: 8 }, (_, k) => {",
      "    const confirmTeamsBtn = h('button', { class: 'iw-lob__teamconfirm', type: 'button' }, 'CONFIRM TEAMS');\n    this._bind(confirmTeamsBtn, { id: 'confirm-teams', accept: () => {\n      if (isHost() && !bossMode() && !S.launching) safeCall(() => net.confirmTeams());\n    } });\n    bar.insertBefore(confirmTeamsBtn, readyBtn);\n    const open = Array.from({ length: 8 }, (_, k) => {",'host confirm control');
    patch("      if (bossMode()) { restartAnim(teamRow, 'is-shake'); this._sfx('ui_error', 0.15); return; }",
      "      if (bossMode() || !isHost() || v === 'auto') { restartAnim(teamRow, 'is-shake'); this._sfx('ui_error', 0.15); return; }",'team picker only host');
    patch("      safeCall(() => net.setMe({ team: v }));",
      "      safeCall(() => net.assignTeam(me.id,v));",'no guest team write');
    patch("      const host = isHost();\n      el.classList.toggle('is-host', host);",
      "      const host = isHost();\n      confirmTeamsBtn.style.display = host && !bossMode() ? '' : 'none';\n      confirmTeamsBtn.textContent = lob.teamsConfirmed ? 'TEAMS CONFIRMED — READY UP' : 'CONFIRM TEAMS';\n      el.classList.toggle('is-host-teams', host && !bossMode());\n      // Turf requires the host's own final Ready as well as the guests'.\n      readyBtn.style.display = host && !bossMode() ? 'flex' : '';\n      startBtn.querySelector('.iw-btn__key').style.display = host && !bossMode() ? 'none' : '';\n      el.classList.toggle('is-host', host);",'show host confirmation phase');
    patch("      teamRow.classList.toggle('is-locked', bossMode());",
      "      teamRow.classList.toggle('is-locked', bossMode() || !host);",'guest picker is locked');
    patch("      if (isHost()) { tryStart(); return; }",
      "      if (isHost() && bossMode()) { tryStart(); return; }",'Turf host readies before Start');
    patch("      if (!me || S.launching) return;\n      const v = !me.ready;",
      "      if (!me || S.launching) return;\n      if (!bossMode() && !lob.teamsConfirmed) {\n        this.toast('The host must confirm teams before readying up', { kind: 'info' });\n        return;\n      }\n      const v = !me.ready;",'no optimistic ready before confirmation');
    patch("    const barItems = () => [wChip, lChip, teamRow, emoteBtn, isHost() ? startBtn : readyBtn];",
      "    const barItems = () => [wChip, lChip, teamRow, emoteBtn,\n      ...(isHost() ? (bossMode() ? [startBtn] : [...teamAssignButtons, confirmTeamsBtn, readyBtn, startBtn]) : [readyBtn])];",'reachable confirmation and host ready');
    patch("const sc = next.closest('.iw-rows');",
      "const sc = next.closest('.iw-rows, .iw-lob__roster');",'keep roster navigation visible');
    return code;
  }
  return code;
}
