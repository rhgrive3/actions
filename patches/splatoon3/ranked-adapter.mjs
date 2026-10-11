import { adaptRankedUi } from './ranked-ui-adapter.mjs';

function once(code, from, to, label) {
  const at = code.indexOf(from);
  if (at < 0 || code.indexOf(from, at + from.length) >= 0) throw new Error('Ranked integration anchor: ' + label);
  return code.slice(0, at) + to + code.slice(at + from.length);
}
export function adaptRanked(rel, code) {
  const importEngine = "import { isRankedMode } from '../../patches/splatoon3/runtime/ranked/engine.mjs';\n";
  if (rel === 'src/game/match.js') {
    code = importEngine + code;
    code = once(code, "this.mode = opts.mode === 'boss' && !this.attract ? 'boss' : 'turf';", "this.mode = !this.attract && (opts.mode === 'boss' || isRankedMode(opts.mode)) ? opts.mode : 'turf';", 'Match mode');
    code = once(code, 'this.duration = opts.duration ||', 'this.duration = isRankedMode(this.mode) ? 300 : opts.duration ||', 'ranked clock');
    code = once(code, 'this.time -= dt;', 'if (!this.ranked) this.time -= dt;', 'single clock owner');
    code = once(code, 'if (this.time <= 0) {', 'if (!this.ranked && this.time <= 0) {', 'ranked overtime authority');
    code = once(code, 'captureTurfFinish(this, s, G.paint, G.netm, G.game?.minimap);', "if (!this.ranked) captureTurfFinish(this, s, G.paint, G.netm, G.game?.minimap);", 'scoring scope');
    code = once(code, "if (!this.attract && !this.bossMode && (this.mode == null || this.mode === 'turf') && (this.state === 'finish' || this.state === 'judge')) return;", "if (!this.attract && !this.bossMode && (this.mode == null || this.mode === 'turf' || this.ranked) && (this.state === 'finish' || this.state === 'judge')) return;", 'finish freeze');
  }
  if (rel === 'src/main.js') {
    code = importEngine.replace('../../patches/', '../patches/') + code;
    code = once(code, "mode: o.mode === 'boss' ? 'boss' : 'turf',", "mode: o.mode === 'boss' || isRankedMode(o.mode) ? o.mode : 'turf',", 'offline mode');
    code = once(code, 'opts.duration = requestedDuration ||', 'opts.duration = isRankedMode(opts.mode) ? 300 : requestedDuration ||', 'offline ranked duration');
    code = once(code, 'noBots: mapNoBots(map.id) || isRangeMap(map)', 'noBots: isRankedMode(opts.mode) ? false : mapNoBots(map.id) || isRangeMap(map)', 'ranked bot squad');
    code = once(code, "mode: params.get('mode') === 'boss' ? 'boss' : 'turf'", "mode: params.get('mode') === 'boss' || isRankedMode(params.get('mode')) ? params.get('mode') : 'turf'", 'diagnostic mode');
    code = once(code, "prompt = t('Paint the ground — most turf wins!');", "prompt = m.ranked ? ({ zones: 'エリアを確保して、自分のカウントを0にしよう！', tower: 'ヤグラに乗って、カンモンを越えて進もう！', rainmaker: 'バリアを割ってホコを運ぼう！ カンモン通過が必要！', clams: '8個でガチアサリ！ C / Aで敵のゴールへ投げよう！' })[m.mode] : t('Paint the ground — most turf wins!');", 'ranked opening instruction');
    // Native result statistics/progression remain in one flow; rank UI consumes
    // the authoritative count result instead of inferring it from painted turf.
    const anchor = "win: won, percents: [cov[0] * 100, cov[1] * 100], colors:";
    const a = code.indexOf('  async _judge() {');
    if (a < 0) throw Error('Ranked result flow missing');
    code = code.slice(0, a) + once(code.slice(a), anchor, "mode: m.result.mode, counts: m.result.counts, penalties: m.result.penalties, knockout: m.result.knockout, reason: m.result.reason,\n      " + anchor, 'ranked result metadata');
  }
  if (rel === 'src/net/session.js') {
    code = importEngine + code;
    code = once(code, "this.state !== 'lobby' || this.lobby.mode !== 'turf' ||\n", "this.state !== 'lobby' || (this.lobby.mode !== 'turf' && !isRankedMode(this.lobby.mode)) ||\n", 'ranked host team assignment');
    code = once(code, "this.state !== 'lobby' || this.lobby.mode !== 'turf') return false;", "this.state !== 'lobby' || (this.lobby.mode !== 'turf' && !isRankedMode(this.lobby.mode))) return false;", 'ranked host team confirmation');
    code = once(code, "return (this.lobby.mode !== 'turf' || this.lobby.players.length >= 2)", "return ((this.lobby.mode !== 'turf' && !isRankedMode(this.lobby.mode)) || this.lobby.players.length >= 2)", 'ranked two-human admission');
    code = once(code, "if (this.lobby.mode === 'turf' && this.lobby.players.length < 2) return false;", "if ((this.lobby.mode === 'turf' || isRankedMode(this.lobby.mode)) && this.lobby.players.length < 2) return false;", 'ranked start admission');
    code = once(code, "if (s.mode === 'turf' || s.mode === 'boss') l.mode = s.mode;", "if (s.mode === 'turf' || s.mode === 'boss' || isRankedMode(s.mode)) l.mode = s.mode;\n    if (isRankedMode(l.mode)) l.duration = 300;", 'room mode');
    code = once(code, 'l.bots = mapNoBots(l.map) ? false :', 'l.bots = mapNoBots(l.map) && !isRankedMode(l.mode) ? false :', 'ranked room bot option');
    code = once(code, 'const bots = l.bots && !mapNoBots(l.map);', 'const bots = l.bots && (!mapNoBots(l.map) || isRankedMode(l.mode));', 'ranked room bot roster');
    code = once(code, 'startBlock() { return noBotsStartBlock(this.lobby); }', 'startBlock() { return isRankedMode(this.lobby.mode) && this.lobby.bots ? null : noBotsStartBlock(this.lobby); }', 'ranked room squad admission');
    code = once(code, "mode: boss ? 'boss' : 'turf', host:", "mode: boss ? 'boss' : isRankedMode(l.mode) ? l.mode : 'turf', host:", 'wire start mode');
    code = once(code, "this.lobby.mode = l.mode === 'boss' ? 'boss' : 'turf';", "this.lobby.mode = l.mode === 'boss' || isRankedMode(l.mode) ? l.mode : 'turf';\n          if (isRankedMode(this.lobby.mode)) this.lobby.duration = 300;", 'guest room mode');
  }
  if (rel === 'patches/splatoon3/bootstrap.mjs') {
    code = "import { installRanked } from './runtime/ranked/install.mjs';\n" + code;
    code = once(code, 'installMainWeaponCatalogRuntime(context, profile);', 'installMainWeaponCatalogRuntime(context, profile);\n  installRanked(context, profile);', 'final ranked runtime install');
  }
  if (rel === 'src/net/mock.js') {
    code = importEngine + code;
    code = once(code, "if (o.mode === 'turf' || o.mode === 'boss') L.mode = o.mode;", "if (o.mode === 'turf' || o.mode === 'boss' || isRankedMode(o.mode)) L.mode = o.mode;\n    if (isRankedMode(L.mode)) L.duration = 300;", 'ranked mock lobby modes');
  }
  return adaptRankedUi(rel, code);
}
