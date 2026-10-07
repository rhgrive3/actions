// Public-source connections for score/results and bounded combat information.
function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error(`INKWAVE score/HUD conflict: ${label}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptScoreHud(rel, code) {
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, '  reset() {', '  reset() {\n    if (this.s3) delete this.s3.revealedUntil;', 'reset revealed position');
    return replaceOnce(code,
    'this.stats = { turf: 0, splats: 0, deaths: 0, specials: 0 };',
    'this.stats = { turf: 0, splats: 0, assists: 0, deaths: 0, specials: 0 };', 'assist stat');
  }
  if (rel === 'src/world/paint.js') {
    code = replaceOnce(code, '        claimed += cellA;\n        if (f.turf && !this.dead[k]) {',
      '        changed = true;\n        if (f.turf && !this.dead[k]) {\n          claimed += cellA;', 'point-eligible paint area');
    code = replaceOnce(code, '    if (claimed > 0) this.version++;', '    if (changed) this.version++;', 'wall paint cache invalidation');
    const start = code.indexOf('  _cpuSplat('), end = code.indexOf('\n  _pushQuad(', start);
    if (start < 0 || end < start) throw new Error('INKWAVE score/HUD conflict: cpu paint method');
    const section = replaceOnce(code.slice(start, end), 'let claimed = 0;', 'let claimed = 0, changed = false;', 'paint mutation flag');
    return code.slice(0, start) + section + code.slice(end);
  }
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code, '  _remoteRespawn(a) {', '  _remoteRespawn(a) {\n    if (a.s3) delete a.s3.revealedUntil;\n    a.lastDamage = 99;', 'reset remote health disclosure');
    code = replaceOnce(code, "      case 'splatted': this._remoteSplat(e.victim, e.attacker, e.cause); return;", "      case 'splatted':\n        if (!e.victim?.alive) return;\n        this._remoteSplat(e.victim, e.attacker, e.cause);\n        emit('splatted', e); return;", 'replicated assist event');
    code = replaceOnce(code, '    if (v && v.nid !== undefined && v.character) o[k] = { n: v.nid };', "    if (k === 'assists' && Array.isArray(v)) { o[k] = v.map(a => a.nid).filter(Number.isInteger); o.assistLives = Object.fromEntries(v.filter(a => Number.isInteger(a?.nid) && Number.isSafeInteger(a.netLife) && a.netLife >= 0).map(a => [a.nid, a.netLife])); }\n    else if (v && v.nid !== undefined && v.character) o[k] = { n: v.nid };", 'pack assist actors');
    code = replaceOnce(code, "    if (v && typeof v === 'object' && !Array.isArray(v) && v.n !== undefined) e[k] = nm.byNid.get(v.n) || null;", "    if (k === 'assists' && Array.isArray(v)) e[k] = v.map(n => nm.byNid.get(n)).filter(Boolean);\n    else if (v && typeof v === 'object' && !Array.isArray(v) && v.n !== undefined) e[k] = nm.byNid.get(v.n) || null;", 'unpack assist actors');
    code = replaceOnce(code, 'a.stats.weakHits || 0])', 'a.stats.weakHits || 0, a.stats.assists || 0])', 'network result assists');
    code = replaceOnce(code, 'for (const [nid, turf, splats, deaths, bossDmg, weakHits] of d.st || [])', 'for (const [nid, turf, splats, deaths, bossDmg, weakHits, assists] of d.st || [])', 'read network result assists');
    code = replaceOnce(code, 'a.stats.splats = splats; a.stats.deaths = deaths;', 'a.stats.splats = splats; a.stats.assists = assists || 0; a.stats.deaths = deaths;', 'restore network result assists');
    code = replaceOnce(code, '    if (S.hp < a.hp - 0.5) a.hurtFlash', '    if (S.hp < a.hp) a.lastDamage = 0;\n    if (S.hp < a.hp - 0.5) a.hurtFlash', 'remote damage timestamp');
    return replaceOnce(code, '    Math.round(a.hp), Math.round(a.ink)', '    r2(a.hp), Math.round(a.ink)', 'remote map threshold precision');
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code, 'const gained = Math.round((won ? PROGRESSION.xpWin : PROGRESSION.xpLose) + turf * PROGRESSION.xpPerTurfPoint + local.stats.splats * PROGRESSION.xpPerSplat);', 'const gained = turfExperience(turf, won).total;', 'Turf rank XP');
    code = replaceOnce(code, 'players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats,', 'players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats + (a.stats.assists || 0), directSplats: a.stats.splats, assists: a.stats.assists || 0,', 'battle result count');
    code = replaceOnce(code, "          // enemies only show on the map when visible to your team (not submerged far away)\n          if (o.anim.form === 'swim') continue;", '          if (!mapActorVisible(o, a, PLAYER.hp, G.time)) continue;', 'map damage disclosure');
    code = replaceOnce(code, '      markers,\n      prompt,', '      markers,\n      healthMarkers: buildHealthMarkers(this, G, PLAYER, THREE),\n      prompt,', 'world health frame');
    return "import { turfExperience } from '../patches/splatoon3/runtime/results-scoring.mjs';\nimport { mapActorVisible, buildHealthMarkers } from '../patches/splatoon3/runtime/combat-info.mjs';\n" + code;
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code, '  _onSplatted({ victim, attacker }) {', '  _onSplatted({ victim, attacker, assists = [] }) {', 'authoritative assist card');
    code = replaceOnce(code, 'me && attacker && attacker.team === me.team && K.dealt.has(victim) && now - K.dealt.get(victim) < 4', 'me && assists.includes(me)', 'shared assist admission');
    return code;
  }
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code, '    const bd = [];\n    if (self) {', '    const bd = [];\n    if (self && !boss) {\n      const parts = turfExperienceBreakdown(self.turf || 0, win);\n      if (parts.reduce((n, p) => n + p[1], 0) === xp.gained) bd.push(...parts);\n    }\n    if (self && boss) {', 'rank XP breakdown');
    return "import { turfExperienceBreakdown } from '../../patches/splatoon3/runtime/results-scoring.mjs';\n" + code;
  }
  return code;
}
