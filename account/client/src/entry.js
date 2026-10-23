// ZEVANT account entry (small, loaded with the game): the account card on the main menu, the sign-in pill on the
// title screen and window.zevantAccount. The full dialog (panel.js) is a separate chunk fetched on first open.
import chipCss from './styles/chip.css?inline';
import { account } from './store.js';
import { game } from './game.js';
import { t } from './i18n.js';
import { avatarSVG, CORE_ICONS as ICONS } from './art.js';

let panelMod = null, panelLoading = null, openPanel = null;

function loadPanel() {
  if (panelMod) return Promise.resolve(panelMod);
  if (!panelLoading) panelLoading = import('./panel.js').then((m) => (panelMod = m), (e) => { panelLoading = null; throw e; });
  return panelLoading;
}

/** Opens the account dialog. `view`: 'login' | 'register' | 'account' (default: by sign-in state). */
async function open(view) {
  if (openPanel) return openPanel;
  for (const el of document.querySelectorAll('.zva-chip, .zva-tchip')) el.classList.add('is-busy');
  try {
    const { mountPanel } = await loadPanel();
    openPanel = mountPanel({ view, onClose: () => { openPanel = null; } });
    return openPanel;
  } catch (e) {
    console.error('[account] dialog failed to load', e);
    game.sfx('ui_error');
    return null;
  } finally {
    for (const el of document.querySelectorAll('.zva-chip, .zva-tchip')) el.classList.remove('is-busy');
  }
}

const h = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };

function chipText(a) {
  if (a.status === 'user') return [a.user.displayName, t('chip.userSub', { id: a.user.loginId })];
  if (a.status === 'offline') return [t('chip.offline'), t('chip.offlineSub')];
  if (a.status === 'loading') return [t('chip.loading'), ''];
  return [t('chip.guest'), t('chip.guestSub')];
}

// Elements we placed into menu screens, with their cleanup; swept whenever the menus swap screens.
const mounts = new Map();
const track = (el, dispose) => mounts.set(el, dispose);
function sweep() {
  for (const [el, dispose] of mounts) if (!el.isConnected) { mounts.delete(el); dispose(); }
}

// ------------------------------------------------------------------------------------- main menu card
function renderChip(el, a) {
  const [name, sub] = chipText(a);
  el.dataset.state = a.status;
  el.querySelector('.zva-chip__av').innerHTML = a.status === 'offline' ? `<span class="zva-chip__off">${ICONS.cloudOff}</span>` : avatarSVG(a.user);
  el.querySelector('.zva-chip__name').textContent = name;
  el.querySelector('.zva-chip__sub').textContent = sub;
  el.querySelector('.zva-chip__cta').innerHTML = a.status === 'user' ? ICONS.chevron : `<span>${t('chip.signIn')}</span>`;
  el.setAttribute('aria-label', [name, sub].filter(Boolean).join(' — '));
}

function mountMainCard(screen) {
  const side = screen.querySelector('.iw-main__side');
  if (!side || side.querySelector('.zva-chip')) return;
  const el = h('button', 'iw-panel zva-chip iw-in iw-in--right');
  el.type = 'button';
  el.style.setProperty('--i', '3');
  el.append(h('span', 'zva-chip__av'), h('span', 'zva-chip__txt'), h('span', 'zva-chip__cta'));
  el.children[1].append(h('b', 'zva-chip__name'), h('span', 'zva-chip__sub'));
  const profile = side.querySelector('.iw-profile');
  if (profile) profile.after(el); else side.prepend(el);
  game.bindNav(el, 'account', () => open());
  warmPanel();
  const unsub = account.subscribe((a) => renderChip(el, a));
  // the main menu's description line follows keyboard / pad focus; give it our line too
  const desc = screen.querySelector('.iw-main__desctext');
  const watch = new MutationObserver(() => {
    if (desc && el.classList.contains('is-focus')) desc.textContent = account.status === 'user' ? t('chip.desc.user') : t('chip.desc.guest');
  });
  watch.observe(el, { attributes: true, attributeFilter: ['class'] });
  track(el, () => { unsub(); watch.disconnect(); });
}

// ------------------------------------------------------------------------------------- title pill
function mountTitlePill(screen) {
  if (screen.querySelector('.zva-tchip')) return;
  const el = h('button', 'zva-tchip iw-in iw-in--down');
  el.type = 'button';
  el.tabIndex = -1;
  el.append(h('span', 'zva-tchip__av'), h('span', 'zva-tchip__label'));
  // the title screen starts the game on any click: keep ours to ourselves
  for (const type of ['click', 'pointerdown', 'mousedown']) el.addEventListener(type, (e) => e.stopPropagation());
  el.addEventListener('click', () => { game.sfx('ui_click'); open(); });
  screen.append(el);
  track(el, account.subscribe((a) => {
    el.dataset.state = a.status;
    el.querySelector('.zva-tchip__av').innerHTML = avatarSVG(a.status === 'user' ? a.user : null);
    el.querySelector('.zva-tchip__label').textContent = a.status === 'user' ? a.user.displayName : t('chip.signIn');
    el.setAttribute('aria-label', a.status === 'user' ? `${a.user.displayName} — ${t('chip.open')}` : t('chip.signIn'));
  }));
}

// ------------------------------------------------------------------------------------- screen tracking
function syncScreens(ui) {
  sweep();
  const visible = account.status !== 'unavailable';
  const main = ui.querySelector('.iw-screen.iw-main:not(.is-leaving)');
  const title = ui.querySelector('.iw-screen.iw-title:not(.is-leaving)');
  if (visible && main) mountMainCard(main);
  if (visible && title) mountTitlePill(title);
  if (!visible) { for (const el of ui.querySelectorAll('.zva-chip, .zva-tchip')) el.remove(); sweep(); }
}

function watchMenus() {
  const attach = (ui) => {
    const sync = () => syncScreens(ui);
    new MutationObserver(sync).observe(ui, { attributes: true, attributeFilter: ['data-screen'], subtree: false });
    new MutationObserver(sync).observe(ui.querySelector('.iw-ui__layer') || ui, { childList: true });
    account.subscribe(sync);
  };
  const ui = document.querySelector('.iw-ui');
  if (ui) { attach(ui); return; }
  const wait = new MutationObserver(() => {
    const found = document.querySelector('.iw-ui');
    if (found) { wait.disconnect(); attach(found); }
  });
  wait.observe(document.getElementById('ui-root') || document.body, { childList: true, subtree: true });
}

function start() {
  const style = document.createElement('style');
  style.id = 'zva-chip-style';
  style.textContent = chipCss;
  document.head.append(style);
  account.watch();
  watchMenus();
  window.zevantAccount = Object.freeze({
    open: (view) => open(view),
    close: () => openPanel?.close(),
    get status() { return account.status; },
    get user() { return account.user ? { ...account.user } : null; },
    subscribe: (fn) => account.subscribe((a) => fn({ status: a.status, user: a.user ? { ...a.user } : null })),
    refresh: () => account.refresh().then(() => account.user),
  });
}

// Warm the dialog chunk once the main menu is up (never during the game's own loading), so opening is instant.
let warmed = false;
function warmPanel() {
  if (warmed) return;
  warmed = true;
  setTimeout(() => loadPanel().catch(() => { warmed = false; }), 1500);
}

if (!window.zevantAccount) start();
