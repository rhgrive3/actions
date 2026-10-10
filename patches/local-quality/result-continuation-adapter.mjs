export function adaptResultContinuation(rel, code, once) {
  if(rel==='src/ui/menus.js'){
    code="import { clearContinuation, continuationNavigation, resultChangeButton, resultKeepButton, augmentContinuationLoadout } from '../../patches/local-quality/result-continuation.mjs';\n"+code;
    code=once(code,"    if (name === prev && !force) return;", "    if (name === prev && !force) return;\n    continuationNavigation(this, name, opts);",'continuation native navigation invalidation');
    code=once(code,'  dispose() {','  dispose() {\n    clearContinuation(this, true);','continuation disposal');
    code=once(code,'  showResults(data) {','  showResults(data) {\n    clearContinuation(this); this._onlineResultWaiting=null;','continuation results replacement');
    code=once(code,"    const scr = this['_scr_' + name](opts);", "    const scr = this['_scr_' + name](opts);\n    if (name === 'loadout') augmentContinuationLoadout(this, scr);",'continuation existing loadout augmentation');
    code=once(code,'    const backIn = online ? 12 : 0;', "    const onlineTurf = online && !boss;\n    const backIn = online && boss ? 12 : 0;", 'Turf results have no forced countdown');
    code=once(code,"const lobbyPill = online ?", "const lobbyPill = online && boss ?", 'Turf explicit continuation status');
    code=once(code,"const hostBack = online && G.net", "const hostBack = online && boss && G.net", 'Turf host also chooses individually');
    return once(code,'hostBack ? null : lobbyPill, rematch, home','hostBack ? null : lobbyPill, onlineTurf ? resultKeepButton(this, d) : rematch, resultChangeButton(this, d), home','continuation Turf result choice');
  }
  if(rel==='src/main.js'){
    code="import { restoreResultShowcase } from '../patches/local-quality/result-continuation.mjs';\n"+code;
    code="import { chooseOnlineContinuation } from '../patches/splatoon3/runtime/disconnect-fidelity.mjs';\n"+code;
    code=once(code,'      quitMatch: () => self.quitToMenu(),', `      netContinue: (choice) => {
        if (self.match?.mode !== 'turf' || self.match.state !== 'results' || !G.netm) return false;
        if (choice === 'keep') G.net?.setMe?.({weapon:self.profile.weapon, style:self.profile.style});
        return chooseOnlineContinuation(G.netm, choice);
      },
      quitMatch: () => self.quitToMenu(),`, 'online result loadout and intent API');
    // Only the Turf block. The Boss result timer above it is intentionally distinct.
    const timerRaw = `    // online: the host brings the room back to the lobby once everyone has seen the results
    if (G.netm) {
      if (G.net.isHost) this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);
    }`;
    const timerGuarded = `    // online: the host brings the room back to the lobby once everyone has seen the results
    if (netm) {
      if (net.isHost) this._netEndT = setTimeout(() => {
        if (!resultsCurrent() || m.state !== 'results' || !net.isHost) return;
        netm.sendEnd(); this.netMatchEnd();
      }, 12000);
    }`;
    code=once(code, code.includes(timerGuarded) ? timerGuarded : timerRaw,
      '    // Turf waits for each connected player to keep going or leave.', 'remove Turf forced return');
    return once(code,'    if (!this.showcase) return;','    if (!this.showcase) return;\n    restoreResultShowcase(this, G, s);','continuation original result podium');
  }
  if(rel==='src/net/session.js'){
    code="import { continuationReadyPlayers } from '../../patches/splatoon3/runtime/disconnect-fidelity.mjs';\n"+code;
    code=once(code,'  endMatch() {', '  endMatch() {\n    const continuationReady = continuationReadyPlayers(this);', 'consume match-scoped continuation ready intent');
    const readyRaw='if (this.isHost) { this.tr.lock(false); for (const p of this.lobby.players) p.ready = false;';
    const readyGuarded='if (this.isHost) { this.tr.lock(false); this.lobby.teamsConfirmed=false;\n      for (const p of this.lobby.players) p.ready=false;';
    const ready=code.includes(readyGuarded)?readyGuarded:readyRaw;
    return once(code,ready,ready.replace(/p\.ready\s*=\s*false/, 'p.ready = continuationReady.has(p.id)'), 'carry explicit keep choices into lobby');
  }
  if(rel==='styles/ui.css')return code+'\n/* #478: existing loadout actions, preserving responsive flow. */\n.iw-continuation-actions { flex-direction: column; gap: 12px; max-height: calc(100vh - var(--u) * 5.2 - var(--sat) - var(--sab)); overflow-y: auto; }\n.iw-continuation-actions > * { flex-shrink: 0; }\n.iw-continuation-actions > .s3-gear { position: relative; inset: auto; width: 100%; max-height: none; box-sizing: border-box; }\n.iw-res__btns { flex-wrap: wrap; }\n.iw-results .iw-res__btns [data-id="change-gear-continue"] { height: auto; min-height: 48px; padding-top: 10px; padding-bottom: 10px; }\n';
  return code;
}
