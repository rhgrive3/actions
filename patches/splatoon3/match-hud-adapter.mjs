// Public result/feedback presentation only. Match durations and end-of-play
// simulation are deliberately unchanged (90-second matches remain supported).
function once(code, before, after, label) {
  const at=code.indexOf(before);
  if(at<0||code.indexOf(before,at+before.length)>=0) throw Error(`INKWAVE match HUD conflict: ${label}`);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
function region(code, start, end, transform) {
  const a=code.indexOf(start),b=code.indexOf(end,a);
  if(a<0||b<a)throw Error('INKWAVE match HUD region conflict: '+start);
  return code.slice(0,a)+transform(code.slice(a,b))+code.slice(b);
}
export function adaptMatchHud(rel,code) {
  if(rel==='src/main.js') {
    return region(code,'  async _judge() {','\n  _fade(to, ms)',s=>once(s,'deaths: a.stats.deaths, isSelf:','deaths: a.stats.deaths, specials: a.stats.specials || 0, isSelf:','authoritative special count in Turf results'));
  }
  if(rel==='src/ui/hud.js') {
    code=once(code,"const key = `${p.alive ? 1 : 0}|${p.alive ? 0 : Math.ceil(p.respawn || 0)}|", "const key = `${p.alive ? 1 : 0}|0|",'qualitative squad status cache key');
    code=once(code,"el.querySelector('.iw-sq__n').textContent = p.alive ? '' : String(Math.max(0, Math.ceil(p.respawn || 0)) || '');", "el.querySelector('.iw-sq__n').textContent = '';",'squad numeric countdown hidden');
    return once(code,"ring.style.animationDuration = `${Math.max(0.2, p.respawn || PLAYER.respawnTime)}s`;", "ring.style.display = 'none';",'squad countdown ring hidden');
  }
  if(rel==='src/ui/menus.js') {
    code=once(code,'respawn: x.alive === false ? Math.max(0, +x.respawnTimer || 0) : 0','respawn: x.alive === false ? x.team === m.local?.team ? Math.max(0, +x.respawnTimer || 0) : null : 0','pause snapshot excludes opposing timer');
    code=once(code,'const sig = !p.alive ? `d${Math.ceil(p.respawn)}`', "const sig = !p.alive ? (p.team === me.team ? `d${Math.ceil(p.respawn)}` : 'd')",'pause enemy status cache');
    code=once(code,'<b>${Math.max(1, Math.ceil(p.respawn))}s</b>', "${p.team === me.team ? '<b>' + Math.max(1, Math.ceil(p.respawn)) + 's</b>' : ''}",'pause enemy timer hidden');
    return region(code,'    // ---- team tables with count-ups','    // ---- boss: the squad ranked',s=>{
    s=once(s,'iw-ttable iw-ttable--${team', 'iw-ttable iw-ttable--turf iw-ttable--${team','Turf-only result layout');
    s=once(s,"h('span', { class: 'iw-ttable__col', title: 'Times splatted' }, h('i', { html: DEATH_ICON }))),", "h('span', { class: 'iw-ttable__col', title: 'Times splatted' }, h('i', { html: DEATH_ICON })),\n          h('span', { class: 'iw-ttable__col', title: 'Special uses' }, 'SP')),",'special result header');
    s=once(s,"          const badges = h('span',", "          const nSpecial = h('span', { class: 'iw-prow__n iw-prow__special is-wait', title: 'Special uses' }, String(p.specials || 0));\n          const badges = h('span',",'special result number');
    s=once(s,'            nSplat, nDeath);','            nSplat, nDeath, nSpecial);','special result cell');
    return once(s,'rowFx.push({ row, turfNum, turfBar, nSplat, nDeath, badges,','rowFx.push({ row, turfNum, turfBar, nSplat, nDeath, waits: [nSplat, nDeath, nSpecial], badges,','special count participates in native reveal');
    });
  }
  if(rel==='src/net/netmatch.js') {
    // A monotonic owner counter is replay-safe. Never count visual special
    // events, since duplicates, snapshots and delayed replay must not add uses.
    code='function acceptSpecialCount(a, n) { if (a && Number.isSafeInteger(n) && n >= 0) a.stats.specials = Math.max(a.stats.specials || 0, n); }\n'+code;
    code=once(code,'r2(wr.lockT || 0)];','r2(wr.lockT || 0), a.stats.specials || 0];','snapshot special counter');
    code=once(code,'      buf.push(snap);\n      if (buf.length > 40)', '      acceptSpecialCount(a, s[21]);\n      buf.push(snap);\n      if (buf.length > 40)','owner-admitted current special counter');
    code=once(code,"this._sendNow({ k: 'res', cov: result.coverage, win: result.winner, mode: result.mode, bo: result.boss,", "this._sendNow({ k: 'res', cov: result.coverage, win: result.winner, mode: result.mode, bo: result.boss,\n      specialCounts: this.match.actors.map(a => [a.nid, a.stats.specials || 0]),",'final special counters outside legacy stat tuple');
    return once(code,'  _result(d) {\n    const m = this.match;\n    if (!m || this.isHost) return;', '  _result(d) {\n    const m = this.match;\n    if (!m || this.isHost) return;\n    for (const entry of Array.isArray(d.specialCounts) ? d.specialCounts : []) if (Array.isArray(entry) && entry.length === 2) acceptSpecialCount(this.byNid.get(entry[0]), entry[1]);','final special counter restore');
  }
  return code;
}
