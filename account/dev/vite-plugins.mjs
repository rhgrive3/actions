// Vite plugins for ZEVANT:
//   accountDevServer() — `vite` (dev): the real account Worker on an in-memory D1 at /api/*, the built game from
//                        _site/ at / with the account UI hot-reloaded from source, and a UI harness at /dev.html.
//   zevantSite()       — `vite build`: after the account bundle is written, builds the patched game into dist/
//                        with that bundle included (scripts/build-inkwave.mjs) and adds Workers cache headers.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.bin': 'application/octet-stream', '.gz': 'application/octet-stream', '.ktx2': 'image/ktx2',
};

function sendFile(res, file) {
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}

/** Maps a URL path into `dir`, refusing anything that escapes it. */
function inside(dir, urlPath) {
  const file = path.join(dir, decodeURIComponent(urlPath));
  return file === dir || file.startsWith(dir + path.sep) ? file : null;
}

async function toWebRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://${req.headers.host || 'localhost'}${req.originalUrl || req.url}`, {
    method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function accountDevServer() {
  let env = null, worker = null;
  const site = path.join(ROOT, '_site');
  const publicSrc = path.join(ROOT, 'inkwave-public');
  return {
    name: 'zevant-account-dev',
    apply: 'serve',
    async configureServer(server) {
      const { createD1 } = await import(pathToFileURL(path.join(ROOT, 'account/tests/d1-fake.mjs')).href);
      worker = (await import(pathToFileURL(path.join(ROOT, 'account/worker/index.js')).href)).default;
      env = { DB: createD1(path.join(ROOT, 'account/migrations')), PBKDF2_ITERATIONS: '20000', REGISTRATION_OPEN: 'true' };
      server.config.logger.info('  ➜  Account API: in-memory D1 at /api/account (resets when the dev server stops)');
      if (!fs.existsSync(path.join(site, 'index.html'))) server.config.logger.warn('  ➜  _site/ not built: run `npm run build` to play the real game at /. The UI harness is at /dev.html');

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.originalUrl || req.url, 'http://localhost');
        try {
          if (url.pathname.startsWith('/api/')) return sendWebResponse(res, await worker.fetch(await toWebRequest(req), env, {}));
          // the game's own stylesheets and fonts for the harness page
          if (url.pathname.startsWith('/game-styles/')) {
            const f = inside(path.join(publicSrc, 'styles'), url.pathname.slice('/game-styles'.length));
            if (f && fs.existsSync(f)) return sendFile(res, f);
          }
          if (url.pathname.startsWith('/assets/fonts/') || url.pathname.startsWith('/assets/stages/')) {
            const f = inside(publicSrc, url.pathname);
            if (f && fs.existsSync(f) && !fs.existsSync(path.join(site, 'index.html'))) return sendFile(res, f);
          }
          if (!fs.existsSync(path.join(site, 'index.html'))) return next();
          // no Service Worker in development: it would cache the game across rebuilds
          if (url.pathname === '/sw.js') { res.statusCode = 404; return res.end(); }
          if (url.pathname === '/' || url.pathname === '/index.html') {
            let html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
            // the game's own scripts resolve through its <base>; only the HMR client and our entry are Vite's
            html = html.replace('</body>', '<script type="module" src="/@vite/client"></script>\n<script type="module" src="/src/entry.js"></script>\n</body>');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            return res.end(html);
          }
          if (url.pathname.startsWith('/_versions/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/patches/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/styles/')) {
            const f = inside(site, url.pathname);
            if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return sendFile(res, f);
          }
        } catch (e) {
          server.config.logger.error(String(e?.stack || e));
          res.statusCode = 500;
          return res.end('dev server error');
        }
        return next();
      });
    },
  };
}

/** Cache rules for Workers Static Assets: revisioned files never change, the entry documents always revalidate. */
export const WORKERS_HEADERS = `# Generated by vite build (account/dev/vite-plugins.mjs). Workers Static Assets header rules.
/_versions/*
  Cache-Control: public, max-age=31536000, immutable
/native-prebuilt/textures/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`;

export function zevantSite({ outDir = 'dist', accountDir }) {
  return {
    name: 'zevant-site',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        if (process.env.ZEVANT_ACCOUNT_ONLY === '1') return;
        const out = path.resolve(ROOT, outDir);
        const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-inkwave.mjs'), 'inkwave-public', out], {
          cwd: ROOT, stdio: 'inherit', env: { ...process.env, INKWAVE_ACCOUNT_BUILD: accountDir },
        });
        if (res.status !== 0) throw new Error(`game build failed (exit ${res.status})`);
        fs.writeFileSync(path.join(out, '_headers'), WORKERS_HEADERS);
        // GitHub Pages marker only; inkwave-build.json stays deployed for source identity checks
        fs.writeFileSync(path.join(out, '.assetsignore'), '.nojekyll\n');
      },
    },
  };
}
