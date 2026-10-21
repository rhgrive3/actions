// Native browser regression: a warm, controlled app whose old module tree was
// removed by deployment. Fixture modules isolate recovery from WebGL/GPU work;
// the full game remains covered by check-inkwave-startup-browser.mjs in CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium, webkit } from 'playwright';

const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const shell = read('patches/loading-cache/shell.html').replace('/*__INKWAVE_STARTUP_RECOVERY__*/', read('patches/loading-cache/recovery.js'));
const startup = read('patches/loading-cache/runtime/startup.mjs');
const worker = read('patches/loading-cache/sw.js');
const entry = 'patches/loading-cache/runtime/startup.mjs';
const bootstrapPath = 'patches/splatoon3/bootstrap.mjs';
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const html = revision => `<!doctype html><html><head><base href="./_versions/${revision}/"></head><body>${shell}<div id="ui-root"></div><div id="boot-error"></div><script type="module" src="./${entry}"></script></body></html>`;
const ready = `document.getElementById('ui-root').innerHTML='<div class="iw-ui" data-screen="title"></div>';globalThis.__inkwaveStartup.engineReady({bootMs:1});globalThis.fixtureReady=true;`;

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  for (const scenario of ['entry-missing', 'entry-syntax', 'late-import', 'permanent-failure']) {
    test(`${name}: warm app recovers ${scenario} without losing settings or looping`, { timeout: 60000 }, async t => {
      const receipts = [];
      const bHTML = html(B);
      const bodies = { [entry]: startup, [bootstrapPath]: scenario === 'permanent-failure'
        ? `await import('./missing.mjs');` : ready };
      const assets = Object.fromEntries(Object.entries(bodies).map(([file, text]) => [file, [Buffer.byteLength(text), hash(text)]]));
      const config = { revision: B, assets, precache: Object.keys(assets),
        index: { bytes: Buffer.byteLength(bHTML), sha256: hash(bHTML) },
        declaredBytes: Buffer.byteLength(bHTML) + Object.values(assets).reduce((sum, item) => sum + item[0], 0) };
      const oldHTML = html(A);
      // The legacy controller retains stale HTML. It does not understand the
      // new worker's code or skipWaiting messages; retry must work regardless.
      const legacy = `self.addEventListener('install',e=>e.waitUntil(caches.open('inkwave-shell-v1').then(c=>c.put('/actions/',new Response(${JSON.stringify(oldHTML)},{headers:{'content-type':'text/html'}})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'&&!new URL(e.request.url).searchParams.has('__iw_recover'))e.respondWith(caches.open('inkwave-shell-v1').then(c=>c.match('/actions/')));});`;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        receipts.push({ path: url.pathname, query: url.search });
        let body, type = 'text/javascript';
        if (url.pathname === '/actions/seed.html') { body = '<!doctype html><title>seed</title>'; type = 'text/html'; }
        else if (url.pathname === '/actions/legacy-sw.js') body = legacy;
        else if (url.pathname === '/actions/sw.js') body = worker.replace('/*__INKWAVE_CACHE_BUILD__*/ null', JSON.stringify(config));
        else if (url.pathname === '/actions/' || url.pathname === '/actions/index.html') { body = bHTML; type = 'text/html'; }
        else if (url.pathname === `/actions/_versions/${B}/${entry}`) body = bodies[entry];
        else if (url.pathname === `/actions/_versions/${B}/${bootstrapPath}`) body = bodies[bootstrapPath];
        else if (scenario === 'entry-syntax' && url.pathname === `/actions/_versions/${A}/${entry}`) body = 'export const =;';
        else if (scenario !== 'entry-missing' && url.pathname === `/actions/_versions/${A}/${entry}`) body = startup;
        else if (scenario !== 'entry-missing' && url.pathname === `/actions/_versions/${A}/${bootstrapPath}`) {
          // Reproduce Game.boot().catch calling bootFailed after the initial
          // bootstrap import has resolved, beyond startup's import catch.
          body = `setTimeout(()=>import('./missing.mjs').catch(error=>globalThis.__inkwaveStartup.bootFailed(error)),50);`;
        }
        if (body === undefined) { res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('removed deployment'); }
        else { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
      const base = `http://127.0.0.1:${server.address().port}/actions/`;
      const profile = fs.mkdtempSync(path.resolve('.ci-scratch/update-recovery-' + name + '-'));
      const context = await engine.launchPersistentContext(profile, {
        headless: true, viewport: { width: 390, height: 844 },
        ...(name === 'chromium' ? {
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
          args: ['--no-sandbox', '--disable-dev-shm-usage']
        } : {})
      });
      t.after(() => context.close());
      t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
      const page = context.pages()[0];
      await page.goto(base + 'seed.html');
      await page.evaluate(async () => {
        localStorage.setItem('inkwave.settings', '{"sensitivity":3}');
        const neighbor = await caches.open('neighbor-app'); await neighbor.put('/neighbor/data', new Response('keep'));
        await navigator.serviceWorker.register('./legacy-sw.js', { scope: './' });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      });
      await page.goto(base + '?map=tidewater#play');
      if (scenario === 'permanent-failure') {
        await page.waitForFunction(() => new URL(location.href).searchParams.has('__iw_recover') && !document.getElementById('inkwave-startup-retry').hidden);
        // Give a second automatic recovery enough time to occur if the guard broke.
        await page.waitForTimeout(2000);
        assert.equal(receipts.filter(row => row.path === '/actions/' && row.query.includes('__iw_recover')).length, 1);
      } else {
        await page.waitForFunction(() => globalThis.fixtureReady === true);
        assert.equal(new URL(page.url()).searchParams.get('map'), 'tidewater');
        assert.equal(new URL(page.url()).searchParams.has('__iw_recover'), false);
        assert.equal(new URL(page.url()).hash, '#play');
        assert.equal(await page.locator('#inkwave-startup-shell').isVisible(), false);
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('inkwave.settings')), '{"sensitivity":3}');
      assert.equal(await page.evaluate(async () => (await (await caches.open('neighbor-app')).match('/neighbor/data')).text()), 'keep');
      assert(receipts.some(row => row.path === '/actions/sw.js'), 'failure updates the worker before reaching a menu');
      assert.equal(receipts.filter(row => row.path === '/actions/' && row.query.includes('__iw_recover')).length, 1);
      assert(receipts.every(row => !row.path.includes('_versions/') || !row.query.includes('__iw_recover')), 'module URLs retain immutable identity');
    });
  }
}
