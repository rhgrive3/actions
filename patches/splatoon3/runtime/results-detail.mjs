// Detailed results (2026-11-05): a DETAILS button on the result screen opens a
// per-player table. Kills, assists, deaths, specials and turf come from the
// same Actor.stats the existing result rows use; attacks / accuracy / hits /
// damage / subs come from match-insights.mjs. A value this client did not
// simulate (an online remote player's own attacks) is shown as "—".
let deps = { G: null, WEAPONS: {}, isJa: false };
import { summarizeInsights } from './match-insights.mjs';

const T = {
  details: ['DETAILS', '詳細リザルト'], close: ['Close', 'とじる'], player: ['Player', 'プレイヤー'], weapon: ['Weapon', 'ブキ'],
  kills: ['Splats', 'キル'], assists: ['Assists', 'アシスト'], deaths: ['Deaths', 'デス'], turf: ['Turf', '塗り'],
  attacks: ['Attacks', '攻撃回数'], accuracy: ['Accuracy', '命中率'], hits: ['Hits', '命中数'], damage: ['Damage', '与ダメージ'],
  subs: ['Subs', 'サブ使用'], specials: ['Specials', 'SP使用'],
  note: ['Accuracy = attacks that hit an opponent at least once ÷ attacks. "—": simulated on another player\'s device.',
    '命中率＝相手に1回以上当たった攻撃 ÷ 攻撃回数。「—」は他の端末で処理された値です。'],
};
const tr = k => T[k][deps.isJa ? 1 : 0];

/** Attach `detail` rows to result data (players are built from match.actors in order). */
export function attachResultDetails(data, match = deps.G?.match) {
  const players = data?.players, actors = match?.actors;
  if (!Array.isArray(players) || !Array.isArray(actors)) return data;
  players.forEach((p, i) => {
    const a = actors[i] && actors[i].name === p.name ? actors[i] : actors.find(x => x.name === p.name && x.team === p.team);
    if (a) p.detail = summarizeInsights(a);
  });
  return data;
}

const dash = v => v === null || v === undefined ? '—' : String(v);
export function detailCells(p, weapons = deps.WEAPONS) {
  const d = p.detail || {};
  return [p.name, weapons?.[p.weapon]?.name || p.weapon || '', dash(d.splats ?? p.directSplats ?? p.splats), dash(d.assists ?? p.assists), dash(d.deaths ?? p.deaths),
    dash(d.turf ?? p.turf), dash(d.attacks), d.accuracy == null ? '—' : `${Math.round(d.accuracy * 100)}%`, dash(d.hits), dash(d.damage), dash(d.subs), dash(d.specials ?? p.specials)];
}
export const DETAIL_COLUMNS = ['player', 'weapon', 'kills', 'assists', 'deaths', 'turf', 'attacks', 'accuracy', 'hits', 'damage', 'subs', 'specials'];

export const RESULTS_DETAIL_CSS = `
.s3-rdetail { max-width: min(96vw, 980px); overflow-x: auto; -webkit-overflow-scrolling: touch; }
.s3-rdetail table { border-collapse: collapse; font-size: 12px; white-space: nowrap; width: 100%; }
.s3-rdetail th, .s3-rdetail td { padding: 4px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,.12); }
.s3-rdetail th:nth-child(-n+2), .s3-rdetail td:nth-child(-n+2) { text-align: left; }
.s3-rdetail tr.is-self td { font-weight: 800; }
.s3-rdetail tr.is-team1 td:first-child { border-left: 4px solid var(--b, #4a5cf0); }
.s3-rdetail tr.is-team0 td:first-child { border-left: 4px solid var(--a, #ff8a14); }
.s3-rdetail__note { font-size: 11px; opacity: .75; margin-top: 6px; white-space: normal; }
.iw-modal.s3-rdetail-modal .iw-modal__card { width: min(96vw, 1000px); max-width: none; max-height: 94vh; overflow-y: auto; }
.s3-rdetail { max-width: 100%; }
`;
export function buildDetailTable(data) {
  const doc = globalThis.document;
  if (!doc) return null;
  const wrap = doc.createElement('div'); wrap.className = 's3-rdetail';
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  for (const c of DETAIL_COLUMNS) { const th = doc.createElement('th'); th.textContent = tr(c); head.append(th); }
  table.append(head);
  for (const p of [...(data.players || [])].sort((a, b) => (a.team - b.team) || ((b.detail?.splats ?? 0) - (a.detail?.splats ?? 0)))) {
    const row = doc.createElement('tr');
    row.className = `is-team${p.team}${p.isSelf ? ' is-self' : ''}`;
    for (const v of detailCells(p)) { const td = doc.createElement('td'); td.textContent = v; row.append(td); }
    table.append(row);
  }
  const note = doc.createElement('p'); note.className = 's3-rdetail__note'; note.textContent = tr('note');
  wrap.append(table, note);
  return wrap;
}

export function installResultsDetail(Menus, injected = {}) {
  deps = { ...deps, ...injected };
  const P = Menus?.prototype;
  if (!P || P._s3ResultsDetail) return;
  P._s3ResultsDetail = true;
  const show = P.showResults;
  if (typeof show === 'function') P.showResults = function (data, ...rest) { attachResultDetails(data); return show.call(this, data, ...rest); };
  const results = P._scr_results;
  if (typeof results !== 'function') return;
  P._scr_results = function (...args) {
    const scr = results.apply(this, args);
    const data = this._results;
    const btns = scr?.el?.querySelector?.('.iw-res__btns');
    if (!btns || !data?.players?.some(p => p.detail)) return scr;
    const doc = globalThis.document;
    if (doc && !doc.getElementById('s3-rdetail-css')) { const s = doc.createElement('style'); s.id = 's3-rdetail-css'; s.textContent = RESULTS_DETAIL_CSS; doc.head.append(s); }
    const btn = this._btn({ id: 'result-details', label: tr('details'), cls: 'iw-btn--wide iw-in iw-in--pop s3-rdetail-btn', accept: () => {
      if (this._modal) return;
      this._openModal({ title: tr('details'), buttons: [{ label: tr('close'), accept: () => this._closeModal() }] });
      const modal = this._modal;
      modal.classList.add('s3-rdetail-modal');
      const colors = data.colors || [];
      const css = c => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c?.isColor ? '#' + c.getHexString() : String(c);
      if (colors[0] != null) modal.style.setProperty('--a', css(colors[0]));
      if (colors[1] != null) modal.style.setProperty('--b', css(colors[1]));
      modal.querySelector('.iw-modal__btns')?.before(buildDetailTable(data));
      modal._onBack = () => this._closeModal();
    } });
    btns.prepend(btn);
    return scr;
  };
}
