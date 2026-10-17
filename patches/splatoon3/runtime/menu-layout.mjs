// Menu layout for the patched catalogue sizes. Upstream menus were laid out
// for 4 stages and 7 weapons; the patched build lists 26 stages and 160 main
// weapons. Presentation only: selection, saving, navigation graphs and the
// screens' own state stay with their native owners.
//
//  - Entrance stagger: every `.iw-in` element waits index × 38 ms. With 160
//    weapon cards the weapon detail panel (stats, sub/special) appeared only
//    after ~6 s; the stage options after ~1 s. The stagger is capped.
//  - Keyboard / pad focus inside any scrolling region (stage list, weapon
//    grid, range pause panel, touch layouts) is kept in view. Upstream does
//    this for settings rows (.iw-rows) only.
//  - Stage select: the ticket list becomes a bounded scroller (CSS in
//    ui.css) and opens scrolled to the selected stage.
//  - Loadout: weapon class filter, sub/special marks on every card (the 95
//    alternate kits share their base weapon's icon and name stem).
//  - Results: the continuation actions (local-quality) get translated labels
//    and an icon so the button row reads as one set (layout in ui.css).
import { isJa, t } from '../../../src/i18n.js';
import { GLYPHS } from '../../../src/ui/ui-icons.js';

const INSTALLED = Symbol.for('inkwave.s3.menu-layout.v1');
export const ENTRANCE_STAGGER_CAP = 14;
const L = (en, ja) => (isJa ? ja : en);

export function capEntranceStagger(root, cap = ENTRANCE_STAGGER_CAP) {
  if (!root?.querySelectorAll) return 0;
  let capped = 0;
  for (const n of root.querySelectorAll('.iw-in')) {
    const i = Number.parseFloat(n.style.getPropertyValue('--i'));
    if (i > cap) { n.style.setProperty('--i', String(cap)); capped++; }
  }
  return capped;
}

const SCROLLS = /(auto|scroll)/;
/** Nearest scrolling ancestor of `el` up to (and including) `root`; null when none can scroll. */
export function scrollHost(el, root, getStyle = globalThis.getComputedStyle) {
  for (let e = el?.parentElement; e; e = e.parentElement) {
    const cs = getStyle?.(e);
    if (cs && SCROLLS.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) return e;
    if (e === root) break;
  }
  return null;
}

/** Scroll `host` so `el` is fully clear of its edge (plus a peek of what follows). */
export function keepInView(el, host, { smooth = true, center = false } = {}) {
  if (!el || !host) return 0;
  const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
  let d = 0;
  if (center) d = (r.top + r.height / 2) - (b.top + b.height / 2);
  else {
    const m = Math.min(r.height * 0.6, b.height * 0.18);
    d = r.top < b.top + m ? r.top - b.top - m : r.bottom > b.bottom - m ? r.bottom - b.bottom + m : 0;
  }
  if (Math.abs(d) < 1) return 0;
  if (host.scrollTo) host.scrollTo({ top: host.scrollTop + d, behavior: smooth ? 'smooth' : 'auto' });
  else host.scrollTop += d;
  return d;
}

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function decorateSetup(menus, scr) {
  const list = scr.el.querySelector('.iw-ss__list');
  if (!list) return scr;
  const tickets = [...list.querySelectorAll('.iw-ticket')];
  list.classList.toggle('is-many', tickets.length > 6);
  list.style.setProperty('--n', String(tickets.length));
  const afterMount = scr.afterMount;
  scr.afterMount = (...args) => {
    const result = afterMount?.(...args);
    // open on the selected stage (the 26th stage would otherwise be below the fold)
    const sel = list.querySelector('.iw-ticket.is-sel');
    if (sel) requestAnimationFrame(() => { if (sel.isConnected) keepInView(sel, list, { smooth: false, center: true }); });
    return result;
  };
  return scr;
}

function weaponCategory(w, card) {
  const key = String(w?.class || w?.kind || '').toLowerCase();
  const label = card?.querySelector('.iw-wcard__kind')?.textContent?.trim() || w?.class || w?.kind || '';
  return { key, label };
}

function decorateLoadout(menus, scr, api) {
  const grid = scr.el.querySelector('.iw-wgrid');
  if (!grid) return scr;
  const W = api.WEAPONS || {}, SUB = api.SUB || {}, SPECIALS = api.SPECIALS || {};
  const subIcons = api.SUB_ICONS || {}, spIcons = api.SPECIAL_ICONS || {};
  const cards = [...grid.querySelectorAll('.iw-wcard')].filter((c) => c._wid);
  const cats = new Map();
  for (const c of cards) {
    const w = W[c._wid];
    // sub + special marks: the alternate kits differ only by them
    if (w && !c.querySelector('.s3-wkit')) {
      const mark = (cls, icon, title) => {
        const i = document.createElement('i');
        i.className = cls; i.title = title || ''; i.innerHTML = icon || '';
        return i;
      };
      const box = document.createElement('span');
      box.className = 's3-wkit iw-noclick';
      box.append(mark('s3-wkit__sub', subIcons[w.sub] || subIcons.bomb, SUB[w.sub]?.name),
        mark('s3-wkit__sp', spIcons[w.special] || '', SPECIALS[w.special]?.name));
      c.appendChild(box);
      c.title = w.name + (SUB[w.sub]?.name ? ' · ' + SUB[w.sub].name : '') + (SPECIALS[w.special]?.name ? ' · ' + SPECIALS[w.special].name : '');
    }
    const cat = weaponCategory(w, c);
    c.dataset.cat = cat.key;
    if (cat.key && !cats.has(cat.key)) cats.set(cat.key, { label: cat.label, n: 0 });
    if (cats.has(cat.key)) cats.get(cat.key).n++;
  }
  grid.classList.add('s3-wgrid');
  if (cats.size < 2 || cards.length < 12) return scr;

  // ---- class filter (Q / E or LB / RB cycle it, like the native tab rows)
  const order = [['all', { label: L('ALL', 'すべて'), n: cards.length }], ...cats];
  const bar = document.createElement('div');
  bar.className = 's3-wfilter iw-in';
  bar.setAttribute('role', 'tablist');
  let cur = 'all';
  const tabs = order.map(([key, { label, n }]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.className = 's3-wfilter__tab';
    b.dataset.cat = key; b.setAttribute('role', 'tab');
    const t = document.createElement('span'); t.textContent = label;
    const c = document.createElement('small'); c.textContent = String(n);
    b.append(t, c);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => setCat(key, true));
    return b;
  });
  bar.append(...tabs);
  const setCat = (key, sound, { repairFocus = true } = {}) => {
    if (!order.some(([k]) => k === key)) key = 'all';
    cur = key;
    for (const t of tabs) { const on = t.dataset.cat === key; t.classList.toggle('is-sel', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); }
    for (const c of cards) c.hidden = key !== 'all' && c.dataset.cat !== key;
    grid.scrollTop = 0;
    if (sound) menus._sfx?.('ui_toggle');
    const f = menus._focus;
    // keep the selection on a visible card: the equipped one when it is in this class
    if (repairFocus && (!f || (f._wid && f.hidden))) {
      const next = cards.find((c) => !c.hidden && c.classList.contains('is-equipped')) || cards.find((c) => !c.hidden);
      if (next) { menus._setFocus(next, { snap: true }); keepInView(next, grid, { smooth: false }); }
    }
    const sel = tabs.find((t) => t.dataset.cat === key);
    sel?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const label = scr.el.querySelector('.iw-loadout__body .iw-seclabel');
  if (label) label.after(bar); else grid.before(bar);
  // Native _swap assigns this screen only after its factory returns. Taking
  // focus here would call the outgoing screen's onFocus after destroy and
  // suppress the incoming screen's initial onFocus. Let _swap own that focus.
  setCat('all', false, { repairFocus: false });
  const onNav = scr.onNav;
  scr.onNav = (dir) => {
    if (dir === 'tab_prev' || dir === 'tab_next') {
      const i = order.findIndex(([k]) => k === cur), n = order.length;
      setCat(order[(i + (dir === 'tab_next' ? 1 : -1) + n) % n][0], true);
      return true;
    }
    return onNav ? onNav(dir) : false;
  };
  scr.el.classList.add('has-wfilter');
  return scr;
}

// Continuation buttons are built outside the localized menus module.
const CONTINUATION_LABELS = { 'change-gear-continue': ['CHANGE GEAR, THEN GO!', GLYPHS.shirt], 'keep-going': ['KEEP GOING', GLYPHS.play], 'continue-with-gear': ['KEEP GOING', GLYPHS.play] };
export function localizeContinuation(root) {
  let n = 0;
  for (const [id, [label, icon]] of Object.entries(CONTINUATION_LABELS)) {
    const b = root?.querySelector?.(`[data-id="${id}"]`);
    const el = b?.querySelector('.iw-btn__label');
    if (!el) continue;
    if (el.textContent === label) el.textContent = t(label);
    if (icon && !b.querySelector('.iw-btn__icon')) {
      const i = document.createElement('span'); i.className = 'iw-btn__icon'; i.innerHTML = icon;
      b.querySelector('.iw-btn__text')?.before(i);
    }
    n++;
  }
  return n;
}

export function installMenuLayout(api) {
  const Menus = api?.Menus;
  const P = Menus?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return false;
  Object.defineProperty(P, INSTALLED, { value: true });
  const swap = P._swap, moveFocus = P._moveFocus, setup = P._scr_setup, loadout = P._scr_loadout;
  if (swap) P._swap = function (...args) {
    const result = swap.apply(this, args);
    if (this._scr?.el) { capEntranceStagger(this._scr.el); localizeContinuation(this._scr.el); }
    return result;
  };
  if (moveFocus) P._moveFocus = function (next, dir) {
    const result = moveFocus.call(this, next, dir);
    // upstream keeps settings rows (.iw-rows) in view itself
    const root = this._modal || this._scr?.el;
    if (result && next?.isConnected && root && !next.closest?.('.iw-rows')) {
      const host = scrollHost(next, root);
      if (host) keepInView(next, host, { smooth: !reduced() });
    }
    return result;
  };
  if (setup) P._scr_setup = function (...args) { return decorateSetup(this, setup.apply(this, args)); };
  if (loadout) P._scr_loadout = function (...args) { return decorateLoadout(this, loadout.apply(this, args), api); };
  return true;
}
