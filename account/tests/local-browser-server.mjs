/** Local integration fixture, never deployed. Executes the real account Worker
 * against SQLite, and serves unchanged browser modules with only Vite's two
 * source transforms (?inline CSS and the API-base constant). It does NOT
 * pretend to be a Vite production build or the full game.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { createD1 } from './d1-fake.mjs';
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const digest = body => createHash('sha256').update(body).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function createBrowserServer({ root = workspace, port = 0 } = {}) {
  root = path.resolve(root);
  const worker = (await import(pathToFileURL(path.join(root, 'account/worker/index.js')).href)).default;
  const DB = createD1(path.join(root, 'account/migrations'));
  const env = { DB, PBKDF2_ITERATIONS: '1000' };
  const controlToken = randomBytes(24).toString('hex');
  const traffic = [], responses = [], faults = new Map(), swCases = new Map();
  let activeApi = 0, maxActiveApi = 0;
  let origin;
  const fixtureHtml = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>INKWAVE account source integration</title><style>body{background:#15121c;color:white;font:16px system-ui;margin:24px}.iw-ui{--u:12px;--a:#ff8a14;--a-rgb:255,138,20;--a-ink:#15121c}.iw-main__side{max-width:390px}.iw-panel{background:#2a2240;border-radius:18px}</style>
<main class="iw-ui" data-screen="main"><div class="iw-ui__layer"><section class="iw-screen iw-main"><h1>Account integration fixture</h1><div class="iw-main__side"><div class="iw-profile"><b class="iw-profile__name">Player</b></div></div></section></div></main>
<script type="module">import {account} from '/account/client/src/store.js';import {api} from '/account/client/src/api.js';window.__qa={account,api};await import('/account/client/src/entry.js');</script></html>`;
  function swBuild(name, version) {
    const revision = digest('INKWAVE-native-browser-fixture:' + name + ':' + version);
    const bodies = {
      'main.js': `globalThis.fixtureVersion=${JSON.stringify(version)};document.body.dataset.version=${JSON.stringify(version)};`,
      'shared.json': '{"shared":true}',
      'lazy.json': JSON.stringify({ version, lazy: true }),
      'large.bin': 'safe',
    };
    const index = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Native SW fixture ${version}</title><body><h1>${version}</h1><script type="module" src="./_versions/${revision}/main.js"></script><script>window.registrationPromise=navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});registrationPromise.catch(()=>{});</script></body></html>`;
    const assets = Object.fromEntries(Object.entries(bodies).map(([rel, body]) => [rel, [Buffer.byteLength(body), digest(body)]]));
    return { version, revision, bodies, index, config: { schema: 1, revision, assets, index: { bytes: Buffer.byteLength(index), sha256: digest(index) }, precache: ['main.js','shared.json'], declaredBytes: Buffer.byteLength(index) + Object.values(assets).reduce((sum, item) => sum + item[0], 0) } };
  }
  function ensureCase(name) {
    if (!swCases.has(name)) swCases.set(name, { builds: new Map(), version: 'A', corrupt: false, sentChunks: 0, cancelledStreams: 0, oversize: false });
    const item = swCases.get(name);
    if (!item.builds.has(item.version)) item.builds.set(item.version, swBuild(name, item.version));
    return item;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
      if (url.pathname.startsWith('/__test/')) {
        if (req.headers['x-test-control'] !== controlToken) return send(403, 'application/json', '{"error":"test_control_only"}');
        if (url.pathname === '/__test/state') return send(200, 'application/json', JSON.stringify({ traffic, responses, activeApi, maxActiveApi,
          sw: Object.fromEntries([...swCases].map(([name, item]) => [name, { version: item.version, sentChunks: item.sentChunks, cancelledStreams: item.cancelledStreams,
            revision: ensureCase(name).builds.get(item.version).revision }])) }));
        if (req.method !== 'POST') return send(405, 'application/json', '{}');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)return send(413,'application/json','{}');chunks.push(chunk);}
        const control = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        if (control.resetDatabase) DB.raw.exec('DELETE FROM sessions; DELETE FROM users; DELETE FROM auth_throttle;');
        if (control.resetTraffic) { traffic.length = 0; responses.length = 0; maxActiveApi = activeApi; }
        if (control.fault) faults.set(control.fault.path, { ...control.fault });
        if (control.clearFaults) faults.clear();
        if (control.sw) {
          const item = ensureCase(control.sw.name);
          Object.assign(item, { ...control.sw, builds: item.builds }); ensureCase(control.sw.name);
        }
        return send(200, 'application/json', '{"ok":true}');
      }
      if (url.pathname.startsWith('/api/')) {
        const id = traffic.length;
        traffic.push({ id, path: url.pathname, method: req.method, at: Date.now() });
        activeApi++; maxActiveApi = Math.max(maxActiveApi, activeApi);
        const fault = faults.get(url.pathname);
        if (fault?.once) faults.delete(url.pathname);
        try {
          if (fault?.delay) await sleep(Math.min(fault.delay, 5000));
          if (fault?.mode === 'before') { req.socket.destroy(); return; }
          if (fault?.mode === 'unauthorized') {
            if (fault.bodyDelay) await sleep(Math.min(fault.bodyDelay, 20000));
            send(401, 'application/json', JSON.stringify({ error: { code: 'not_signed_in' } })); return;
          }
          const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value != null) headers.set(key, Array.isArray(value) ? value.join(',') : value);
          const ctl = new AbortController(); req.once('aborted', () => ctl.abort());
          const init = { method: req.method, headers, signal: ctl.signal };
          if (!['GET','HEAD'].includes(req.method)) Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' });
          const response = await worker.fetch(new Request(url.href, init), env);
          if (fault?.mode === 'after') { req.socket.destroy(); return; }
          if (fault?.headerDelay) await sleep(Math.min(fault.headerDelay, 5000));
          const outHeaders = Object.fromEntries(response.headers);
          res.writeHead(response.status, outHeaders);
          responses.push({ id, path: url.pathname, status: response.status, at: Date.now(), setCookie: response.headers.has('Set-Cookie') });
          if (!response.body) return res.end();
          const reader = response.body.getReader();
          res.once('close', () => { if (!res.writableEnded) { ctl.abort(); void reader.cancel().catch(() => {}); } });
          if (fault?.bodyDelay) { res.flushHeaders(); await sleep(Math.min(fault.bodyDelay, 20000)); }
          while (!res.destroyed) { const chunk = await reader.read(); if (chunk.done) break; if (!res.write(chunk.value)) await once(res, 'drain'); }
          reader.releaseLock(); res.end();
        } finally { activeApi--; }
        return;
      }
      if (url.pathname === '/' || url.pathname === '/account-harness') return send(200, 'text/html; charset=utf-8', fixtureHtml);
      if (url.pathname === '/control.html') return send(200, 'text/html', '<!doctype html><title>Native fixture control</title>');
      if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const sw = /^\/swcheck\/([a-z0-9-]+)\/(.*)$/.exec(url.pathname);
      if (sw) {
        const [, name, rel] = sw, item = ensureCase(name), build = item.builds.get(item.version);
        if (rel === '' || rel === 'index.html') return send(200, 'text/html', build.index);
        if (rel === 'sw.js') {
          let source = await fs.readFile(path.join(root, 'patches/loading-cache/sw.js'), 'utf8');
          source = source.replace('/*__INKWAVE_CACHE_BUILD__*/ null', JSON.stringify(build.config));
          return send(200, 'application/javascript', source);
        }
        const asset = /^_versions\/([a-f0-9]{64})\/(.+)$/.exec(rel);
        if (asset) {
          const target = [...item.builds.values()].find(b => b.revision === asset[1]);
          if (!target || !Object.hasOwn(target.bodies, asset[2])) return send(404, 'text/plain', 'missing asset');
          if (asset[2] === 'large.bin' && item.oversize) {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
            let n = 0;
            const timer = setInterval(() => {
              item.sentChunks++; res.write(Buffer.alloc(4096, 65));
              if (++n === 100) { clearInterval(timer); res.end(); }
            }, 10);
            res.once('close', () => { clearInterval(timer); if (n < 100) item.cancelledStreams++; });
            return;
          }
          const body = item.corrupt && target === build && asset[2] === 'main.js' ? 'BROKEN' : target.bodies[asset[2]];
          return send(200, asset[2].endsWith('.js') ? 'application/javascript' : 'application/json', body);
        }
        return send(404, 'text/plain', 'fixture missing');
      }
      if (!/^\/account\/(client\/src|shared)\//.test(url.pathname)) return send(404, 'text/plain', 'not found');
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!['account/client/src', 'account/shared'].some(dir => file.startsWith(path.join(root, dir) + path.sep)) || !/\.(?:js|css)$/.test(file)) return send(403, 'text/plain', 'invalid path');
      let source = await fs.readFile(file, 'utf8');
      if (url.searchParams.has('inline') && file.endsWith('.css')) source = 'export default ' + JSON.stringify(source) + ';';
      else if (file.endsWith('/api.js')) source = source.replace('import.meta.env.VITE_ACCOUNT_API', "''");
      return send(200, 'application/javascript; charset=utf-8', source);
    } catch (error) {
      console.error('[local-acceptance]', error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      if (!res.destroyed) res.end('fixture error');
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, controlToken, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => { DB.raw.close(); resolve(); }); }) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await createBrowserServer({ root: process.env.INKWAVE_ACCEPTANCE_ROOT || workspace });
  console.log(JSON.stringify({ origin: fixture.origin, controlToken: fixture.controlToken }));
  const done = () => fixture.close().then(() => process.exit(0));
  process.once('SIGTERM', done); process.once('SIGINT', done);
}
