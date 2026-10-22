#!/usr/bin/env node
// Full emitted game: all eight opening actors, intro wait and supported landing.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
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
  await page.evaluate(async () => { globalThis.openingG = (await import(new URL('src/core/ctx.js', document.baseURI))).G; });
  await page.waitForFunction(() => openingG.game?.menus && openingG.mode !== 'boot' || document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  for (const hz of [30, 60, 120]) {
    const proof = await page.evaluate(async hz => {
      const G = openingG, g = G.game;
      g.debug.freeze(); g.menus.wipe.cancel(); g._skipRender = true;
      await g.startMatch({ mapId: 'tidewater', mode: 'turf', duration: 180, difficulty: 'normal' });
      g.debug.freezeBots();
      const snapshot = () => G.actors.map(a => ({ team: a.team, slot: a.slot, bot: a.isBot,
        phase: a.s3?.squidSpawn?.phase || null, position: a.pos.toArray(), grounded: a.grounded,
        supported: !!a.ground.hit, target: a.s3?.squidSpawn?.target || null }));
      const initial = snapshot(), step = () => g._frame(1 / hz);
      const waiting = rows => {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].phase !== 'aim' || rows[i].position.some((v, k) => Math.abs(v - initial[i].position[k]) > 1e-8))
            throw Error('Opening actor left spawner before match start: ' + JSON.stringify(rows[i]));
        }
      };
      waiting(initial);
      for (let i = 0; i < hz * 4; i++) step();
      const intro = snapshot(); waiting(intro);
      if (G.match.state !== 'intro') throw Error('Missing ordinary introduction');
      for (let i = 0; i < hz && G.match.state === 'intro'; i++) step();
      if (G.match.state !== 'playing') throw Error('Ordinary intro did not finish');
      const playing = snapshot(); waiting(playing);
      // No FIRE: the existing one-second automatic opening launch applies to all.
      let frames = 0;
      while (frames < hz * 1.2 && G.actors.some(a => a.s3?.squidSpawn?.phase === 'aim')) { step(); frames++; }
      const flight = snapshot();
      if (flight.some(a => a.phase !== 'flight')) throw Error('All actors must share the automatic opening flight');
      for (let i = 0; i < hz * 1.5; i++) step();
      const landed = snapshot();
      if (landed.some(a => a.phase || !a.grounded || !a.supported)) throw Error('Opening actor failed real supported touchdown: ' + JSON.stringify(landed));
      return { hz, initial, intro, playing, flight, launchWaitFrames: frames, landed };
    }, hz);
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
