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
  _sessionRevision: 0,
  _refreshController: null,
  _sessionMutation: null,
  _queuedRefresh: null,
  _unwatch: null,

  subscribe(fn) { this._subs.add(fn); fn(this); return () => this._subs.delete(fn); },
  _emit() { for (const fn of this._subs) { try { fn(this); } catch (e) { console.error('[account]', e); } } },

  /** Asks the server who is signed in. Network trouble keeps the last known user. */
  refresh() {
    if (this._sessionMutation) {
      if (this._queuedRefresh) return this._queuedRefresh;
      const queued = this._sessionMutation.catch(() => {}).then(() => {
        if (this._queuedRefresh === queued) this._queuedRefresh = null;
        // Another mutation may have joined the queue while this one settled.
        return this.refresh();
      });
      this._queuedRefresh = queued;
      return queued;
    }
    if (this._pending) return this._pending;
    const revision = this._sessionRevision;
    const controller = this._refreshController = new AbortController();
    // Assign the flight before calling the API, including a synchronous
    // failure. Explicit sign-in/out invalidates only this observation.
    const pending = Promise.resolve().then(async () => {
      try {
        if (controller.signal.aborted) return this;
        const { user } = await api.session({ signal: controller.signal });
        if (revision === this._sessionRevision) this._apply(user || null);
      } catch (e) {
        if (revision === this._sessionRevision) {
          if (e instanceof AccountError && e.code === 'unavailable') this.status = 'unavailable';
          else if (!this.user) this.status = 'offline';
          this._emit();
        }
      } finally {
        if (this._pending === pending) {
          this.checkedAt = Date.now();
          this._pending = null;
          this._refreshController = null;
        }
      }
      return this;
    });
    this._pending = pending;
    return pending;
  },

  /** Serialize session-changing calls until their result is applied.
   * Cancel observations before starting the API, and serialize this tab's
   * mutations so a queued refresh cannot overlap either operation.
   */
  mutateSession(run, apply) {
    ++this._sessionRevision;
    const controller = this._refreshController;
    this._refreshController = null;
    this._pending = null;
    controller?.abort();
    const mutation = Promise.resolve(this._sessionMutation).catch(() => {}).then(async () => {
      try {
        const result = await run();
        await apply?.(result);
        return result;
      } catch (error) {
        if (error?.code === 'not_signed_in') this.signedOut();
        else if (error?.code === 'account_changed') this.invalidateSession();
        throw error;
      }
    });
    this._sessionMutation = mutation;
    const release = () => { if (this._sessionMutation === mutation) this._sessionMutation = null; };
    mutation.then(release, release);
    return mutation;
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

  _commitSession(user) {
    ++this._sessionRevision;
    this._refreshController?.abort();
    this._refreshController = null;
    this._pending = null;
    this.checkedAt = Date.now();
    this._apply(user);
  },
  signedIn(user) { this._commitSession(user); },
  signedOut() { this._commitSession(null); },

  setPref(key, value) {
    this.prefs = { ...this.prefs, [key]: value };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* private mode */ }
    if (key === 'syncName' && value && this.user) game.setProfileName(this.user.displayName);
    this._emit();
  },

  /** Own listeners exactly once; teardown is safe to call repeatedly. */
  watch() {
    if (this._unwatch) return this._unwatch;
    const online = () => this.refresh();
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.checkedAt > RECHECK_MS) this.refresh();
    };
    const restored = event => { if (event.persisted) this.invalidateSession(); };
    const unsubscribe = api.onSessionChange?.(() => this.invalidateSession());
    addEventListener('online', online);
    addEventListener('pageshow', restored);
    document.addEventListener('visibilitychange', visible);
    const stop = () => {
      if (this._unwatch !== stop) return;
      this._unwatch = null;
      removeEventListener('online', online);
      removeEventListener('pageshow', restored);
      document.removeEventListener('visibilitychange', visible);
      unsubscribe?.();
    };
    this._unwatch = stop;
    this.refresh();
    return stop;
  },

  /** Another tab changed the cookie. Invalidate observations, never trust a
   * broadcast identity; ask the API again after this tab's mutation queue.
   */
  invalidateSession() {
    ++this._sessionRevision;
    this._refreshController?.abort();
    this._refreshController = null;
    this._pending = null;
    this.checkedAt = 0;
    return this.refresh();
  },
};
