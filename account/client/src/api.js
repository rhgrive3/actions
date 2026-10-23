// Account API client. Same-origin by default (the Worker serves the game and /api/account);
// VITE_ACCOUNT_API at build time points it elsewhere (that origin must list the game in ALLOWED_ORIGINS).

const BASE = String(import.meta.env.VITE_ACCOUNT_API || '/api/account').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;

export class AccountError extends Error {
  constructor(code, { status = 0, field = null, retryAfter = 0 } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}

export async function request(method, path, body) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AccountError('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      cache: 'no-store',
      signal: ctl.signal,
      headers: body === undefined ? { 'X-Zevant-Request': '1' } : { 'Content-Type': 'application/json', 'X-Zevant-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new AccountError(e?.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
  if (res.status === 204) return null;
  let data = null;
  if ((res.headers.get('Content-Type') || '').includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  }
  if (res.ok && data) return data;
  const err = data?.error;
  if (err?.code) throw new AccountError(err.code, { status: res.status, field: err.field || null, retryAfter: err.retryAfter || Number(res.headers.get('Retry-After')) || 0 });
  // a 404/HTML answer means this host has no account API (e.g. a static-only deployment)
  throw new AccountError(res.status === 404 || res.status === 405 ? 'unavailable' : 'unknown', { status: res.status });
}

export const api = {
  config: () => request('GET', '/config'),
  session: () => request('GET', '/session'),
  login: (b) => request('POST', '/login', b),
  register: (b) => request('POST', '/register', b),
  logout: () => request('POST', '/logout', {}),
  sessions: () => request('GET', '/sessions'),
  revoke: (b) => request('POST', '/sessions/revoke', b),
  rename: (displayName) => request('PATCH', '/profile', { displayName }),
  profile: (patch) => request('PATCH', '/profile', patch),
  password: (b) => request('POST', '/password', b),
  remove: (b) => request('POST', '/delete', b),
};
