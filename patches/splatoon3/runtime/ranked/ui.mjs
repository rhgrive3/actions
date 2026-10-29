import { towerCheckpointPosition } from './tower.mjs';
import { strokeTowerRoute, objectiveOverlayChanged } from './minimap-cache.mjs';
import { rankedText } from './strings.mjs';
import { isOwnedZoneCoveragePair } from './zone-coverage-samples.mjs';
const RULE_LABELS = Object.freeze({ zones: 'SPLAT ZONES', tower: 'TOWER CONTROL', rainmaker: 'RAINMAKER', clams: 'CLAM BLITZ' });
const clamp01 = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const fmtClock = n => {
  const s = Math.max(0, Math.ceil(finite(n)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const teamName = (team, names = null) => names?.[team] || (team === 0 ? 'ALPHA' : team === 1 ? 'BRAVO' : 'NEUTRAL');
const rankedOf = G => {
  const match = G?.match, engine = match?.ranked;
  return engine && RULE_LABELS[engine.mode] ? engine : null;
};
const pos3 = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite)
  ? value : value && [value.x, value.y, value.z].every(Number.isFinite) ? [value.x, value.y, value.z] : null;

const UI_CSS = `
.iw-ranked-hud { position:absolute; z-index:18; top:clamp(54px,7.4vh,86px); left:50%; translate:-50% 0; box-sizing:border-box; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:10px; max-width:min(calc(100vw - 12px),720px); padding:7px 12px; border:2px solid #15121c; border-radius:999px; color:#fff; background:rgba(21,18,28,.9); box-shadow:0 0 0 2px rgba(255,255,255,.86),0 4px 0 2px rgba(21,18,28,.8); pointer-events:none; white-space:normal; font:800 10px/1 'Rubik','IW JP',sans-serif; letter-spacing:.08em; }
.iw-ranked-hud[hidden] { display:none; }
.iw-ranked-hud__rule { color:#ffe28a; font-weight:900; letter-spacing:.14em; }
.iw-ranked-hud__score { display:flex; align-items:center; gap:7px; }
.iw-ranked-hud__team { color:var(--rkt); }
.iw-ranked-hud__count { font:400 18px/.95 'Titan One','IW JP',sans-serif; }
.iw-ranked-hud__penalty { color:#ffab70; font-size:8px; }
.iw-ranked-hud__clock { padding:4px 6px; border-radius:7px; background:#fff; color:#15121c; font-weight:900; }
.iw-ranked-hud__objective { flex:1 1 120px; min-width:0; overflow:hidden; max-width:34vw; color:rgba(255,255,255,.78); text-overflow:ellipsis; }
.iw-ranked-hud__hint { flex:0 0 auto; color:#ffe28a; font-size:9px; font-weight:900; letter-spacing:.08em; }
.iw-ranked-hud__hint[hidden] { display:none; }
.iw-ranked-judge { position:absolute; inset:0; z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:24px; color:#fff; background:radial-gradient(ellipse at 50% 45%,rgba(60,39,83,.96),rgba(12,10,19,.97) 72%); opacity:0; scale:.92; transition:opacity .45s ease,scale .6s cubic-bezier(.2,.9,.2,1.2); pointer-events:none; }
.iw-ranked-judge.is-on { opacity:1; scale:1; }
.iw-ranked-judge.is-out { opacity:0; scale:1.04; }
.iw-ranked-judge__kicker { color:#ffe28a; font:900 12px/1 'Rubik','IW JP',sans-serif; letter-spacing:.28em; }
.iw-ranked-judge__title { font:400 clamp(34px,8vw,76px)/.95 'Titan One','IW JP',sans-serif; text-align:center; text-shadow:0 5px 0 #15121c; }
.iw-ranked-judge__score { display:grid; grid-template-columns:repeat(2,minmax(120px,240px)); gap:14px; width:min(100%,520px); }
.iw-ranked-judge__team { display:grid; grid-template-columns:1fr auto; align-items:center; gap:6px 12px; padding:14px; border-top:5px solid var(--rkt); border-radius:14px; background:rgba(255,255,255,.1); }
.iw-ranked-judge__team b { font:900 12px/1.1 'Rubik','IW JP',sans-serif; letter-spacing:.13em; }
.iw-ranked-judge__team strong { grid-row:span 2; font:400 clamp(32px,6vw,54px)/.95 'Titan One','IW JP',sans-serif; }
.iw-ranked-judge__team small { opacity:.72; font:800 9px/1 'Rubik','IW JP',sans-serif; letter-spacing:.1em; }
.iw-ranked-judge__note { color:#ffe28a; font:900 11px/1 'Rubik','IW JP',sans-serif; letter-spacing:.2em; }
@media (max-width:560px) { .iw-ranked-hud { width:calc(100vw - 12px); gap:5px 6px; padding:5px 7px; } .iw-ranked-hud__rule { font-size:7px; letter-spacing:.08em; } .iw-ranked-hud__score { min-width:0; gap:3px; } .iw-ranked-hud__team { font-size:7px; letter-spacing:0; } .iw-ranked-hud__count { font-size:12px; } .iw-ranked-hud__penalty { font-size:7px; } .iw-ranked-hud__clock { padding:3px 5px; font-size:8px; } .iw-ranked-hud__objective { flex:1 1 calc(100% - 84px); max-width:none; font-size:7px; text-align:center; } .iw-ranked-hud__hint { font-size:7px; } .iw-ranked-judge__score { grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; } .iw-ranked-judge__team { padding:9px; } }
`;

const rankedStyleByDocument = new WeakMap();
function addStyle() {
  if (typeof document === 'undefined') return;
  const doc = document, cached = rankedStyleByDocument.get(doc);
  if (cached?.ownerDocument === doc && cached.getRootNode() === doc && cached.tagName === 'STYLE' && cached.hasAttribute('data-iw-ranked-runtime')) return;
  const existing = doc.querySelector('style[data-iw-ranked-runtime]');
  if (existing) { rankedStyleByDocument.set(doc, existing); return; }
  const style = doc.createElement('style');
  style.dataset.iwRankedRuntime = '1';
  style.textContent = UI_CSS;
  (doc.head || doc.body)?.appendChild(style);
  if (style.getRootNode() === doc) rankedStyleByDocument.set(doc, style);
}

const zonesTextCache = new WeakMap();
const towerTextCache = new WeakMap();
function zoneTextEntry(engine, coverage, captured, names, lang) {
  // Only the frozen production samples are eligible. Mutable/custom arrays
  // keep the original formatter, including sparse/accessor semantics.
  if (!Array.isArray(coverage) || !Object.isFrozen(coverage)) return null;
  const name0=names?.[0],name1=names?.[1];
  if (name0 != null && typeof name0 !== 'string' || name1 != null && typeof name1 !== 'string') return null;
  let cache=zonesTextCache.get(engine);
  if (!cache) { cache={rows:[],text:null}; zonesTextCache.set(engine,cache); }
  let same=cache.text!==null && cache.lang===lang && cache.name0===name0 && cache.name1===name1 && cache.rows.length===coverage.length;
  for(let i=0;i<coverage.length;i++) {
    const pair=coverage[i];
    const row=cache.rows[i]||(cache.rows[i]={});
    let a,b;
    if(row.pair===pair&&isOwnedZoneCoveragePair(pair)){a=row.a;b=row.b;}
    else {
      if(!Array.isArray(pair)||pair.length!==2||!Object.isFrozen(pair)){cache.text=null;return null;}
      const d0=Object.getOwnPropertyDescriptor(pair,'0'),d1=Object.getOwnPropertyDescriptor(pair,'1');
      if(!d0||!d1||!('value' in d0)||!('value' in d1)){cache.text=null;return null;}
      a=Math.round(clamp01(d0.value)*100);b=Math.round(clamp01(d1.value)*100);
      row.pair=isOwnedZoneCoveragePair(pair)?pair:null;
    }
    const owner=captured[i]?.team;
    if(row.a!==a||row.b!==b||row.owner!==owner)same=false;
    row.a=a;row.b=b;row.owner=owner;
  }
  cache.rows.length=coverage.length;cache.lang=lang;cache.name0=name0;cache.name1=name1;cache.same=same;
  if(!same)cache.text=null;
  return cache;
}
export function objectiveText(engine, G, api = {}) {
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  const state = engine.rule?.state || {}, frame = engine.frame || {};
  if (engine.mode === 'zones') {
    const coverage = frame.zoneCoverage || [];
    const captured = state.zones || [];
    if (coverage.length) {
      const cache=zoneTextEntry(engine,coverage,captured,G.palette?.names||G.match?.palette?.names,api.LANG);
      if(cache?.same)return cache.text;
      const text=coverage.map((pair, i) => {
      const a = Math.round(clamp01(pair?.[0]) * 100), b = Math.round(clamp01(pair?.[1]) * 100);
      const owner = captured[i]?.team;
      return `${t('ZONE {n}', { n: i + 1 })} ${a}/${b}${owner === 0 || owner === 1 ? ` · ${t(teamName(owner, G.palette?.names || G.match?.palette?.names))}` : ''}`;
      }).join('   ');
      if(cache)cache.text=text;
      return text;
    }
    return state.controllingTeam === 0 || state.controllingTeam === 1
      ? t('{team} CONTROLS ALL ZONES', { team: t(teamName(state.controllingTeam, G.palette?.names || G.match?.palette?.names)) }) : t('CAPTURE ALL ZONES');
  }
  if (engine.mode === 'tower') {
    const p = Math.round(clamp01(state.progress) * 100);
    const team = state.controllingTeam;
    const index = (state.checkpointIndex?.[team] || 0) + 1;
    const total = engine.stage?.tower?.checkpoints?.[team]?.length || 0;
    const name = teamName(team, G.palette?.names || G.match?.palette?.names);
    // Cache only scalar formatting inputs. An accessor locale or a custom
    // coercible name keeps the original translation/read semantics.
    const language = Object.getOwnPropertyDescriptor(api, 'LANG');
    const ordinaryLanguage = language ? Object.hasOwn(language, 'value') : !('LANG' in api);
    const lang = ordinaryLanguage ? language?.value : null;
    const cacheable = ordinaryLanguage && (lang == null || typeof lang === 'string')
      && typeof name === 'string' && typeof team === 'number' && typeof index === 'number' && typeof total === 'number';
    const saved = cacheable ? towerTextCache.get(engine) : null;
    if (saved && Object.is(saved.p, p) && Object.is(saved.team, team) && Object.is(saved.index, index)
        && Object.is(saved.total, total) && saved.name === name && saved.lang === lang) return saved.text;
    const text = t('{team} TOWER · {progress}%', { team: t(name), progress: p })
      + (total ? ' · ' + t('CP {index}/{total}', { index: Math.min(index, total), total }) : '');
    if (cacheable) towerTextCache.set(engine, { p, team, index, total, name, lang, text });
    else towerTextCache.delete(engine);
    return text;
  }
  if (engine.mode === 'rainmaker') {
    if (state.goalHold) return t('DUNKING · PROTECT THE CARRIER!');
    if (state.respawnRemaining > 0) return t('REFORMING SHIELD · {n}s', { n: Math.ceil(state.respawnRemaining) });
    const barrier = state.barrier;
    if (barrier?.active) {
      const max = Math.max(0, finite(barrier.max));
      const pressure = Math.min(max, Math.abs(finite(barrier.balance)));
      return t('SHIELD {pressure} / {max}', { pressure: Math.ceil(pressure), max: Math.ceil(max) });
    }
    if (state.carrier != null) {
      const actor = (G.match?.actors || []).find(a => String(a.nid ?? `${a.team}:${a.slot}`) === String(state.carrier));
      const held = Math.ceil(Math.max(0, finite(state.holderRemaining)));
      const charge = Math.round(clamp01(state.charge?.value) * 100);
      return t('CARRY {held}s · {name} · CHARGE {charge}%', { held, name: actor?.name || t(teamName(actor?.team)), charge }) + (state.retreatRate > 1 ? ' · ' + t('RETREAT!') : '');
    }
    const owner = state.lastCarrierTeam;
    return owner === 0 || owner === 1 ? t('RAINMAKER DROPPED · PICK IT UP') : t('SHIELD POPPED · PICK UP THE RAINMAKER');
  }
  if (engine.mode === 'clams') {
    const local = G.match?.local;
    const team = local?.team === 0 || local?.team === 1 ? local.team : -1;
    const inventory = state.inventories || {};
    const localId = local ? String(local.nid ?? `${local.team}:${local.slot}`) : '';
    const own = inventory[localId];
    let carried = 0;
    if (!own && team >= 0) for (const id in inventory) if (Object.hasOwn(inventory, id)) {
      const item = inventory[id];
      if (item?.team === team) carried = carried + finite(item?.small) + finite(item?.power ? 8 : 0);
    }
    const basket = team >= 0 ? state.baskets?.[team] : null;
    const count = own ? (own.power ? t('POWER CLAM') : t('{n}/8 CLAMS', { n: Math.ceil(finite(own.small)) }))
      : team >= 0 ? t('{n} CLAMS ON TEAM', { n: Math.ceil(carried) }) : t('COLLECT CLAMS');
    const scored = team >= 0 ? Math.ceil(finite(state.scoredPoints?.[team])) : 0;
    const basketLabel = basket?.barrierOpen
      ? t('BASKET OPEN · {n}s', { n: Math.ceil(Math.max(0, finite(basket.openTimer))) })
      : basket ? t('BASKET CLOSED') + (finite(basket.cooldown) > 0 ? ' · ' + t('{n}s', { n: Math.ceil(basket.cooldown) }) : '') : '';
    return `${count} · ${t('{n} SCORED', { n: scored })}${basketLabel ? ` · ${basketLabel}` : ''}`;
  }
  return '';
}

function writeHudText(node, text) { if (node.textContent !== text) node.textContent = text; }
// Cache formatting inputs, while retaining DOM repair for supported outside writers.
function writeRankedLabel(node, language, source, number) {
  let saved = node._rankedLabel;
  if (!saved || saved.language !== language || saved.source !== source || !Object.is(saved.number, number)) {
    saved = node._rankedLabel = { language, source, number, text: source === '' ? '' : rankedText(language, source, number === undefined ? undefined : { n: number }) };
  }
  writeHudText(node, saved.text);
}

function updateHud(hud, G, api) {
  const engine = rankedOf(G);
  if (!hud?.el || typeof document === 'undefined') return;
  let el = hud._rankedHud;
  if (!engine) {
    if (el && !el.hidden) el.hidden = true;
    return;
  }
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  addStyle();
  if (!el) {
    el = document.createElement('div');
    el.className = 'iw-ranked-hud';
    el.innerHTML = '<b class="iw-ranked-hud__rule"></b><span class="iw-ranked-hud__score"><span class="iw-ranked-hud__team" data-team="0">ALPHA</span><b class="iw-ranked-hud__count" data-count="0">100</b><small class="iw-ranked-hud__penalty" data-penalty="0"></small><i>·</i><span class="iw-ranked-hud__team" data-team="1">BRAVO</span><b class="iw-ranked-hud__count" data-count="1">100</b><small class="iw-ranked-hud__penalty" data-penalty="1"></small></span><b class="iw-ranked-hud__clock"></b><small class="iw-ranked-hud__objective"></small><small class="iw-ranked-hud__hint" hidden></small>';
    hud.el.appendChild(el);
    hud._rankedHud = el;
  }
  if (el.hidden) el.hidden = false;
  const refs = hud._rankedHudRefs?.root === el ? hud._rankedHudRefs : (hud._rankedHudRefs = {
    root: el, rule: el.querySelector('.iw-ranked-hud__rule'), teams: el.querySelectorAll('[data-team]'),
    counts: el.querySelectorAll('[data-count]'), penalties: el.querySelectorAll('[data-penalty]'),
    clock: el.querySelector('.iw-ranked-hud__clock'), objective: el.querySelector('.iw-ranked-hud__objective'), hint: el.querySelector('.iw-ranked-hud__hint'),
  });
  const names = G.palette?.names || G.match?.palette?.names;
  if (el.dataset.mode !== engine.mode) el.dataset.mode = engine.mode;
  writeRankedLabel(refs.rule, api.LANG, RULE_LABELS[engine.mode]);
  refs.teams.forEach(node => {
    const team = Number(node.dataset.team);
    writeRankedLabel(node, api.LANG, teamName(team, names));
    const color = G.teamHex?.[team] || (team ? '#3675ff' : '#ff8a14');
    if (node._rankedColor !== color) { node.style.setProperty('--rkt', color); node._rankedColor = color; }
  });
  refs.counts.forEach(node => {
    const team = Number(node.dataset.count);
    writeHudText(node, String(Math.ceil(finite(engine.counts?.[team], 100))));
    const leading = engine.leader === team;
    if (node._rankedLeading !== leading) { node.classList.toggle('is-leading', leading); node._rankedLeading = leading; }
  });
  refs.penalties.forEach(node => {
    const team = Number(node.dataset.penalty), penalty = Math.ceil(finite(engine.penalties?.[team]));
    writeRankedLabel(node, api.LANG, penalty > 0 ? 'PEN {n}' : '', penalty);
  });
  const clock = engine.overtime ? t('OT {time}', { time: fmtClock(engine.overtimeElapsed) }) : fmtClock(engine.time);
  writeHudText(refs.clock, clock);
  writeHudText(refs.objective, objectiveText(engine, G, api));
  const hint = refs.hint;
  if (hint.hidden !== (engine.mode !== 'clams')) hint.hidden = engine.mode !== 'clams';
  writeRankedLabel(hint, api.LANG, engine.mode === 'clams' ? (api.TXT?.mode === 'touch' ? 'THROW' : api.TXT?.mode === 'pad' ? 'THROW [A]' : 'THROW [C]') : '');
}

function rankedJudge(hud, engine, data = {}, G = {}, api = {}) {
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  const match = G.match, netm = G.netm, net = G.net, transport = net?.tr;
  const current = () => {
    try {
      return !hud?._judgeDisposed && G.match === match && G.netm === netm && G.net === net && net?.tr === transport
        && (!match || match.ranked === engine) && (typeof data.isCurrent !== 'function' || !!data.isCurrent());
    } catch { return false; }
  };
  if (!current()) return Promise.resolve({ cancelled: true });
  if (!hud?.overLayer || typeof document === 'undefined') return Promise.resolve({ winner: engine.winner });
  hud._judgeOwner?.cancel();
  addStyle();
  hud.overLayer.querySelectorAll('.iw-ranked-judge').forEach(node => node.remove());
  const winner = engine.winner ?? data.winner ?? -1;
  const counts = engine.counts || data.counts || [100, 100];
  const penalties = engine.penalties || data.penalties || [0, 0];
  const names = data.names || G?.match?.palette?.names || G?.palette?.names || ['ALPHA', 'BRAVO'];
  const title = winner < 0 ? t('RANKED RESULT') : t('{team} WINS!', { team: t(teamName(winner, names)) });
  const label = RULE_LABELS[engine.mode] || 'RANKED';
  const el = document.createElement('div');
  el.className = 'iw-ranked-judge';
  el.innerHTML = '<b class="iw-ranked-judge__kicker"></b><strong class="iw-ranked-judge__title"></strong><div class="iw-ranked-judge__score"></div><small class="iw-ranked-judge__note"></small>';
  el.querySelector('.iw-ranked-judge__kicker').textContent = t(label);
  el.querySelector('.iw-ranked-judge__title').textContent = title;
  const score = el.querySelector('.iw-ranked-judge__score');
  for (let team = 0; team < 2; team++) {
    const card = document.createElement('div');
    card.className = 'iw-ranked-judge__team';
    card.style.setProperty('--rkt', data.colors?.[team] || (team ? '#3675ff' : '#ff8a14'));
    const name = document.createElement('b'); name.textContent = t(teamName(team, names));
    const count = document.createElement('strong'); count.textContent = String(Math.ceil(finite(counts[team], 100)));
    const penalty = document.createElement('small'); penalty.textContent = t('PENALTY {n}', { n: Math.ceil(finite(penalties[team])) });
    card.append(name, count, penalty); score.appendChild(card);
  }
  const note = el.querySelector('.iw-ranked-judge__note');
  note.textContent = engine.knockout || data.knockout ? t('KNOCKOUT · COUNT REACHED ZERO')
    : engine.overtime || data.overtime ? t('OVERTIME · RANKED OBJECTIVE DECIDED THE MATCH')
      : engine.reason === 'time' || data.reason === 'time' ? t('TIME · LOWEST COUNT WINS') : t('RANKED OBJECTIVE RESULT');
  hud.overLayer.appendChild(el);
  return new Promise(resolve => {
    let elapsed = 0, done = false, settled = false, removed = false;
    const startFxTime = Number.isFinite(hud._fxTime) ? hud._fxTime : null;
    let showFrame = 0, removeTimer = null, fallbackTimer = null, tick;
    const settle = result => { if (!settled) { settled = true; resolve(result); } };
    const cleanup = () => {
      clearTimeout(removeTimer); clearTimeout(fallbackTimer); removeTimer = fallbackTimer = null;
      cancelAnimationFrame(showFrame); showFrame = 0;
      el.remove();
      if (hud._fxMap?.get('ranked-judge') === tick) hud._fxMap.delete('ranked-judge');
      if (hud._judgeOwner === owner) hud._judgeOwner = null;
      if (hud._fxMap && !hud._fxMap.size) { cancelAnimationFrame(hud._rafId); hud._rafId = 0; hud._fxClock?.dispose(); hud._fxClock = null; }
    };
    const owner = { kind:'ranked', current, cancel: () => {
      if (removed) return;
      removed = true; done = true; cleanup(); settle({ cancelled: true });
    } };
    hud._judgeOwner = owner;
    const live = () => !removed && hud._judgeOwner === owner && current();
    showFrame = requestAnimationFrame(() => {
      showFrame = 0;
      if (!live()) { owner.cancel(); return; }
      el.classList.add('is-on');
    });
    const finish = () => {
      if (done) return;
      if (!live()) { owner.cancel(); return; }
      done = true;
      el.classList.add('is-out');
      settle({ winner });
      removeTimer = setTimeout(() => { removed = true; cleanup(); }, 550);
    };
    tick = (dt, clock) => {
      if (!live()) { owner.cancel(); return false; }
      if (done) return true; // Retain ownership during the unchanged 550 ms outgoing transition.
      // Native HUD's presentation clock preserves foreground stalls while
      // its physical dt stays bounded. Custom HUDs retain the one-arg API.
      const presentationTime = hud._fxClock ? hud._fxTime : clock;
      elapsed = startFxTime !== null && Number.isFinite(presentationTime) ? presentationTime - startFxTime : elapsed + dt;
      if (elapsed < 3.25) return true;
      finish();
      return !removed;
    };
    if (typeof hud._addFx === 'function') hud._addFx('ranked-judge', tick);
    else fallbackTimer = setTimeout(() => { fallbackTimer = null; finish(); }, 3250);
  });
}

const objectiveScratch = new WeakMap();
function projectObjective(minimap, point) {
  let x, y, z;
  if (Array.isArray(point)) { if (point.length < 3) return null; x=point[0]; y=point[1]; z=point[2]; }
  else if(point) { x=point.x; y=point.y; z=point.z; }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  let xy=objectiveScratch.get(minimap);if(!xy){xy={x:0,y:0};objectiveScratch.set(minimap,xy);}
  return minimap.toCanvas(x,z,xy);
}

function marker(ctx, minimap, point, color, label, radius = 5, projected = null) {
  const xy = projected ?? projectObjective(minimap,point);
  if (!xy) return;
  const x=xy.x,y=xy.y;
  ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.fillStyle = '#15121c'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  if (label) { ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#15121c'; ctx.strokeText(label, x, y); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y); }
}

function drawObjectives(minimap, engine, G) {
  const stage = engine?.stage, state = engine?.rule?.state;
  if (!stage || !state || !minimap?.ctx || !minimap.toCanvas) return;
  const ctx = minimap.ctx, colors = G.teamHex || ['#ff8a14', '#3675ff'];
  ctx.save(); ctx.globalAlpha = .94;
  if (engine.mode === 'zones') {
    (stage.zones || []).forEach((zone, i) => {
      const center = zone.center, size = zone.size, p = projectObjective(minimap,center);
      if (!p || !Array.isArray(size)) return;
      const px=p.x,py=p.y;
      const owner = state.zones?.[i]?.team;
      const color = owner === 0 || owner === 1 ? colors[owner] : '#fff';
      const w = Math.max(6, size[0] * minimap.s), h = Math.max(6, size[1] * minimap.s);
      ctx.fillStyle = color; ctx.globalAlpha = owner === 0 || owner === 1 ? .18 : .08; ctx.fillRect(px - w / 2, py - h / 2, w, h);
      ctx.globalAlpha = .95; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(px - w / 2, py - h / 2, w, h);
      marker(ctx, minimap, center, color, String(i + 1), 4, p);
    });
  } else if (engine.mode === 'tower') {
    const path = stage.tower?.path || [];
    if (path.length > 1) {
      if (!strokeTowerRoute(minimap, stage, path, ctx)) {
        ctx.beginPath(); path.forEach((p, i) => { const xy = projectObjective(minimap,p); if (!xy) return; if (!i) ctx.moveTo(xy.x, xy.y); else ctx.lineTo(xy.x, xy.y); });
        ctx.strokeStyle = '#fff'; ctx.globalAlpha = .58; ctx.lineWidth = Math.max(2, minimap.s * .32); ctx.stroke();
      }
    }
    const position = state.position || path[Math.round(finite(stage.tower?.centerIndex, Math.floor(path.length / 2)))];
    marker(ctx, minimap, position, state.controllingTeam === 0 || state.controllingTeam === 1 ? colors[state.controllingTeam] : '#ffe28a', 'T', 6);
    (stage.tower?.checkpoints || []).forEach((team, t) => (team || []).forEach((cp, i) => {
      const p = towerCheckpointPosition(stage, t, cp?.progress, engine.rule?.metrics);
      if (p) marker(ctx, minimap, p, colors[t], String(i + 1), 3);
    }));
  } else if (engine.mode === 'rainmaker') {
    const pos = state.pos || stage.rainmaker?.center;
    marker(ctx, minimap, pos, state.carrier != null ? colors[state.carrierTeam ?? 0] : '#ffe28a', 'R', 6);
    const checkpoint = state.checkpoint || {};
    (stage.rainmaker?.checkpoints || []).forEach((points, team) => {
      const choices = Array.isArray(points) ? points : [];
      const passed = checkpoint.passed?.[team] === true;
      const selected = checkpoint.choice?.[team];
      choices.forEach((point, index) => {
        if (passed && index !== selected) return;
        marker(ctx, minimap, point, colors[team], passed ? '✓' : `C${index + 1}`, 4);
      });
    });
    (stage.rainmaker?.goals || []).forEach((p, team) => {
      const open = checkpoint.goalOpen?.[team] === true;
      marker(ctx, minimap, p, open ? colors[team] : '#8a8792', open ? 'G' : '×', open ? 5 : 4);
    });
  } else if (engine.mode === 'clams') {
    // Draw the rule's live positions (including thrown and dropped clams),
    // never the stage's spawn anchors, which only seed a match at setup.
    (state.clams || []).forEach(clam => marker(ctx, minimap, clam.pos, clam.kind === 'power' ? '#ffe28a' : '#fff', clam.kind === 'power' ? 'P' : null, clam.kind === 'power' ? 5 : 2.5));
    (stage.clams?.goals || []).forEach((p, team) => marker(ctx, minimap, p, colors[team], 'B', 6));
    const inventories = state.inventories || {};
    let powerIds = null;
    for (const id of Object.keys(inventories)) if (inventories[id]?.power) (powerIds ??= []).push(id);
    const actors = G.match?.actors || [];
    let actorIndex=null;
    if((powerIds?.length || 0)>=4 && actors.length>=4){
      actorIndex=new Map();
      for(const actor of actors){
        const id=String(actor.nid ?? `${actor.team}:${actor.slot}`);
        if(!actorIndex.has(id))actorIndex.set(id,actor);
      }
    }
    for (const id of powerIds || []) {
      const actor = actorIndex ? actorIndex.get(id) : actors.find(a => String(a.nid ?? `${a.team}:${a.slot}`) === id);
      if (actor?.pos) marker(ctx, minimap, actor.pos, colors[actor.team], 'P', 6);
    }
  }
  ctx.restore();
}

export function installRankedUi(api = {}) {
  const { G, HUD, Minimap } = api;
  const disposers = [];
  addStyle();
  if (HUD?.prototype) {
    const proto = HUD.prototype;
    if (!proto._rankedUiWrapped) {
      Object.defineProperty(proto, '_rankedUiWrapped', { value: true });
      const originalUpdate = proto.update;
      proto.update = function (dt, frame) {
        if (this._judgeOwner?.kind === 'ranked' && !this._judgeOwner.current()) this._judgeOwner.cancel();
        const result = originalUpdate?.call(this, dt, frame);
        updateHud(this, G, api);
        return result;
      };
      const originalJudge = proto.judge;
      proto.judge = function (data = {}) {
        const engine = rankedOf(G);
        return engine ? rankedJudge(this, engine, data, G, api) : originalJudge.call(this, data);
      };
      const originalSetVisible = proto.setVisible;
      if (typeof originalSetVisible === 'function') proto.setVisible = function (visible, ...args) {
        if (!visible && this._judgeOwner?.kind === 'ranked' && !this._judgeOwner.current()) this._judgeOwner.cancel();
        return originalSetVisible.call(this, visible, ...args);
      };
      const originalDispose = proto.dispose;
      if (typeof originalDispose === 'function') proto.dispose = function (...args) {
        if (this._judgeOwner?.kind === 'ranked') this._judgeOwner.cancel();
        return originalDispose.apply(this, args);
      };
    }
  }
  if (Minimap?.prototype?._compose && !Minimap.prototype._rankedUiWrapped) {
    const proto = Minimap.prototype, compose = proto._compose;
    Object.defineProperty(proto, '_rankedUiWrapped', { value: true });
    const update = proto.update;
    if (typeof update === 'function') proto.update = function (dt, force) {
      if (objectiveOverlayChanged(this, rankedOf(G), G)) this._composeDirty = true;
      return update.call(this, dt, force);
    };
    proto._compose = function (dt) {
      const result = compose.call(this, dt);
      drawObjectives(this, rankedOf(G), G);
      return result;
    };
  }
  const unsub = typeof api.on === 'function' ? api.on('ranked:event', event => {
    if (!event || event.match !== G?.match || event.kind === 'special-gain') return;
    const hud = G?.hud;
    if (!hud?.banner) return;
    const labels = { overtime: 'OVERTIME!', checkpoint: 'CHECKPOINT!', 'tower-capture': 'TOWER CONTROL!', 'zone-capture': 'ZONE SECURED!', 'clam-score': 'CLAMS SCORED!' };
    if (labels[event.kind]) hud.banner('custom', rankedText(api.LANG, labels[event.kind]));
  }) : null;
  if (typeof unsub === 'function') disposers.push(unsub);
  return () => { for (const dispose of disposers) { try { dispose(); } catch {} } };
}
