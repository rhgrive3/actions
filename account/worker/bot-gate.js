// Optional edge entry gate for ZEVANT/INKWAVE static game assets.
// Configure BOT_GATE_ENABLED, BOT_GATE_HMAC_KEY and Turnstile keys before enabling.
// This is bot deterrence, not DRM: an authorized browser can save received bytes.
const ACCESS_PAGE = '/__inkwave-access';
const VERIFY_PATH = '/__inkwave-access/verify';
const COOKIE_NAME = '__Host-inkwave-access';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 2048;
const enc = new TextEncoder();

const textResponse = (body, status, extra = {}) => new Response(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  },
});
const b64url = data => btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = value => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  } catch { return null; }
};
const signingKey = secret => crypto.subtle.importKey(
  'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
);

export async function mintGameGateCookie(host, secret, now = Date.now()) {
  const expires = now + SESSION_MS;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = String(expires) + '.' + nonce;
  const mac = await crypto.subtle.sign('HMAC', await signingKey(secret), enc.encode(host + ':' + body));
  return body + '.' + b64url(new Uint8Array(mac));
}

export async function verifyGameGateCookie(cookie, host, secret, now = Date.now()) {
  if (typeof cookie !== 'string' || cookie.length > 256) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[1])) return false;
  const expires = Number(parts[0]);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_MS) return false;
  const signature = fromB64url(parts[2]);
  if (!signature || signature.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await signingKey(secret), signature, enc.encode(host + ':' + parts[0] + '.' + parts[1]));
}

const cookieFromRequest = request => {
  const cookies = (request.headers.get('Cookie') || '').split(';');
  return cookies.map(value => value.trim()).find(value => value.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1) || '';
};
const safeSiteKey = value => typeof value === 'string' && /^[A-Za-z0-9._-]{10,128}$/.test(value);

function challengeHtml(key) {
  // The site key is public, but validate its character set before embedding in HTML.
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>INKWAVE 接続確認</title>' +
    '<style>body{font:16px system-ui,sans-serif;background:#111827;color:white;min-height:100vh;display:grid;place-items:center;margin:0}' +
    'main{max-width:480px;padding:32px;border-radius:18px;background:#1f2937;text-align:center}' +
    'button{padding:12px 24px;border:0;border-radius:8px;font:inherit;margin-top:20px;cursor:pointer}</style></head>' +
    '<body><main><h1>INKWAVE 接続確認</h1><p>自動アクセス対策のため、最初の1回だけ確認します。</p>' +
    '<form action="' + VERIFY_PATH + '" method="post"><div class="cf-turnstile" data-sitekey="' + key +
    '" data-action="inkwave_access"></div><button type="submit">ゲームを開く</button></form>' +
    '</main><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></body></html>';
}

const CHALLENGE_CSP = [
  "default-src 'none'",
  "script-src https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "connect-src https://challenges.cloudflare.com",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

async function verifyTurnstile(token, request, env, host) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.set('remoteip', ip);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const verdict = await response.json();
    // Enforce widget hostname and the specific access action, not just "success".
    return verdict?.success === true && verdict.hostname === host && verdict.action === 'inkwave_access';
  } finally { clearTimeout(timeout); }
}

export async function serveGameWithBotGate(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (env.BOT_GATE_ENABLED !== 'true') {
    if (path === ACCESS_PAGE || path === VERIFY_PATH) return textResponse('Not found', 404);
    return env.ASSETS?.fetch(request) || textResponse('Not found', 404);
  }
  if (!safeSiteKey(env.TURNSTILE_SITE_KEY) || !env.TURNSTILE_SECRET_KEY || !env.BOT_GATE_HMAC_KEY)
    return textResponse('INKWAVE access verification is not configured', 503);

  if (path === ACCESS_PAGE && request.method === 'GET')
    return textResponse(challengeHtml(env.TURNSTILE_SITE_KEY), 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CHALLENGE_CSP,
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });

  if (path === VERIFY_PATH && request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return textResponse('Invalid origin', 403);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))
      return textResponse('Invalid form', 415);
    const declaredLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > 4096) return textResponse('Form too large', 413);
    let token;
    try {
      const form = await request.formData();
      token = form.get('cf-turnstile-response');
    } catch { return textResponse('Invalid form', 400); }
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH)
      return textResponse('Verification required', 403);
    try {
      if (!(await verifyTurnstile(token, request, env, url.hostname)))
        return textResponse('Verification failed. Please reload and retry.', 403);
    } catch {
      return textResponse('Verification temporarily unavailable', 503);
    }
    const cookie = await mintGameGateCookie(url.host, env.BOT_GATE_HMAC_KEY);
    return textResponse(null, 303, {
      'Location': '/',
      'Set-Cookie': COOKIE_NAME + '=' + cookie + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_MS / 1000,
    });
  }

  if (path === ACCESS_PAGE || path === VERIFY_PATH) return textResponse('Method not allowed', 405);
  if (await verifyGameGateCookie(cookieFromRequest(request), url.host, env.BOT_GATE_HMAC_KEY))
    return env.ASSETS?.fetch(request) || textResponse('Not found', 404);

  // Only page navigation redirects; returning HTML to a JS import would create
  // confusing module errors and could poison a cache.
  if ((request.method === 'GET' || request.method === 'HEAD') && (path === '/' || path === '/index.html')) {
    return textResponse(null, 302, { 'Location': ACCESS_PAGE });
  }
  return textResponse(request.method === 'HEAD' ? null : 'Verify access before downloading game assets', 403);
}
