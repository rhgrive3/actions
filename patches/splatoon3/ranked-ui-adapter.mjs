import { RANKED_JA } from './runtime/ranked/strings.mjs';
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw new Error(`INKWAVE ranked UI conflict: ${label}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const MODE_STYLE = `
.iw-modesel__row { position:absolute; left:50%; top:calc(var(--u) * 10.5); width:min(94vw,1120px); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(9px,1.4vw,18px); translate:-50% 0; }
.iw-mode { width:auto; min-width:0; height:clamp(180px,29vh,260px); border-radius:14px; }
.iw-mode__art { height:44%; }
.iw-mode__splat { width:min(72%,150px); height:auto; aspect-ratio:1; }
.iw-mode__hero.is-turf { bottom:4%; gap:4px; }
.iw-mode__squid { width:clamp(34px,5vw,62px); height:clamp(34px,5vw,62px); }
.iw-mode__vs { font-size:clamp(18px,2.5vw,31px); }
.iw-mode__kicker { left:9px; top:9px; font-size:10px; }
.iw-mode__tape { top:calc(44% - 16px); left:8px; max-width:calc(100% - 16px); padding:4px 12px 6px 10px; }
.iw-mode__tape .iw-display { font-size:clamp(16px,2vw,25px); }
.iw-mode__blurb { margin:24px 11px 0; font-size:clamp(10px,.95vw,12px); line-height:1.32; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.iw-mode__chips { gap:4px; margin:auto 9px 9px; }
.iw-mode .iw-chip { padding:4px 6px; font-size:9px; }
.iw-mode__go { right:8px; bottom:8px; padding:5px 8px; font-size:9px; }
.iw-mode--zones { --mc:#48ce73; --mc-rgb:72,206,115; --mc-l:#a5ffc0; --mc-d:#17693f; --mc-ink:#102d1c; }
.iw-mode--tower { --mc:#36b7d8; --mc-rgb:54,183,216; --mc-l:#a5efff; --mc-d:#175777; --mc-ink:#102630; }
.iw-mode--rainmaker { --mc:#f0b53e; --mc-rgb:240,181,62; --mc-l:#ffe6a4; --mc-d:#80521c; --mc-ink:#30200c; }
.iw-mode--clams { --mc:#d46ad9; --mc-rgb:212,106,217; --mc-l:#f5b7fa; --mc-d:#67336f; --mc-ink:#301532; }
.iw-mode.is-picked { outline:2px solid var(--mc); outline-offset:4px; }
.iw-ui .iw-ranked-result { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; align-items:stretch; width:min(100%,780px); margin:0 auto; padding:14px; border:2px solid #15121c; border-radius:16px; color:#fff; background:linear-gradient(145deg,rgba(45,34,66,.96),rgba(21,18,28,.96)); box-shadow:0 0 0 3px #fff,0 6px 0 3px #15121c; }
.iw-ranked-result__team { display:grid; grid-template-columns:1fr auto; align-items:center; gap:3px 12px; min-width:0; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,.08); border-top:4px solid var(--team); }
.iw-ranked-result__team b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:900 11px/1.1 'Rubik',sans-serif; letter-spacing:.12em; }
.iw-ranked-result__team strong { grid-row:span 2; font:400 clamp(26px,4vw,44px)/.95 'Titan One',sans-serif; }
.iw-ranked-result__team small { font:800 9px/1.2 'Rubik',sans-serif; opacity:.7; letter-spacing:.08em; }
.iw-ranked-result__call { grid-column:1/-1; text-align:center; color:#ffe38b; font:900 10px/1.2 'Rubik',sans-serif; letter-spacing:.16em; }
.iw-ranked-tag { color:#ffdf85 !important; }
@media (max-width:900px) { .iw-modesel__row { top:calc(var(--u) * 8.5); width:min(94vw,760px); grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .iw-mode { height:clamp(190px,28vh,245px); } .iw-mode__blurb { font-size:11px; } }
@media (max-width:560px) {
 html.iw-touch .iw-ui .iw-modesel__row, .iw-ui.is-touch .iw-modesel__row, .iw-ui .iw-modesel__row { top:72px; width:calc(100vw - 24px); grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:0 2px 18px; }
 html.iw-touch .iw-ui .iw-mode, .iw-ui.is-touch .iw-mode, .iw-ui .iw-mode { height:clamp(170px,25vh,210px); min-height:0; }
 .iw-mode__art { height:40%; } .iw-mode__tape { top:calc(40% - 13px); } .iw-mode__tape .iw-display { font-size:clamp(15px,4.3vw,20px); }
 .iw-mode__blurb { margin:21px 8px 0; font-size:10px; } .iw-mode__chips { margin:auto 7px 7px; } .iw-mode .iw-chip { font-size:8px; padding:3px 5px; } .iw-mode__go { display:none; }
 .iw-ui .iw-ranked-result { padding:9px; gap:7px; } .iw-ranked-result__team { padding:8px; }
}
@media (max-width:360px) {
 html.iw-touch .iw-ui .iw-modesel, .iw-ui.is-touch .iw-modesel, .iw-ui .iw-modesel { overflow-y:auto; }
 html.iw-touch .iw-ui .iw-modesel__row, .iw-ui.is-touch .iw-modesel__row, .iw-ui .iw-modesel__row { position:relative; inset:auto; left:auto; translate:none; grid-template-columns:minmax(0,1fr); width:calc(100vw - 24px); margin:72px auto 18px; }
 html.iw-touch .iw-ui .iw-mode, .iw-ui.is-touch .iw-mode, .iw-ui .iw-mode { height:190px; }
}
@media (max-width:900px) and (max-height:680px) {
 .iw-ui .iw-modesel__row { top:60px; gap:8px; }
 .iw-ui .iw-mode { height:clamp(125px,24vh,165px); }
 .iw-mode__art { height:38%; } .iw-mode__tape { top:calc(38% - 12px); }
 .iw-mode__blurb { margin-top:18px; font-size:10px; }
}
`;

export function adaptRankedUi(rel, code) {
  if (rel === 'src/i18n.js') return once(code, 'const JA = {',
    'const JA = {\n  ...' + JSON.stringify(RANKED_JA) + ',', 'ranked Japanese dictionary');
  if (rel !== 'src/ui/menus.js') return code;

  code = once(code, "sub: 'Turf War · Boss Battle'", "sub: 'Turf War · Ranked · Boss Battle'", 'main menu ranked modes');
  code = once(code, ": this._header('TURF WAR', { sub: 'Pick a stage and the time of day · 4 v 4 against bots' })",
    ": this._header(playModeName(st.mode), { sub: 'Pick a stage and the time of day · 4 v 4 against bots' })", 'setup rule name');
  code = once(code, "h('span', { class: 'iw-pmatch__tag' }, 'TURF WAR')",
    "h('span', { class: 'iw-pmatch__tag' }, playModeName(G.match?.mode))", 'pause rule name');
  code = once(code, "'You will leave this Turf War and head back to the lobby. Your turf will not count.'",
    "'You will leave this battle and head back to the lobby.'", 'quit current rule');

  code = once(code, "const BOSS_DURATIONS = [180, 240, 300];", `const BOSS_DURATIONS = [180, 240, 300];
const RANKED_MODE_IDS = Object.freeze(['zones', 'tower', 'rainmaker', 'clams']);
const PLAY_MODE_IDS = Object.freeze(['turf', ...RANKED_MODE_IDS, 'boss']);
const PLAY_MODE_NAMES = Object.freeze({ turf: 'TURF WAR', zones: 'SPLAT ZONES', tower: 'TOWER CONTROL', rainmaker: 'RAINMAKER', clams: 'CLAM BLITZ', boss: 'BOSS BATTLE' });
const isRankedMode = (id) => RANKED_MODE_IDS.includes(id);
const playModeName = (id) => tr(PLAY_MODE_NAMES[id] || PLAY_MODE_NAMES.turf);`, 'ranked mode catalog');

  code = once(code, "    this.el = h('div', { class: 'iw-ui', 'data-screen': '' });", `    this.el = h('div', { class: 'iw-ui', 'data-screen': '' });
    if (!document.querySelector('style[data-iw-ranked-modes]')) {
      const rankedStyle = document.createElement('style');
      rankedStyle.dataset.iwRankedModes = '1';
      rankedStyle.textContent = ${JSON.stringify(MODE_STYLE)};
      (document.head || this.root).appendChild(rankedStyle);
    }`, 'ranked responsive styles');

  code = once(code, "    const cur = st.mode || (s.lastMode === 'boss' ? 'boss' : 'turf');", "    const cur = PLAY_MODE_IDS.includes(st.mode) ? st.mode : PLAY_MODE_IDS.includes(s.lastMode) ? s.lastMode : 'turf';", 'last ranked mode');

  code = once(code, "      c._mode = m.id;\n      this._fx(c, { tilt: 7 });", "      c._mode = m.id;\n      c.classList.toggle('is-picked', m.id === cur);\n      this._fx(c, { tilt: 7 });", 'selected ranked card');

  code = once(code, "      { id: 'boss', name: 'BOSS BATTLE', kicker: 'CO-OP', img: stageArt('kelpline', 'dusk'), badge: 'NEW!', beta: true,", `      { id: 'zones', name: 'SPLAT ZONES', kicker: 'RANKED', img: stageArt('tidewater', 'dusk'),
        blurb: 'Control the marked zones. Hold them to reduce your team’s count to zero.',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, '5 MIN'], [GLYPHS.flag, 'COUNTDOWN']] },
      { id: 'tower', name: 'TOWER CONTROL', kicker: 'RANKED', img: stageArt('kelpline', 'day'),
        blurb: 'Ride the tower through the enemy lines and push it past every checkpoint.',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, '5 MIN'], [GLYPHS.flag, 'CHECKPOINTS']] },
      { id: 'rainmaker', name: 'RAINMAKER', kicker: 'RANKED', img: stageArt('tidewater', 'day'),
        blurb: 'Break the shield, carry the Rainmaker and push it toward the enemy goal.',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, '5 MIN'], [GLYPHS.flag, 'PUSH']] },
      { id: 'clams', name: 'CLAM BLITZ', kicker: 'RANKED', img: stageArt('kelpline', 'dusk'),
        blurb: 'Collect clams, build a power clam and score it in the enemy basket.',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, '5 MIN'], [GLYPHS.flag, 'SCORE']] },
      { id: 'boss', name: 'BOSS BATTLE', kicker: 'CO-OP', img: stageArt('kelpline', 'dusk'), badge: 'NEW!', beta: true,`, 'ranked mode cards');

  code = once(code, "    const graph = new Map([[cards[0], { left: null, right: cards[1] }], [cards[1], { left: cards[0], right: null }]]);", `    const graph = new Map();
    const modeCols = globalThis.innerWidth <= 360 ? 1 : globalThis.innerWidth <= 900 ? 2 : 3;
    cards.forEach((card, i) => {
      const row = Math.floor(i / modeCols), col = i % modeCols;
      const rowStart = row * modeCols, rowEnd = Math.min(cards.length, rowStart + modeCols);
      graph.set(card, {
        left: cards[col === 0 ? rowEnd - 1 : i - 1],
        right: cards[i + 1 < rowEnd ? i + 1 : rowStart],
        up: row > 0 ? cards[i - modeCols] : null,
        down: i + modeCols < cards.length ? cards[i + modeCols] : null,
      });
    });`, 'six-mode keyboard and gamepad graph');

  code = once(code, "      el, initial: cards[cur === 'boss' ? 1 : 0],", "      el, initial: cards.find((card) => card._mode === cur) || cards[0],", 'last mode initial focus');

  code = once(code,
    "    const boss = st.mode === 'boss';\n    const durations = boss ? BOSS_DURATIONS : (MATCH.durations || [90, 180]);",
    "    const boss = st.mode === 'boss';\n    const ranked = isRankedMode(st.mode);\n    const durations = boss ? BOSS_DURATIONS : ranked ? [300] : (MATCH.durations || [90, 180]);",
    'ranked setup duration options');

  code = once(code,
    "    st.duration = boss ? (durations.includes(s.bossLength) ? s.bossLength : 240) : durations.includes(s.matchLength) ? s.matchLength : (MATCH.defaultDuration || 180);",
    "    st.duration = ranked ? 300 : boss ? (durations.includes(s.bossLength) ? s.bossLength : 240) : durations.includes(s.matchLength) ? s.matchLength : (MATCH.defaultDuration || 180);",
    'ranked setup fixed duration');

  code = once(code,
    "      st.duration = v; safeCall(() => this.api.setSettings && this.api.setSettings(boss ? { bossLength: v } : { matchLength: v })); updateStart();",
    "      st.duration = ranked ? 300 : v; if (!ranked) safeCall(() => this.api.setSettings && this.api.setSettings(boss ? { bossLength: st.duration } : { matchLength: st.duration })); updateStart();",
    'ranked setup preserves turf duration');

  code = once(code,
    "    const mode = st.mode === 'boss' ? 'boss' : 'turf';",
    "    const mode = PLAY_MODE_IDS.includes(st.mode) ? st.mode : 'turf';",
    'offline ranked start mode');

  code = once(code,
    "    safeCall(() => this.api.setSettings && this.api.setSettings({ difficulty: st.difficulty, [mode === 'boss' ? 'bossLength' : 'matchLength']: st.duration, lastStage: st.mapId, lastMode: mode, stageTimes: { ...(st.times || {}) } }));",
    `    const saved = { difficulty: st.difficulty, lastStage: st.mapId, lastMode: mode, stageTimes: { ...(st.times || {}) } };
    if (mode === 'boss') saved.bossLength = st.duration;
    else if (mode === 'turf') saved.matchLength = st.duration;
    safeCall(() => this.api.setSettings && this.api.setSettings(saved));`,
    'offline ranked settings persistence');

  code = once(code,
    "    const bossMode = () => lob.mode === 'boss';   // Boss Battle: one squad (team 0) vs HULLBREAKER (the session carries lobby.mode)",
    "    const bossMode = () => lob.mode === 'boss';   // Boss Battle: one squad (team 0) vs HULLBREAKER (the session carries lobby.mode)\n    const rankedMode = () => isRankedMode(lob.mode);",
    'ranked room mode predicate');

  code = once(code,
    "    const lenSegB = this._seg(BOSS_DURATIONS.map((d) => [d, durLabel(d)]), BOSS_DURATIONS.includes(lob.duration) ? lob.duration : 240, (v) => hostSet({ duration: v }));\n    const lenSeg = { el: h('span', { class: 'iw-lob__lensegs' }, lenSegT.el, lenSegB.el), adjust: (d) => (bossMode() ? lenSegB : lenSegT).adjust(d), cycle: () => (bossMode() ? lenSegB : lenSegT).cycle(),\n      refresh: (v) => (bossMode() ? lenSegB : lenSegT).refresh(v) };",
    `    const lenSegB = this._seg(BOSS_DURATIONS.map((d) => [d, durLabel(d)]), BOSS_DURATIONS.includes(lob.duration) ? lob.duration : 240, (v) => hostSet({ duration: v }));
    const lenSegR = this._seg([[300, durLabel(300)]], 300, () => hostSet({ duration: 300 }));
    const lenSeg = { el: h('span', { class: 'iw-lob__lensegs' }, lenSegT.el, lenSegB.el, lenSegR.el),
      adjust: (d) => (rankedMode() ? lenSegR : bossMode() ? lenSegB : lenSegT).adjust(d),
      cycle: () => (rankedMode() ? lenSegR : bossMode() ? lenSegB : lenSegT).cycle(),
      refresh: (v) => (rankedMode() ? lenSegR : bossMode() ? lenSegB : lenSegT).refresh(rankedMode() ? 300 : v) };`,
    'ranked room five-minute length');

  code = once(code,
    "      const next = bossMode() ? 'turf' : 'boss';\n      // keep the length sensible for the mode (boss fights run 3–5 min, 4 by default)\n      const dur = next === 'boss' ? 240 : (durations.includes(lob.duration) ? lob.duration : (MATCH.defaultDuration || 180));",
    `      const cur = PLAY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';
      const next = PLAY_MODE_IDS[(PLAY_MODE_IDS.indexOf(cur) + (d < 0 ? -1 : 1) + PLAY_MODE_IDS.length) % PLAY_MODE_IDS.length];
      // Ranked rounds always use the five-minute clock; Turf War and Boss Battle keep their own saved choices.
      const dur = isRankedMode(next) ? 300 : next === 'boss' ? 240 : (durations.includes(lob.duration) ? lob.duration : (MATCH.defaultDuration || 180));`,
    'six-mode room cycle and duration');

  code = once(code,
    "      const bm = bossMode();\n      if (rMode._shown !== bm) {\n        const first = rMode._shown === undefined;\n        rMode._shown = bm;\n        modeName.textContent = bm ? 'BOSS BATTLE' : 'TURF WAR';\n        modeIco.innerHTML = bm ? BOSS_GLYPH : GLYPHS.flag;\n        el.classList.toggle('is-bossmode', bm);\n        diffLbl.querySelector('.iw-lset__lbltxt').textContent = bm ? 'DIFFICULTY' : 'BOT SKILL';\n        hostChip.lastChild.textContent = bm ? 'HOST' : 'YOU’RE THE HOST';   // the longer BOSS BATTLE headline needs the room\n        lenSegT.el.style.display = bm ? 'none' : ''; lenSegB.el.style.display = bm ? '' : 'none';\n        if (!first) { restartAnim(rMode, 'is-swap'); restartAnim(status, 'is-swap'); }\n      }",
    `      const bm = bossMode(), rm = rankedMode(), activeMode = PLAY_MODE_IDS.includes(lob.mode) ? lob.mode : 'turf';
      if (rm && lob.duration !== 300 && isHost()) { lob = { ...lob, duration: 300 }; hostSet({ duration: 300 }); }
      if (rMode._shownMode !== activeMode) {
        const first = rMode._shownMode === undefined;
        rMode._shownMode = activeMode;
        modeName.textContent = playModeName(activeMode);
        modeIco.innerHTML = bm ? BOSS_GLYPH : GLYPHS.flag;
        el.classList.toggle('is-bossmode', bm);
        el.classList.toggle('is-rankedmode', rm);
        el.dataset.mode = activeMode;
        diffLbl.querySelector('.iw-lset__lbltxt').textContent = bm ? 'DIFFICULTY' : 'BOT SKILL';
        hostChip.lastChild.textContent = bm ? 'HOST' : 'YOU’RE THE HOST';
        lenSegT.el.style.display = bm || rm ? 'none' : '';
        lenSegB.el.style.display = bm ? '' : 'none';
        lenSegR.el.style.display = rm ? '' : 'none';
        if (!first) { restartAnim(rMode, 'is-swap'); restartAnim(status, 'is-swap'); }
      }`,
    'ranked room settings render');

  code = once(code,
    "          if (!isHost()) this.toast(`${host ? host.name : 'The host'} picked ${bossMode() ? `BOSS BATTLE — everyone vs ${BOSS_NAME}!` : 'TURF WAR'}`, { icon: bossMode() ? BOSS_GLYPH : GLYPHS.flag });",
    "          if (!isHost()) this.toast(tr('{host} picked {mode}', { host: host ? host.name : tr('The host'), mode: playModeName(lob.mode) }), { icon: bossMode() ? BOSS_GLYPH : GLYPHS.flag });",
    'ranked room mode announcement');

  code = once(code,
    "    const boss = d.mode === 'boss';   // Boss Battle: VICTORY / DEFEAT vs HULLBREAKER, one squad ranked by damage",
    "    const boss = d.mode === 'boss';   // Boss Battle: VICTORY / DEFEAT vs HULLBREAKER, one squad ranked by damage\n    const ranked = isRankedMode(d.mode);\n    const ruleName = playModeName(d.mode);",
    'ranked results mode');

  code = once(code,
    "    const awards = boss ? computeBossAwards(raw) : computeAwards(raw, { win, percents: [pa, pb] });",
    "    const awards = boss ? computeBossAwards(raw) : computeAwards(raw, { win, percents: ranked ? [50, 50] : [pa, pb] });",
    'ranked results avoid turf awards');

  code = once(code,
    "    const winTeam = win ? selfTeam : 1 - selfTeam;",
    "    const winTeam = Number.isInteger(d.winner) && d.winner >= 0 && d.winner <= 1 ? d.winner : win ? selfTeam : 1 - selfTeam;",
    'ranked winner team');

  code = once(code,
    "      : awards.match.map((t) => h('span', { class: `iw-res__tag iw-res__tag--${t.id}` }, h('i', { html: awardIcon(t.icon) }), t.label, h('small', null, t.value)));",
    `      : ranked
        ? [h('span', { class: 'iw-res__tag iw-ranked-tag' }, h('i', { html: GLYPHS.flag }), ruleName, h('small', null, d.knockout ? 'KNOCKOUT' : d.overtime ? 'OVERTIME' : 'COUNT RESULT'))]
        : awards.match.map((t) => h('span', { class: \`iw-res__tag iw-res__tag--\${t.id}\` }, h('i', { html: awardIcon(t.icon) }), t.label, h('small', null, t.value)));`,
    'ranked result rule tag');

  code = once(code,
    "`${d.mapName || (boss ? 'Boss Battle' : 'Turf War')} · ${boss ? 'Boss Battle' : 'Turf War'}`",
    "`${d.mapName || (boss ? 'Boss Battle' : ranked ? ruleName : 'Turf War')} · ${boss ? 'Boss Battle' : ranked ? ruleName : 'Turf War'}`",
    'ranked result metadata');

  code = once(code,
    "    const cover = boss ? null : h('div', { class: 'iw-res__cover iw-in' + (pa >= pb ? ' is-a' : ' is-b') },",
    "    const cover = boss || ranked ? null : h('div', { class: 'iw-res__cover iw-in' + (pa >= pb ? ' is-a' : ' is-b') },",
    'ranked results hide turf percent bar');

  code = once(code,
    "    // boss: HULLBREAKER's HP drains to what was left, the clock counts up, then SUNK! / ESCAPED is stamped on it",
    `    const rankedScore = ranked ? h('div', { class: 'iw-ranked-result iw-in' },
      [0, 1].map((team) => h('div', { class: 'iw-ranked-result__team', style: { '--team': colors[team] } },
        h('b', null, names[team] || TEAM_NAMES[team]),
        h('strong', null, String(Math.ceil((d.counts && d.counts[team] != null) ? d.counts[team] : 100))),
        h('small', null, tr('PENALTY {n}', { n: Math.ceil((d.penalties && d.penalties[team]) || 0) })))),
      h('div', { class: 'iw-ranked-result__call' }, d.knockout
        ? tr('KNOCKOUT · {team} WIN', { team: names[winTeam] || TEAM_NAMES[winTeam] })
        : d.overtime ? 'OVERTIME RESULT' : d.reason === 'time' ? 'TIME · LOWEST COUNT WINS' : 'RANKED RESULT')) : null;

    // boss: HULLBREAKER's HP drains to what was left, the clock counts up, then SUNK! / ESCAPED is stamped on it`,
    'ranked results count panel');

  code = once(code,
    "      boss ? bossP.el : cover,",
    "      boss ? bossP.el : ranked ? rankedScore : cover,",
    'ranked results main panel');

  code = once(code,
    "      coverBar.style.setProperty('--ga', k.toFixed(4));",
    "      if (ranked) return;\n      coverBar.style.setProperty('--ga', k.toFixed(4));",
    'ranked result cover animation guard');
  code = once(code,
    "      cover.classList.add('is-landed');",
    "      if (ranked) return;\n      cover.classList.add('is-landed');",
    'ranked result cover reveal guard');
  code = once(code,
    "    let T = -INTRO, coverDone = false, tickAcc = 0, lastA = -1, lastB = -1, badgeQueue = null, lobbyT = 0;",
    "    let T = -INTRO, coverDone = ranked, tickAcc = 0, lastA = -1, lastB = -1, badgeQueue = null, lobbyT = 0;",
    'ranked result skip turf count-up');

  return code;
}
