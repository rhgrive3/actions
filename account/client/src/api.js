// Account API client. Same-origin by default (the Worker serves the game and /api/account);
// VITE_ACCOUNT_API at build time points it elsewhere (that origin must list the game in ALLOWED_ORIGINS).

const BASE = String(import.meta.env.VITE_ACCOUNT_API || '/api/account').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;

// Cookie updates belong to the whole response, including its body. The lock
// covers all session-bearing requests, not just login/logout, because even a
// session read can renew or clear an HttpOnly cookie. Never retry a mutation
// outside the lock when the lock provider rejects it.
const SESSION_CHANNEL = 'zevant-account-session-v1:' + BASE;
let localFlight = Promise.resolve();
let sessionChannel = null;
let storageListener = null;
const sessionListeners = new Set();
const isSessionNotice = value => value?.type === 'changed' && value.version === 1;
function dispatchSessionNotice(value) {
  if (!isSessionNotice(value)) return;
  for (const listener of sessionListeners) {
    try { listener(); } catch (error) { console.error('[account]', error); }
  }
}
function notifySessionChange() {
  // No user identity, password, CSRF value or session token crosses tabs.
  const notice = { type: 'changed', version: 1 };
  let temporary;
  try {
    const channel = sessionChannel || (typeof BroadcastChannel === 'function'
      ? (temporary = new BroadcastChannel(SESSION_CHANNEL)) : null);
    if (channel) { channel.postMessage(notice); return; }
  } catch { /* storage notification remains available in some private modes */ }
  finally { try { temporary?.close(); } catch { /* notifications never change an API outcome */ } }
  try {
    // Removing immediately avoids retaining account state. Separate writes
    // always emit a storage event, even for consecutive identical notices.
    localStorage.setItem(SESSION_CHANNEL, JSON.stringify(notice));
    localStorage.removeItem(SESSION_CHANNEL);
  } catch { /* blocked storage: focus/online revalidation remains available */ }
}
function onSessionChange(listener) {
  if (typeof listener !== 'function') throw new TypeError('Expected a session listener');
  sessionListeners.add(listener);
  if (!sessionChannel && typeof BroadcastChannel === 'function') {
    try {
      sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
      sessionChannel.onmessage = event => dispatchSessionNotice(event.data);
    } catch { sessionChannel = null; }
  }
  if (!storageListener && typeof addEventListener === 'function') {
    storageListener = event => {
      if (event.key !== SESSION_CHANNEL || !event.newValue) return;
      try { dispatchSessionNotice(JSON.parse(event.newValue)); } catch { /* unrelated/malformed storage */ }
    };
    addEventListener('storage', storageListener);
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    sessionListeners.delete(listener);
    if (sessionListeners.size) return;
    try { sessionChannel?.close(); } catch { /* best-effort listener disposal */ }
    sessionChannel = null;
    if (storageListener) {
      removeEventListener('storage', storageListener);
      storageListener = null;
    }
  };
}
function withSessionLock(signal, run) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(SESSION_CHANNEL, { mode: 'exclusive', signal }, run);
  }
  // Older/embedded browsers still serialize this tab. Cross-tab correctness
  // additionally relies on server-side conditional commits and revalidation;
  // a localStorage lease is deliberately not used as an unsafe mutex.
  const previous = localFlight;
  const current = previous.catch(() => {}).then(() => {
    if (signal.aborted) throw signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' });
    return run();
  });
  localFlight = current.catch(() => {});
  // A queued caller must settle at its deadline, not wait for the predecessor.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', abort, { once: true });
    current.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

export class AccountError extends Error {
  constructor(code, { status = 0, field = null, retryAfter = 0 } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}

export async function request(method, path, body, { signal } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AccountError('offline');
  if (signal?.aborted) throw new AccountError('cancelled');
  const ctl = new AbortController();
  let callerCancelled = false;
  const cancel = () => { if (!ctl.signal.aborted) { callerCancelled = true; ctl.abort(); } };
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let dispatched = false;
  try {
    const perform = async () => {
      if (ctl.signal.aborted) throw ctl.signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' });
      dispatched = true;
      const res = await fetch(BASE + path, {
        method,
        credentials: 'include',
        cache: 'no-store',
        signal: ctl.signal,
        headers: body === undefined ? { 'X-Zevant-Request': '1' } : { 'Content-Type': 'application/json', 'X-Zevant-Request': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 204) return null;
      let data = null;
      if ((res.headers.get('Content-Type') || '').includes('application/json')) {
        try { data = await res.json(); }
        catch (error) {
          // The same deadline owns headers AND body. A stalled/aborted body
          // must release the form and pending session refresh as a timeout.
          if (error?.name !== 'SyntaxError') throw error;
        }
      }
      if (res.ok && data) return data;
      const err = data?.error;
      if (err?.code) throw new AccountError(err.code, { status: res.status, field: err.field || null, retryAfter: err.retryAfter || Number(res.headers.get('Retry-After')) || 0 });
      // a 404/HTML answer means this host has no account API (e.g. a static-only deployment)
      throw new AccountError(res.status === 404 || res.status === 405 ? 'unavailable' : 'unknown', { status: res.status });
    };
    // Config neither reads nor writes the session cookie and need not queue.
    return await (path === '/config' ? perform() : withSessionLock(ctl.signal, perform));
  } catch (e) {
    if (e instanceof AccountError) throw e;
    throw new AccountError(callerCancelled ? 'cancelled' : ctl.signal.aborted || e?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
    // A lost response can still have committed on the server. Notify, but do
    // not replay it or claim that an unsuccessful logout succeeded.
    if (dispatched && method !== 'GET' && method !== 'HEAD') notifySessionChange();
  }
}

const accountIntent = (body, expectedUserId) => expectedUserId === undefined ? body : { ...body, expectedUserId };

export const api = {
  onSessionChange,
  config: () => request('GET', '/config'),
  session: (options) => request('GET', '/session', undefined, options),
  login: (b) => request('POST', '/login', b),
  register: (b) => request('POST', '/register', b),
  logout: () => request('POST', '/logout', {}),
  sessions: (options = {}) => request('GET', '/sessions' + (options.expectedUserId === undefined ? '' : '?expectedUserId=' + encodeURIComponent(options.expectedUserId)), undefined, options),
  revoke: (b, expectedUserId) => request('POST', '/sessions/revoke', accountIntent(b, expectedUserId)),
  rename: (displayName, expectedUserId) => request('PATCH', '/profile', accountIntent({ displayName }, expectedUserId)),
  profile: (patch, expectedUserId) => request('PATCH', '/profile', accountIntent(patch, expectedUserId)),
  password: (b, expectedUserId) => request('POST', '/password', accountIntent(b, expectedUserId)),
  remove: (b, expectedUserId) => request('POST', '/delete', accountIntent(b, expectedUserId)),
};
