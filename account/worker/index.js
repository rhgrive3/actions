// ZEVANT web Worker: the account API under /api/, the built game (dist/) for everything else.
// Static files are served by Workers Static Assets; wrangler.toml routes only /api/* through this code.
import { handleAccount } from './account.js';
import { ApiError, json, errorResponse, corsHeaders } from './http.js';
import { purgeExpired } from './store.js';

const withHeaders = (response, headers) => {
  if (!Object.keys(headers).length) return response;
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }
    const cors = corsHeaders(request, env, url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Cache-Control': 'no-store' } });
    let response;
    try {
      if (url.pathname === '/api/health') response = json(200, { status: 'ok', service: 'zevant-account' });
      else if (url.pathname.startsWith('/api/account/') || url.pathname === '/api/account') response = await handleAccount(request, env, url);
      else throw new ApiError(404, 'not_found');
    } catch (err) {
      if (err instanceof ApiError) response = errorResponse(err);
      else {
        console.error('[account]', err);
        response = errorResponse(new ApiError(500, 'server_error'));
      }
    }
    return withHeaders(response, cors);
  },

  // Daily cron (wrangler.toml [triggers]): drop expired sessions and idle throttle rows.
  async scheduled(event, env, ctx) {
    if (env.DB) ctx.waitUntil(purgeExpired(env.DB, Date.now(), 2 * 24 * 60 * 60 * 1000));
  },
};
