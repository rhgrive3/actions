// Dedicated 2v2 / 1v1 mode and its own stage, Inkbox Depot (owner request
// 2026-11-06). Built the way the Practice Range is: the stage is not a config
// MAPS entry (duel/depot-map.mjs), so no ordinary stage list sees it, and only
// its own mode reaches it. Applied last, on the final composed text.
//
// - world/maps.js: the layout (duel/depot-layout.mjs).
// - main.js: startMatch resolves 'depot' (offline, from the PLAY → 2v2・1v1
//   card) and online starts on it; a Match takes `teamSize` (1-4); the PLAY
//   card is installed where the lazy Menus class loads.
// - net/session.js: lobby modes 'duo' (2v2) and 'solo' (1v1) run only on Inkbox
//   Depot, and Inkbox Depot runs only in those modes. Team caps, the optional
//   bot fill and the START roster follow the mode; more humans on a team than
//   the cap block the start with a reason. The match is ordinary Turf War
//   ('turf') with fewer actors, so scoring, results and replication keep their
//   single owner.
// - ui/menus.js: the lobby mode arrows also cycle 2v2 / 1v1; their stage list is
//   Inkbox Depot alone, and every other mode's list excludes it.
const DUEL_IMPORT_SRC = "import { DEPOT_MAP, DUEL_MODES as SMALL_TEAM_MODES, isDuelMode as isSmallTeamMode } from '../../patches/splatoon3/duel/depot-map.mjs';\n";
const DUEL_IMPORT_MAIN = "import { DEPOT_MAP, depotMapFor, isDepotMap } from '../patches/splatoon3/duel/depot-map.mjs';\n" +
  "import { installDuelMenus } from '../patches/splatoon3/duel/menu.mjs';\n";

export function adaptSmallTeamModes(rel, code, replaceOnce) {
  if (rel === 'src/world/maps.js') {
    code = "import { LAYOUT as DEPOT } from '../../patches/splatoon3/duel/depot-layout.mjs';\n" + code;
    return replaceOnce(code, 'MAP_LAYOUTS.scorch = SCORCH;', 'MAP_LAYOUTS.scorch = SCORCH;\nMAP_LAYOUTS.depot = DEPOT;', 'depot layout registration');
  }
  if (rel === 'src/game/match.js') {
    return replaceOnce(code,
      "    const titleTeamSize = this.attract && o.titleDemo && !o.mannequins ? 2 : MATCH.teamSize;",
      "    const titleTeamSize = this.attract && o.titleDemo && !o.mannequins ? 2 : (Number.isInteger(o.teamSize) && o.teamSize >= 1 && o.teamSize <= MATCH.teamSize ? o.teamSize : MATCH.teamSize);",
      'match team size');
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      "      mode: o.mode === 'boss' || isRankedMode(o.mode) ? o.mode : 'turf',\n    };",
      "      mode: o.mode === 'boss' || isRankedMode(o.mode) ? o.mode : 'turf',\n      teamSize: Number.isInteger(o.teamSize) && o.teamSize >= 1 && o.teamSize <= 4 ? o.teamSize : undefined,\n    };",
      'menu start keeps the team size');
    code = replaceOnce(code,
      '    let map = MAPS.find((m) => m.id === opts.mapId) || rangeMapFor(opts.mapId) || MAPS[0];',
      '    let map = MAPS.find((m) => m.id === opts.mapId) || rangeMapFor(opts.mapId) || depotMapFor(opts.mapId) || MAPS[0];', 'depot map lookup');
    code = replaceOnce(code,
      '    if (!mapOfflineOk(map.id) && !DEV_STAGE && !isRangeMap(map)) {',
      '    if (!mapOfflineOk(map.id) && !DEV_STAGE && !isRangeMap(map) && !isDepotMap(map)) {', 'depot offline admission');
    code = replaceOnce(code,
      " range: isRangeMap(map),",
      " range: isRangeMap(map), teamSize: map.duel ? (Number.isInteger(opts.teamSize) ? opts.teamSize : map.teamSize) : undefined,",   // (inline: harnesses compile this method without its imports)
      'depot offline team size');
    code = replaceOnce(code,
      '    const map = MAPS.find((m) => m.id === cfg.map) || MAPS[0];',
      '    const map = MAPS.find((m) => m.id === cfg.map) || depotMapFor(cfg.map) || MAPS[0];', 'depot online stage');
    code = replaceOnce(code,
      'installCustomMatchMenus(menusMod.Menus);',
      'installCustomMatchMenus(menusMod.Menus); installDuelMenus(menusMod.Menus);', 'duel PLAY card');
    return DUEL_IMPORT_MAIN + code;
  }
  if (rel === 'src/net/session.js') {
    // Every session.js insertion is inline (literal 'depot', mode checks): the
    // network harnesses compile these method bodies without module scope.
    code = replaceOnce(code,
      `    const map = g?.mapDef?.id || MAPS[0].id;`,
      `    const map = (g?.mapDef?.id !== 'depot' && g?.mapDef?.id) || MAPS[0].id;   // (Inkbox Depot opens only with its 2v2 / 1v1 modes)`, 'new rooms never open on Inkbox Depot');
    code = replaceOnce(code,
      `{ if (count[p.team] < TEAM) count[p.team]++; else p.team = 'auto'; }`,
      `{ if (count[p.team] < (this.lobby.mode === 'solo' ? 1 : this.lobby.mode === 'duo' ? 2 : TEAM)) count[p.team]++; else p.team = 'auto'; }`, 'team cap in fixTeams');
    code = replaceOnce(code,
      `if (others.length>=TEAM) {`,
      `if (others.length>=(this.lobby.mode === 'solo' ? 1 : this.lobby.mode === 'duo' ? 2 : TEAM)) {`, 'team cap in assignTeam');
    code = code.split(`(this.lobby.mode !== 'turf' && !isRankedMode(this.lobby.mode))`).join(`(this.lobby.mode !== 'turf' && this.lobby.mode !== 'duo' && this.lobby.mode !== 'solo' && !isRankedMode(this.lobby.mode))`);
    // Inkbox Depot belongs to the 2v2 / 1v1 modes alone.
    code = replaceOnce(code,
      `    if (s.map && MAPS.some((m) => m.id === s.map)) l.map = s.map;`,
      `    if (s.map && MAPS.some((m) => m.id === s.map)) l.map = s.map;
    else if (s.map === 'depot') l.map = s.map;`, 'depot room stage');
    code = replaceOnce(code,
      `if (s.mode === 'turf' || s.mode === 'boss' || isRankedMode(s.mode)) l.mode = s.mode;`,
      `if (s.mode === 'turf' || s.mode === 'boss' || isRankedMode(s.mode) || s.mode === 'duo' || s.mode === 'solo') l.mode = s.mode;
    if (l.mode === 'duo' || l.mode === 'solo') l.map = 'depot';
    else if (l.map === 'depot') l.map = MAPS[0].id;`, 'small modes own Inkbox Depot');
    code = replaceOnce(code,
      `    if (unavailable) return unavailable.name + '：' + unavailable.reason; return `,
      `    if (unavailable) return unavailable.name + '：' + unavailable.reason;
    const cap = (this.lobby.mode === 'solo' ? 1 : this.lobby.mode === 'duo' ? 2 : TEAM);
    if (cap < TEAM && [0, 1].some((t) => this.lobby.players.filter((p) => p.team === t).length > cap)) return cap === 1 ? '1対1：1チーム1人まで' : '2対2：1チーム2人まで';
    return `, 'small mode start block');
    code = replaceOnce(code,
      `if ((this.lobby.mode === 'turf' || isRankedMode(this.lobby.mode)) && this.lobby.players.length < 2) return false;`,
      `if ((this.lobby.mode === 'turf' || this.lobby.mode === 'duo' || this.lobby.mode === 'solo' || isRankedMode(this.lobby.mode)) && this.lobby.players.length < 2) return false;`, 'small mode two-human start');
    code = replaceOnce(code,
      `while (slot < (boss ? TEAM * 2 : TEAM)) {`,
      `while (slot < (boss ? TEAM * 2 : (l.mode === 'solo' ? 1 : l.mode === 'duo' ? 2 : TEAM))) {`, 'small mode bot fill');
    code = replaceOnce(code,
      `mode: boss ? 'boss' : isRankedMode(l.mode) ? l.mode : 'turf', host: this.myId,`,
      `mode: boss ? 'boss' : isRankedMode(l.mode) ? l.mode : 'turf', teamSize: boss ? TEAM * 2 : (l.mode === 'solo' ? 1 : l.mode === 'duo' ? 2 : TEAM), host: this.myId,`, 'start team size');
    code = replaceOnce(code,
      `if (!validLobbySnapshot(l, MAPS, WEAPONS, TEAM_PALETTES.length)) return;`,
      `if (!validLobbySnapshot(l, [...MAPS, { id: 'depot' }], WEAPONS, TEAM_PALETTES.length)) return;`, 'guest lobby stage list');
    code = replaceOnce(code,
      `this.lobby.mode = l.mode === 'boss' || isRankedMode(l.mode) ? l.mode : 'turf';`,
      `this.lobby.mode = l.mode === 'boss' || isRankedMode(l.mode) || l.mode === 'duo' || l.mode === 'solo' ? l.mode : 'turf';`, 'guest small modes');
    return code;
  }
  if (rel === 'src/ui/menus.js') {
    code = DUEL_IMPORT_SRC + code;
    code = replaceOnce(code, "const playModeName = (id) => tr(PLAY_MODE_NAMES[id] || PLAY_MODE_NAMES.turf);",
      "const LOBBY_MODE_IDS = Object.freeze([...PLAY_MODE_IDS, 'duo', 'solo']);\n" +
      "const playModeName = (id) => id === 'duo' ? tr('TURF WAR') + ' 2v2' : id === 'solo' ? tr('TURF WAR') + ' 1v1' : tr(PLAY_MODE_NAMES[id] || PLAY_MODE_NAMES.turf);",
      'lobby small mode names');
    code = replaceOnce(code, '    const maps = this._maps(), diffs = this._diffs(), durations = MATCH.durations || [90, 180];',
      '    const maps = [...this._maps(), DEPOT_MAP], diffs = this._diffs(), durations = MATCH.durations || [90, 180];', 'lobby knows Inkbox Depot');
    code = replaceOnce(code, '    const stageList = () => (bossMode() ? maps.filter((m) => mapBossOk(m.id)) : maps);',
      '    const stageList = () => (isSmallTeamMode(lob.mode) ? maps.filter((m) => m.id === DEPOT_MAP.id) : bossMode() ? maps.filter((m) => mapBossOk(m.id)) : maps.filter((m) => m.id !== DEPOT_MAP.id));',
      'lobby stage list per mode');
    code = replaceOnce(code,
      "      const cur = PLAY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';\n      const next = PLAY_MODE_IDS[(PLAY_MODE_IDS.indexOf(cur) + (d < 0 ? -1 : 1) + PLAY_MODE_IDS.length) % PLAY_MODE_IDS.length];",
      "      const cur = LOBBY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';\n      const next = LOBBY_MODE_IDS[(LOBBY_MODE_IDS.indexOf(cur) + (d < 0 ? -1 : 1) + LOBBY_MODE_IDS.length) % LOBBY_MODE_IDS.length];",
      'lobby mode cycle');
    code = replaceOnce(code,
      "      const map = next === 'boss' && !mapBossOk(lob.map) ? bossFallbackMap(lob.map) : lob.map;\n      lob = { ...lob, mode: next, duration: dur, map };",
      "      const map = isSmallTeamMode(next) ? DEPOT_MAP.id : lob.map === DEPOT_MAP.id ? maps[0].id : next === 'boss' && !mapBossOk(lob.map) ? bossFallbackMap(lob.map) : lob.map;\n      lob = { ...lob, mode: next, duration: dur, map };",
      'small modes own Inkbox Depot (lobby)');
    code = replaceOnce(code,
      "      if (map !== (was && was.id)) { const n = maps.find((m) => m.id === map); this.toast(",
      "      if (next === 'boss' && map !== (was && was.id)) { const n = maps.find((m) => m.id === map); this.toast(",
      'boss-only stage switch toast');
    code = replaceOnce(code,
      "activeMode = PLAY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';",
      "activeMode = LOBBY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';", 'lobby active small mode');
    code = replaceOnce(code,
      "        if (host.childElementCount !== 4) { host.innerHTML = ''; for (let k = 0; k < 4; k++) host.appendChild(h('i', { html: GLYPHS.squidlet })); }",
      "        const cap = SMALL_TEAM_MODES[lob.mode] || 4;\n        if (host.childElementCount !== cap) { host.innerHTML = ''; for (let k = 0; k < cap; k++) host.appendChild(h('i', { html: GLYPHS.squidlet })); }",
      'lobby team pips follow the mode');
    return replaceOnce(code,
      "(humans < 8 ? `${8 - humans} bot${8 - humans === 1 ? '' : 's'} join",
      "(humans < (SMALL_TEAM_MODES[lob.mode] || 4) * 2 ? `${(SMALL_TEAM_MODES[lob.mode] || 4) * 2 - humans} bot${(SMALL_TEAM_MODES[lob.mode] || 4) * 2 - humans === 1 ? '' : 's'} join",
      'lobby bot count follows the mode');
  }
  return code;
}
