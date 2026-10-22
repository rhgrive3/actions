// Account state shared by the menu chip and the dialog.
//   status: 'loading' | 'guest' | 'user' | 'offline' | 'unavailable'
import { api, AccountError } from './api.js';
import { game } from './game.js';

const PREFS_KEY = 'zevant.account';
const RECHECK_MS = 5 * 60 * 1000;

const readPrefs = () => {
  try { return { syncName: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return { syncName: true }; }
};

export const account = {
  status: 'loading',
  user: null,
  config: null,
  prefs: readPrefs(),
  checkedAt: 0,
  _subs: new Set(),
  _pending: null,

  subscribe(fn) { this._subs.add(fn); fn(this); return () => this._subs.delete(fn); },
  _emit() { for (const fn of this._subs) { try { fn(this); } catch (e) { console.error('[account]', e); } } },

  /** Asks the server who is signed in. Network trouble keeps the last known user. */
  refresh() {
    if (this._pending) return this._pending;
    this._pending = (async () => {
      try {
        const { user } = await api.session();
        this._apply(user || null);
      } catch (e) {
        if (e instanceof AccountError && e.code === 'unavailable') this.status = 'unavailable';
        else if (!this.user) this.status = 'offline';
        this._emit();
      } finally {
        this.checkedAt = Date.now();
        this._pending = null;
      }
      return this;
    })();
    return this._pending;
  },

  async loadConfig() {
    if (!this.config) {
      try { this.config = await api.config(); } catch { this.config = { registrationOpen: true, turnstileSiteKey: '' }; }
    }
    return this.config;
  },

  /** Called with the user from any successful API answer (or null after sign-out). */
  _apply(user) {
    const was = this.user?.displayName;
    this.user = user;
    this.status = user ? 'user' : 'guest';
    if (user && this.prefs.syncName && user.displayName !== was) game.setProfileName(user.displayName);
    this._emit();
  },

  signedIn(user) { this._apply(user); },
  signedOut() { this._apply(null); },

  setPref(key, value) {
    this.prefs = { ...this.prefs, [key]: value };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* private mode */ }
    if (key === 'syncName' && value && this.user) game.setProfileName(this.user.displayName);
    this._emit();
  },

  /** Background checks: on start, when the connection returns, and when the tab comes back after a while. */
  watch() {
    this.refresh();
    addEventListener('online', () => this.refresh());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.checkedAt > RECHECK_MS) this.refresh();
    });
  },
};
