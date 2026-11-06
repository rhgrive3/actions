// PLAY → 2v2・1v1: a mode card after the Practice Range card (same construction as
// practice-range/runtime/menu.mjs). Accepting it asks 2v2 or 1v1 and starts an
// offline Turf War on Inkbox Depot with Bots on the remaining spots.
import { h, splatSVG, safeCall, restartAnim } from '../../../src/ui/ui-util.js';
import { GLYPHS } from '../../../src/ui/ui-icons.js';
import { isJa } from '../../../src/i18n.js';
import { DEPOT_ID } from './depot-map.mjs';

const L = (ja, en) => (isJa ? ja : en);

function startDuel(menus, card, teamSize) {
  if (menus._starting) return;
  menus._starting = true;
  safeCall(() => menus.api.prepareMatch && menus.api.prepareMatch());   // inside the tap (iOS motion permission)
  if (card) restartAnim(card, 'is-pick');
  menus._sfx('ui_confirm'); menus._sfx('splat_small', 0.06);
  const s = safeCall(() => menus._settings?.()) || {};
  menus._runWipe(() => {
    menus._starting = false;
    safeCall(() => menus.api.startMatch && menus.api.startMatch({ mapId: DEPOT_ID, mode: 'turf', teamSize, duration: 180, difficulty: s.difficulty || 'normal', time: 'day' }));
    if (menus.current === 'mode') menus.show(null, { instantLeave: true });
  });
}

function pick(menus, card) {
  menus._openModal({
    title: L('2対2・1対1', '2v2 · 1v1'),
    text: L('インクボックス倉庫で戦う人数を選んでください（空いた枠はBot）。', 'Pick the team size for Inkbox Depot (Bots fill the other spots).'),
    buttons: [
      { label: L('2対2', '2v2'), cls: 'iw-btn--primary', sound: null, accept: () => { menus._closeModal(true); startDuel(menus, card, 2); } },
      { label: L('1対1', '1v1'), sound: null, accept: () => { menus._closeModal(true); startDuel(menus, card, 1); } },
      { label: L('もどる', 'BACK'), sound: null, accept: () => menus._closeModal() },
    ],
  });
}

export function duelCard(menus) {
  const c = h('button', { class: 'iw-mode iw-mode--duel iw-in iw-in--pop', style: { '--tilt': '-0.8deg' } },
    h('span', { class: 'iw-mode__art' }, h('i', { class: 'iw-mode__tint' }),
      h('span', { class: 'iw-mode__splat', html: splatSVG({ seed: 91, fill: 'var(--mc)', r: 58, arms: 8, drops: 4 }) }),
      h('i', { class: 'iw-mode__glare' })),
    h('span', { class: 'iw-mode__kicker' }, L('少人数', 'SMALL TEAMS')),
    h('span', { class: 'iw-mode__tape' }, h('span', { class: 'iw-display' }, L('2対2・1対1', '2v2 · 1v1'))),
    h('span', { class: 'iw-mode__blurb' }, L('専用の屋内ステージ「インクボックス倉庫」でナワバリバトル。', 'Turf War on its own indoor stage, Inkbox Depot.')),
    h('span', { class: 'iw-mode__chips' }, [[GLYPHS.users, L('2対2 / 1対1', '2v2 / 1v1')], [GLYPHS.map, L('インクボックス倉庫', 'INKBOX DEPOT')], [GLYPHS.clock, L('3分', '3 MIN')]]
      .map(([ic, t]) => h('span', { class: 'iw-chip' }, h('i', { html: ic }), t))),
    h('span', { class: 'iw-mode__go' }, h('i', { html: GLYPHS.play }), 'START'));
  c.dataset.cur = 'own';
  c.style.setProperty('--mc', '#c75b4a'); c.style.setProperty('--mc-rgb', '199, 91, 74');
  c.style.setProperty('--mc-l', '#f2a596'); c.style.setProperty('--mc-d', '#6b2a20'); c.style.setProperty('--mc-ink', '#fff');
  menus._fx(c, { tilt: 7 });
  menus._bind(c, { id: 'mode-duel', accept: () => pick(menus, c) });
  return c;
}

function decorateMode(menus, scr) {
  const row = scr.el.querySelector('.iw-modesel__row');
  const range = scr.el.querySelector('.iw-mode--range');
  if (!row || !range) return scr;
  const card = duelCard(menus);
  row.appendChild(card);
  const onNav = scr.onNav;
  scr.onNav = (dir) => {
    const f = menus._focus;
    if (f === range && dir === 'right') { menus._moveFocus(card, dir); return true; }
    if (f === card) {
      if (dir === 'left') { menus._moveFocus(range, dir); return true; }
      if (dir === 'right' || dir === 'up' || dir === 'down') { menus._bump(card, dir); return true; }
    }
    return onNav?.(dir);
  };
  return scr;
}

// Installed after the Practice Range decorated _scr_mode, so the range card exists.
export function installDuelMenus(Menus) {
  const P = Menus?.prototype;
  if (!P || P._duelMenusInstalled) return;
  P._duelMenusInstalled = true;
  const mode = P._scr_mode;
  P._scr_mode = function (...args) { return decorateMode(this, mode.apply(this, args)); };
}
