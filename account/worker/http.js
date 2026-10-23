// Response, cookie, origin and body helpers for the account API.

export const MAX_BODY_BYTES = 8 * 1024;
export const CLIENT_HEADER = 'X-Zevant-Request';

export class ApiError extends Error {
  constructor(status, code, extra = {}, headers = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function json(status, body, headers = {}) {
  const h = new Headers({ ...BASE_HEADERS, ...headers });
  if (body === null) return new Response(null, { status, headers: h });
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function errorResponse(err) {
  const headers = { ...err.headers };
  if (err.extra?.retryAfter) headers['Retry-After'] = String(err.extra.retryAfter);
  return json(err.status, { error: { code: err.code, ...err.extra } }, headers);
}

// ------------------------------------------------------------------------------------- origins / CORS
export function allowedOrigins(env, url) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return new Set([url.origin, ...list]);
}

export function corsHeaders(request, env, url) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === url.origin || !allowedOrigins(env, url).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${CLIENT_HEADER}`,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** State-changing requests must come from our own pages: custom header (forces CORS preflight) + Origin allowlist. */
export function assertTrustedMutation(request, env, url) {
  if (request.headers.get(CLIENT_HEADER) !== '1') throw new ApiError(403, 'forbidden');
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins(env, url).has(origin)) throw new ApiError(403, 'forbidden');
}

export async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(type)) throw new ApiError(415, 'unsupported_media_type');
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large');
  let data;
  try { data = JSON.parse(text || '{}'); } catch { throw new ApiError(400, 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'invalid_json');
  return data;
}

/** A string field (or ''), never trusting the client's types. */
export const str = (v, max = 512) => (typeof v === 'string' ? v.slice(0, max) : '');

// ------------------------------------------------------------------------------------- cookies
export function cookieName(url) {
  // __Host- needs Secure; plain http (wrangler dev on a LAN address) gets the unprefixed name.
  return url.protocol === 'https:' ? '__Host-zv_session' : 'zv_session';
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(env, url, value, maxAgeSec) {
  const secure = url.protocol === 'https:';
  let sameSite = ['Strict', 'Lax', 'None'].includes(env.COOKIE_SAMESITE) ? env.COOKIE_SAMESITE : 'Lax';
  if (sameSite === 'None' && !secure) sameSite = 'Lax';
  const parts = [`${cookieName(url)}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`];
  if (secure) parts.push('Secure');
  if (maxAgeSec != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join('; ');
}

export const clearCookie = (env, url) => sessionCookie(env, url, '', 0);
