// Optional real-browser policy check; run from the repository root.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { chromium } from 'playwright';
import { writeWorkersAssetPolicy } from '../dev/vite-plugins.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zevant-assets-browser-'));
const put = (p, bytes) => fs.writeFileSync(path.join(directory, p), bytes);
put('probe.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');
put('probe.js', 'window.probeLoaded = true;');
put('index.html', `<!doctype html><title>Official fixture</title>
<img src="/probe.svg" onload="window.imageLoaded = true" onerror="window.imageFailed = true">
<script src="/probe.js" onerror="window.scriptFailed = true"></script>`);
put('sw.js', `self.addEventListener('install', e => e.waitUntil(caches.open('fixture').then(c => c.addAll(['/', '/probe.svg', '/probe.js'])).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));`);
writeWorkersAssetPolicy(directory);
const mf = new Miniflare(convertV4MiniflareOptions({ name: 'fixture', modules: true,
  script: 'export default { fetch(r, env) { return env.ASSETS.fetch(r); } };',
  compatibilityDate: '2026-09-01', assets: { directory, binding: 'ASSETS', routerConfig: { has_user_worker: true },
    assetConfig: { not_found_handling: 'none' } } }));
let browser, foreign;
try {
  const origin = (await mf.ready).origin;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const official = await context.newPage();
  await official.goto(origin);
  await official.waitForFunction(() => window.imageLoaded && window.probeLoaded);
  await official.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
  });
  await context.setOffline(true);
  await official.reload();
  await official.waitForFunction(() => window.imageLoaded && window.probeLoaded);
  await context.setOffline(false);
  foreign = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>External fixture</title><img src="${origin}/probe.svg" onload="window.imageLoaded=true" onerror="window.imageFailed=true">
<script src="${origin}/probe.js" onerror="window.scriptFailed=true"></script><iframe src="${origin}/"></iframe>`);
  });
  await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve));
  const externalContext = await browser.newContext();
  const external = await externalContext.newPage();
  const messages = [], failures = [];
  external.on('console', m => messages.push(m.text()));
  external.on('requestfailed', r => failures.push({ url: r.url(), error: r.failure().errorText }));
  await external.goto(`http://127.0.0.1:${foreign.address().port}`);
  await external.waitForFunction(() => window.imageFailed && window.scriptFailed);
  assert.equal(await external.evaluate(() => !!window.probeLoaded), false);
  assert(messages.some(m => m.includes('frame-ancestors')), messages.join('\n'));
  const result = { browser: browser.version(), sameOrigin: 'PASS: image + script',
    offline: 'PASS: service-worker cached document + image + script',
    crossOrigin: 'PASS: image + classic script blocked by CORP',
    iframe: 'PASS: refused by frame-ancestors', failures, messages };
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  if (foreign) await new Promise(resolve => foreign.close(resolve));
  await mf.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
