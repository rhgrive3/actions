// Practice Range menus: a third card on PLAY (next to Turf War and Boss Battle) that starts the range directly, and the
// range's own pause screen (weapon, resets, travel, settings, leave) in place of the turf-war pause panel while a range
// match is running. Built with the menu system's own helpers (_btn, _panel, _header, _prompts, _bind) so it looks and
// navigates like every other screen (mouse, touch, keyboard and pad).
import { G } from '../../../src/core/ctx.js';
import { WEAPONS, WEAPON_ORDER } from '../../../src/config.js';
import { h, splatSVG, safeCall, restartAnim } from '../../../src/ui/ui-util.js';
import { GLYPHS, weaponIcon } from '../../../src/ui/ui-icons.js';
import { ZONES, ZONE_ORDER } from '../stage/zones.mjs';
import { L, isJa } from './strings.mjs';
import { RANGE_ID } from '../range-map.mjs';

const ART = new URL('../../../assets/stages/range-day.webp', import.meta.url).href;
const ART_SM = new URL('../../../assets/stages/range-day-sm.webp', import.meta.url).href;
const zoneName = (id) => (isJa ? ZONES[id].ja : ZONES[id].name);
const SUB = {
  spawn: 'Where you started', lane: 'Paint distance · long shots · bomb throw', gallery: 'Range · damage at distance', paint: '400 m² floor · paint coverage',
  roller: 'Rolling · flicks · curves', dualies: 'Dodge rolls · fire after rolling', squid: 'Swim speed · turns · slopes',
  wall: 'Paint height · climbing · ledges', bomb: 'Throws · bounces · blast radius', special: 'Special radius · endurance targets',
};

function startRange(menus, card) {
  if (menus._starting) return;
  menus._starting = true;
  safeCall(() => menus.api.prepareMatch && menus.api.prepareMatch());   // still inside the tap (iOS motion permission)
  if (card) restartAnim(card, 'is-pick');
  menus._sfx('ui_confirm'); menus._sfx('splat_small', 0.06);
  menus._runWipe(() => {
    menus._starting = false;
    safeCall(() => menus.api.startMatch && menus.api.startMatch({ mapId: RANGE_ID }));
    if (menus.current === 'mode') menus.show(null, { instantLeave: true });
  });
}

function rangeCard(menus) {
  const img = h('img', { class: 'iw-mode__img', alt: '', draggable: 'false' });
  img.addEventListener('error', () => img.remove(), { once: true });
  img.src = ART;
  const target = h('span', { class: 'iwr-mode__target' }, h('i'), h('i'), h('i'));
  const c = h('button', { class: 'iw-mode iw-mode--range iw-in iw-in--pop', style: { '--tilt': '1.1deg' } },
    h('span', { class: 'iw-mode__art' }, img, h('i', { class: 'iw-mode__tint' }),
      h('span', { class: 'iw-mode__splat', html: splatSVG({ seed: 77, fill: 'var(--mc)', r: 58, arms: 9, drops: 5 }) }),
      h('span', { class: 'iw-mode__hero is-range' }, target), h('i', { class: 'iw-mode__glare' })),
    h('span', { class: 'iw-mode__kicker' }, L('TRAINING')),
    h('span', { class: 'iw-mode__tape' }, h('span', { class: 'iw-display' }, L('PRACTICE RANGE'))),
    h('span', { class: 'iw-mode__blurb' }, L('Range, damage, paint, movement, bombs and specials — measured on a world-scale grid.')),
    h('span', { class: 'iw-mode__chips' }, [[GLYPHS.users, L('SOLO')], [GLYPHS.map, L('9 TEST ZONES')], [GLYPHS.clock, L('NO TIMER')]].map(([ic, t]) => h('span', { class: 'iw-chip' }, h('i', { html: ic }), t))),
    h('span', { class: 'iw-mode__go' }, h('i', { html: GLYPHS.play }), 'START'));
  c.dataset.cur = 'own';
  menus._fx(c, { tilt: 7 });
  menus._bind(c, { id: 'mode-range', accept: () => startRange(menus, c) });
  return c;
}

function decorateMode(menus, scr) {
  const row = scr.el.querySelector('.iw-modesel__row');
  const boss = scr.el.querySelector('.iw-mode--boss');
  if (!row || !boss) return scr;
  const card = rangeCard(menus);
  row.appendChild(card);
  row.classList.add('has-range');
  const bg = scr.el.querySelector('.iw-ss__bg');
  const setBg = () => {
    if (!bg) return;
    const im = h('img', { class: 'iw-ss__bgimg', alt: '', draggable: 'false' });
    im.addEventListener('error', () => im.remove(), { once: true });
    im.src = ART_SM;
    const olds = [...bg.children]; bg.appendChild(im);
    requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('is-on')));
    setTimeout(() => olds.forEach((o) => o.remove()), 900);
  };
  const onFocus = scr.onFocus, onNav = scr.onNav;
  scr.onFocus = (f) => {
    if (f === card) { if (scr.el.dataset.mode !== 'range') { scr.el.dataset.mode = 'range'; setBg(); } return; }
    // leaving the range card: let the native handler swap the art back (it only acts when the mode changes)
    if (scr.el.dataset.mode === 'range' && f && f._mode) scr.el.dataset.mode = '';
    return onFocus?.(f);
  };
  scr.onNav = (dir) => {
    const f = menus._focus;
    if (f === boss && dir === 'right') { menus._moveFocus(card, dir); return true; }
    if (f === card) {
      if (dir === 'left') { menus._moveFocus(boss, dir); return true; }
      if (dir === 'right' || dir === 'up' || dir === 'down') { menus._bump(card, dir); return true; }
    }
    return onNav?.(dir);
  };
  return scr;
}

// ------------------------------------------------------------------ the range pause screen
function rangePause(menus) {
  const session = G.match?.range;
  const items = [
    { id: 'resume', label: L('RESUME'), icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--primary', accept: () => menus._resume(), sound: null },
    { id: 'settings', label: L('SETTINGS'), icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => menus._go('settings') },
    { id: 'quit', label: L('LEAVE RANGE'), icon: GLYPHS.exit, cls: 'iw-btn--menu iw-btn--danger', accept: () => menus._openModal({
      title: L('LEAVE THE RANGE?'), danger: true, text: L('You will head back to the lobby.'),
      buttons: [
        { label: L('STAY'), accept: () => menus._closeModal(), sound: null },
        { label: L('LEAVE'), cls: 'iw-btn--danger', sound: 'ui_confirm', accept: () => {
          menus._closeModal(true);
          safeCall(() => menus.api.quitMatch && menus.api.quitMatch());
          if (menus.current === 'pause') menus.show('main', { wipe: true });
        } },
      ],
    }) },
  ];
  const tilts = [-1.8, 1.2, -1];
  const btns = items.map((it, i) => { const b = menus._btn({ ...it, tilt: tilts[i] }); b.classList.add('iw-in', 'iw-in--left'); return b; });
  const act = (fn) => () => { menus._sfx('ui_confirm'); safeCall(fn); menus._resume(); };

  // weapon chips (the equipped one is marked); choosing one switches and resumes
  const cur = session?.local?.weaponId;
  const wchips = WEAPON_ORDER.map((id) => {
    const W = WEAPONS[id];
    const b = h('button', { class: 'iwr-wchip' + (id === cur ? ' is-on' : '') }, h('span', { class: 'iwr-wchip__icon', html: weaponIcon(W.kind || id) }), h('b', null, W.name), h('small', null, W.class || ''));
    menus._fx(b); menus._bind(b, { id: 'w-' + id, accept: act(() => session?.setWeapon(id)) });
    return b;
  });
  const resets = [
    ['resetPaint', L('RESET PAINT'), 'R', () => session?.resetPaint()],
    ['resetDummies', L('RESET TARGETS'), 'T', () => session?.resetTargets()],
    ['spawn', L('RETURN TO START'), 'G', () => session?.travel('spawn')],
    ['inkCourse', L('INK COURSE'), '', () => session?.inkCourse()],
    ['resupply', L('REFILL'), '', () => session?.resupply()],
  ].map(([id, label, key, fn]) => {
    const b = h('button', { class: 'iwr-rbtn' }, h('b', null, label), key ? h('kbd', null, key) : null);
    menus._fx(b); menus._bind(b, { id: 'r-' + id, accept: act(fn) });
    return b;
  });
  const moving = h('button', { class: 'iwr-rbtn iwr-toggle' + (session?.movingTargets ? ' is-on' : '') }, h('b', null, L('MOVING TARGETS')), h('span', { class: 'iwr-toggle__v' }, session?.movingTargets ? L('ON') : L('OFF')));
  menus._fx(moving);
  menus._bind(moving, { id: 'r-moving', accept: () => {
    menus._sfx('ui_toggle');
    const on = !session?.movingTargets; session?.setMovingTargets(on);
    moving.classList.toggle('is-on', on); moving.querySelector('.iwr-toggle__v').textContent = on ? L('ON') : L('OFF');
  } });
  const travel = ['spawn', ...ZONE_ORDER].map((id) => {
    const z = id === 'spawn' ? null : ZONES[id];
    const b = h('button', { class: 'iwr-zbtn', style: { '--zc': z ? z.accent : '#35405a' } },
      h('span', { class: 'iwr-zbtn__l' }, z ? z.letter : '⌂'),
      h('span', { class: 'iwr-zbtn__t' }, h('b', null, z ? zoneName(id) : L('Spawn deck')), h('small', null, L(SUB[id]))));
    menus._fx(b); menus._bind(b, { id: 'z-' + id, accept: act(() => session?.travel(id)) });
    return b;
  });
  const panel = menus._panel('iwr-pause iw-panel--flat iw-in iw-in--right',
    h('div', { class: 'iwr-pause__sec' }, h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.target || GLYPHS.star }), L('WEAPON')), h('div', { class: 'iwr-wchips' }, wchips)),
    h('div', { class: 'iwr-pause__sec' }, h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.reset }), L('RESETS')), h('div', { class: 'iwr-rbtns' }, resets, moving)),
    h('div', { class: 'iwr-pause__sec' }, h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.map }), L('TRAVEL')),
      h('div', { class: 'iwr-pause__hint' }, L('Choose a zone to jump straight to its reference stand.')), h('div', { class: 'iwr-zbtns' }, travel)),
    h('div', { class: 'iwr-pause__foot' }, L('Every mark is a world coordinate: 1 m on the floor = 1.000 game unit.')));
  const el = h('div', { class: 'iw-screen iw-pause iwr-pausescr' },
    h('div', { class: 'iw-dimbg' }),
    menus._header(L('PRACTICE RANGE'), { back: false, sub: 'INKWAVE INK LAB' }),
    h('nav', { class: 'iw-pause__menu iwr-pause__menu' }, btns),
    panel,
    menus._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));
  return {
    el, initial: btns[0],
    onBack: () => menus._resume(),
  };
}

export function installRangeMenus(Menus) {
  const P = Menus.prototype;
  const mode = P._scr_mode, pause = P._scr_pause;
  P._scr_mode = function (...args) { return decorateMode(this, mode.apply(this, args)); };
  P._scr_pause = function (...args) {
    if (G.match && !G.match.attract && G.match.range) return rangePause(this);
    return pause.apply(this, args);
  };
}
