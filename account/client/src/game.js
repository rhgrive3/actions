// Bridge to the running game. The game exposes its context as window.__G once booted; every call here is
// optional so the account UI also works on the dev harness page and never breaks the game if internals move.

const menus = () => window.__G?.menus || null;
const PROFILE_KEY = 'inkwave.profile';

export const game = {
  menus,
  screen() { return document.querySelector('.iw-ui')?.dataset.screen || ''; },

  sfx(name) { try { menus()?._sfx?.(name); } catch { /* audio is optional */ } },

  /** The player's current in-game name (local profile), '' when unset. */
  profileName() {
    try { return String(menus()?.api?.getProfile?.()?.name || JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}').name || ''); }
    catch { return ''; }
  },

  /** Puts the account's player name into the game (menus, online lobby) and the visible profile card. */
  setProfileName(name) {
    const n = String(name || '').slice(0, 16);
    if (!n) return;
    const api = menus()?.api;
    try {
      if (api?.setProfileName) api.setProfileName(n);
      else {
        const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, name: n }));
      }
    } catch { /* storage denied: the menus still show it until reload */ }
    for (const el of document.querySelectorAll('.iw-profile__name')) el.textContent = n;
    try { menus()?._refit?.(); } catch { /* optional */ }
  },

  /** The menus' current accent inks, so the dialog matches the screen behind it. */
  accentVars() {
    const ui = document.querySelector('.iw-ui');
    if (!ui) return {};
    const cs = getComputedStyle(ui), out = {};
    for (const k of ['--a', '--a-rgb', '--a-dark', '--a-light', '--a-ink', '--b', '--b-rgb', '--b-light']) {
      const v = cs.getPropertyValue(k).trim();
      if (v) out[k] = v;
    }
    return out;
  },

  /** Registers an element with the menus' focus/cursor system (keyboard, pad, mouse). Falls back to a click. */
  bindNav(el, id, accept) {
    const m = menus();
    if (m?._bind) {
      try {
        m._fx?.(el);
        m._bind(el, { id, accept: (src) => { m._sfx?.('ui_click'); if (src === 'mouse') m._press?.(el); accept(); } });
        return;
      } catch { /* fall through */ }
    }
    el.addEventListener('click', accept);
  },

  /** While the dialog is open, gamepad navigation goes to `handler` instead of the screen behind it. */
  captureNav(handler) {
    const m = menus();
    if (!m || typeof m.nav !== 'function') return () => {};
    const own = Object.hasOwn(m, 'nav'), original = m.nav;
    const capture = (dir) => { handler(dir); return true; };
    m.nav = capture;
    return () => {
      if (m.nav !== capture) return;
      if (own) m.nav = original; else delete m.nav;
    };
  },

  /** Hides the menus' focus ring (it would otherwise float above the dialog's backdrop). */
  setMenusCovered(on) {
    document.querySelector('.iw-ui')?.classList.toggle('zva-covered', !!on);
  },
};
