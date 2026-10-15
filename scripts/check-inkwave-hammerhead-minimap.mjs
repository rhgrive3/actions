#!/usr/bin/env node
// Live-game regression for the bridge floor beneath its preserved highway deck.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site = path.resolve(process.argv[2] || '_site-native-hammerhead');
const out = path.resolve(process.argv[3] || '.browser-evidence/hammerhead-minimap');
fs.mkdirSync(out, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(site, '.' + (rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(site + '/') || !fs.statSync(file).isFile()) throw Error('Missing');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = { status: 'running', id: 'hammerhead', rules: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', e => result.errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: true, musicVolume: 0, audioVolume: 0 })));
  await page.goto('http://127.0.0.1:' + server.address().port + '/?map=hammerhead', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => globalThis.NG = (await import(new URL('src/core/ctx.js', document.baseURI))).G);
  await page.waitForFunction(() => NG.game?.menus && NG.mode !== 'boot' || document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  for (const mode of ['turf', 'zones', 'tower', 'rainmaker', 'clams']) {
    await page.evaluate(async mode => {
      const g = NG.game; g.debug.freeze(); g._skipRender = true; g.menus.wipe.cancel();
      await g.startMatch({ mapId: 'hammerhead', mode, difficulty: 'normal' });
      for (let i = 0; i < 330; i++) g._frame(1 / 60); g.debug.freezeBots();
    }, mode);
    const proof = await page.evaluate(() => {
      const G = NG, map = G.game.minimap, level = G.level; map.ensure();
      if (level.nativeNav !== G.nav) throw Error('Detached minimap navigation was not retained');
      let pixel = -1, distance = Infinity;
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const d = (map._worldX(x + .5) + .5) ** 2 + (map._worldZ(y + .5) + .5) ** 2;
        if (d < distance) { distance = d; pixel = y * map.w + x; }
      }
      const x = pixel % map.w, z = Math.floor(pixel / map.w), wx = map._worldX(x + .5), wz = map._worldZ(z + .5);
      const origin = level.spawnPads[0].clone().set(wx, 50, wz), down = origin.clone().set(0, -1, 0);
      const roof = level.triangleWorld.ray(origin, down, 100), floor = level.triangleWorld.ray(origin.setY(12), down, 5, { minNormalY: .68 });
      const cell = map.pixCell[pixel];
      if (!roof || !floor || cell < 0) throw Error('Bridge center map support missing');
      G.paint.splat(floor.point.clone().addScaledVector(floor.normal, .03), 2, 0, { seed: .125, instant: true }); map.update(0, true);
      return { mode: G.match.mode, actors: G.actors.length, bots: G.actors.filter(a => a.bot).length, topmostY: roof.point.y, floorY: floor.point.y, minimapY: map.hgt[pixel], cellOwner: G.paint.grid[cell], minimapOwner: map.owner[pixel], nativeNavRetained: true };
    });
    assert.equal(proof.mode, mode); assert.equal(proof.actors, 8); assert.equal(proof.bots, 7);
    assert(proof.topmostY > 40); assert(Math.abs(proof.minimapY - proof.floorY) < .15);
    assert.equal(proof.cellOwner, 1); assert.equal(proof.minimapOwner, 1); result.rules.push(proof);
  }
  assert.equal(result.errors.length, 0); result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
finally {
  fs.writeFileSync(path.join(out, 'minimap.json'), JSON.stringify(result, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
