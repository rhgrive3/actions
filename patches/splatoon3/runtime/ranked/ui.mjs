import { rankedText } from './strings.mjs';
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

function addStyle() {
  if (typeof document === 'undefined' || document.querySelector('style[data-iw-ranked-runtime]')) return;
  const style = document.createElement('style');
  style.dataset.iwRankedRuntime = '1';
  style.textContent = UI_CSS;
  (document.head || document.body)?.appendChild(style);
}

export function objectiveText(engine, G, api = {}) {
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  const state = engine.rule?.state || {}, frame = engine.frame || {};
  if (engine.mode === 'zones') {
    const coverage = frame.zoneCoverage || [];
    const captured = state.zones || [];
    if (coverage.length) return coverage.map((pair, i) => {
      const a = Math.round(clamp01(pair?.[0]) * 100), b = Math.round(clamp01(pair?.[1]) * 100);
      const owner = captured[i]?.team;
      return `${t('ZONE {n}', { n: i + 1 })} ${a}/${b}${owner === 0 || owner === 1 ? ` · ${t(teamName(owner, G.palette?.names || G.match?.palette?.names))}` : ''}`;
    }).join('   ');
    return state.controllingTeam === 0 || state.controllingTeam === 1
      ? t('{team} CONTROLS ALL ZONES', { team: t(teamName(state.controllingTeam, G.palette?.names || G.match?.palette?.names)) }) : t('CAPTURE ALL ZONES');
  }
  if (engine.mode === 'tower') {
    const p = Math.round(clamp01(state.progress) * 100);
    const team = state.controllingTeam;
    const index = (state.checkpointIndex?.[team] || 0) + 1;
    const total = engine.stage?.tower?.checkpoints?.[team]?.length || 0;
    return t('{team} TOWER · {progress}%', { team: t(teamName(team, G.palette?.names || G.match?.palette?.names)), progress: p }) + (total ? ' · ' + t('CP {index}/{total}', { index: Math.min(index, total), total }) : '');
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
    const carried = team >= 0 ? Object.values(inventory).filter(item => item?.team === team)
      .reduce((sum, item) => sum + finite(item?.small) + finite(item?.power ? 8 : 0), 0) : 0;
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

function updateHud(hud, G, api) {
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  const engine = rankedOf(G);
  if (!hud?.el || typeof document === 'undefined') return;
  addStyle();
  let el = hud._rankedHud;
  if (!el) {
    el = document.createElement('div');
    el.className = 'iw-ranked-hud';
    el.innerHTML = '<b class="iw-ranked-hud__rule"></b><span class="iw-ranked-hud__score"><span class="iw-ranked-hud__team" data-team="0">ALPHA</span><b class="iw-ranked-hud__count" data-count="0">100</b><small class="iw-ranked-hud__penalty" data-penalty="0"></small><i>·</i><span class="iw-ranked-hud__team" data-team="1">BRAVO</span><b class="iw-ranked-hud__count" data-count="1">100</b><small class="iw-ranked-hud__penalty" data-penalty="1"></small></span><b class="iw-ranked-hud__clock"></b><small class="iw-ranked-hud__objective"></small><small class="iw-ranked-hud__hint" hidden></small>';
    hud.el.appendChild(el);
    hud._rankedHud = el;
  }
  el.hidden = !engine;
  if (!engine) return;
  const names = G.palette?.names || G.match?.palette?.names;
  el.dataset.mode = engine.mode;
  el.querySelector('.iw-ranked-hud__rule').textContent = t(RULE_LABELS[engine.mode]);
  el.querySelectorAll('[data-team]').forEach(node => {
    const team = Number(node.dataset.team);
    node.textContent = t(teamName(team, names));
    node.style.setProperty('--rkt', G.teamHex?.[team] || (team ? '#3675ff' : '#ff8a14'));
  });
  el.querySelectorAll('[data-count]').forEach(node => {
    const team = Number(node.dataset.count);
    node.textContent = String(Math.ceil(finite(engine.counts?.[team], 100)));
    node.classList.toggle('is-leading', engine.leader === team);
  });
  el.querySelectorAll('[data-penalty]').forEach(node => {
    const team = Number(node.dataset.penalty), penalty = Math.ceil(finite(engine.penalties?.[team]));
    node.textContent = penalty > 0 ? t('PEN {n}', { n: penalty }) : '';
  });
  const clock = engine.overtime ? t('OT {time}', { time: fmtClock(engine.overtimeElapsed) }) : fmtClock(engine.time);
  el.querySelector('.iw-ranked-hud__clock').textContent = clock;
  el.querySelector('.iw-ranked-hud__objective').textContent = objectiveText(engine, G, api);
  const hint = el.querySelector('.iw-ranked-hud__hint');
  hint.hidden = engine.mode !== 'clams';
  hint.textContent = engine.mode === 'clams' ? t(api.TXT?.mode === 'touch' ? 'THROW' : api.TXT?.mode === 'pad' ? 'THROW [A]' : 'THROW [C]') : '';
}

function rankedJudge(hud, engine, data = {}, G = {}, api = {}) {
  const t = (text, vars) => rankedText(api.LANG, text, vars);
  if (!hud?.overLayer || typeof document === 'undefined') return Promise.resolve({ winner: engine.winner });
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
  requestAnimationFrame(() => el.classList.add('is-on'));
  return new Promise(resolve => {
    let elapsed = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('is-out');
      resolve({ winner });
      setTimeout(() => el.remove(), 550);
    };
    if (typeof hud._addFx === 'function') hud._addFx('ranked-judge', dt => {
      elapsed += dt;
      if (elapsed < 3.25) return true;
      finish();
      return false;
    });
    else setTimeout(finish, 3250);
  });
}

function marker(ctx, minimap, point, color, label, radius = 5) {
  const p = pos3(point);
  if (!p) return;
  const xy = minimap.toCanvas(p[0], p[2], { x: 0, y: 0 });
  ctx.beginPath(); ctx.arc(xy.x, xy.y, radius + 2, 0, Math.PI * 2); ctx.fillStyle = '#15121c'; ctx.fill();
  ctx.beginPath(); ctx.arc(xy.x, xy.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  if (label) { ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#15121c'; ctx.strokeText(label, xy.x, xy.y); ctx.fillStyle = '#fff'; ctx.fillText(label, xy.x, xy.y); }
}

function drawObjectives(minimap, engine, G) {
  const stage = engine?.stage, state = engine?.rule?.state;
  if (!stage || !state || !minimap?.ctx || !minimap.toCanvas) return;
  const ctx = minimap.ctx, colors = G.teamHex || ['#ff8a14', '#3675ff'];
  ctx.save(); ctx.globalAlpha = .94;
  if (engine.mode === 'zones') {
    (stage.zones || []).forEach((zone, i) => {
      const center = pos3(zone.center), size = zone.size;
      if (!center || !Array.isArray(size)) return;
      const p = minimap.toCanvas(center[0], center[2], { x: 0, y: 0 });
      const owner = state.zones?.[i]?.team;
      const color = owner === 0 || owner === 1 ? colors[owner] : '#fff';
      const w = Math.max(6, size[0] * minimap.s), h = Math.max(6, size[1] * minimap.s);
      ctx.fillStyle = color; ctx.globalAlpha = owner === 0 || owner === 1 ? .18 : .08; ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.globalAlpha = .95; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
      marker(ctx, minimap, center, color, String(i + 1), 4);
    });
  } else if (engine.mode === 'tower') {
    const path = stage.tower?.path || [];
    if (path.length > 1) {
      ctx.beginPath(); path.forEach((p, i) => { const v = pos3(p); if (!v) return; const xy = minimap.toCanvas(v[0], v[2], { x: 0, y: 0 }); if (!i) ctx.moveTo(xy.x, xy.y); else ctx.lineTo(xy.x, xy.y); });
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = .58; ctx.lineWidth = Math.max(2, minimap.s * .32); ctx.stroke();
    }
    const position = state.position || path[Math.round(finite(stage.tower?.centerIndex, Math.floor(path.length / 2)))];
    marker(ctx, minimap, position, state.controllingTeam === 0 || state.controllingTeam === 1 ? colors[state.controllingTeam] : '#ffe28a', 'T', 6);
    (stage.tower?.checkpoints || []).forEach((team, t) => (team || []).forEach((cp, i) => {
      const p = path[Math.round(clamp01(cp.progress) * Math.max(0, path.length - 1))];
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
    for (const [id, inventory] of Object.entries(state.inventories || {})) {
      if (!inventory?.power) continue;
      const actor = (G.match?.actors || []).find(a => String(a.nid ?? `${a.team}:${a.slot}`) === id);
      if (actor?.pos) marker(ctx, minimap, [actor.pos.x, actor.pos.y, actor.pos.z], colors[actor.team], 'P', 6);
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
        const result = originalUpdate?.call(this, dt, frame);
        updateHud(this, G, api);
        return result;
      };
      const originalJudge = proto.judge;
      proto.judge = function (data = {}) {
        const engine = rankedOf(G);
        return engine ? rankedJudge(this, engine, data, G, api) : originalJudge.call(this, data);
      };
    }
  }
  if (Minimap?.prototype?._compose && !Minimap.prototype._rankedUiWrapped) {
    const proto = Minimap.prototype, compose = proto._compose;
    Object.defineProperty(proto, '_rankedUiWrapped', { value: true });
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
