#!/usr/bin/env node
// Full emitted game: all eight opening actors, intro wait and supported landing.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertOpeningSpawnAtRate } from './lib/inkwave-opening-spawn-contract.mjs';
const site = path.resolve(process.argv[2] || '_site');
const out = path.resolve(process.argv[3] || '.browser-evidence/opening-spawn');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(site, '.' + (rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(site + '/') || !fs.statSync(file).isFile()) throw Error('Missing');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const result = { status: 'running', contentHash: manifest.contentHash, revision: manifest.build.revision,
  conditions: 'Production emitted game, real Actor collision, controlled neutral bot intent; Chromium SwiftShader; no retail hardware comparison', rates: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', error => result.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: true, musicVolume: 0, audioVolume: 0 })));
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { globalThis.openingContext = await import(new URL('src/core/ctx.js', document.baseURI)); globalThis.openingG = openingContext.G; globalThis.openingIntroFrames = (await import(new URL('patches/splatoon3/runtime/turf-intro-camera.mjs', document.baseURI))).TURF_INTRO_FRAMES.go; });
  await page.waitForFunction(() => openingG.game?.menus && openingG.mode !== 'boot' || document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  for (const hz of [30, 60, 120]) {
    const proof = await page.evaluate(assertOpeningSpawnAtRate, hz);
    assert.equal(proof.initial.length, 8);
    assert.equal(proof.initial.filter(a => a.bot).length, 7);
    result.rates.push(proof);
  }
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  result.status = 'passed';
  console.log(JSON.stringify({ status: result.status, rates: result.rates.map(r => r.hz), actors: 8 }));
} catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
finally {
  fs.writeFileSync(path.join(out, 'opening-spawn.json'), JSON.stringify(result, null, 2) + '\n');
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
