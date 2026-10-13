#!/usr/bin/env node
// Real full-game initial and death launch proof; caller holds the browser flock.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site = path.resolve(process.argv[2] || '_site-native-hammerhead');
const out = path.resolve(process.argv[3] || '.browser-evidence/hammerhead-spawn');
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
const result = { status: 'running', id: 'hammerhead', rates: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', error => result.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: true, musicVolume: 0, audioVolume: 0 })));
  await page.goto('http://127.0.0.1:' + server.address().port + '/?map=hammerhead', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => globalThis.NG = (await import(new URL('src/core/ctx.js', document.baseURI))).G);
  await page.waitForFunction(() => NG.game?.menus && NG.mode !== 'boot' || document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  for (const hz of [30, 60, 120]) {
    const proof = await page.evaluate(async hz => {
      const G = NG, g = G.game;
      const { nativeArenaBasis, nativeSpawnYaw } = await import(new URL('patches/native-stages/runtime/engine.mjs', document.baseURI));
      g.debug.freeze(); g.menus.wipe.cancel(); g._skipRender = true;
      await g.startMatch({ mapId: 'hammerhead', mode: 'turf', duration: 180, difficulty: 'normal' });
      const forward = nativeArenaBasis(G.level).forward;
      const delta = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      const check = (actor, label) => {
        const yaw = nativeSpawnYaw(G.level, actor.team, actor.team ? Math.PI : 0);
        if (delta(actor.yaw, yaw) > 1e-8) throw Error(label + ' body heading');
        if (label === 'opening' && actor.bot && delta(actor.bot.aimYaw, yaw) > 1e-8) throw Error(label + ' bot heading');
        const spawn = actor.s3?.squidSpawn, target = spawn?.target || spawn?.to, pad = G.level.spawnPads[actor.team];
        const inward = target && ((target.x - pad.x) * forward.x + (target.z - pad.z) * forward.z) * (actor.team ? -1 : 1);
        if (!(inward > 0)) throw Error(label + ' launch points away from the shared arena');
        return { team: actor.team, slot: actor.slot, bot: !!actor.bot, yaw: actor.yaw, phase: spawn.phase, inwardDistance: inward };
      };
      const initial = G.actors.map(actor => check(actor, 'opening'));
      for (let i = 0; i < 330; i++) g._frame(1 / 60);
      if (G.match.state !== 'playing') throw Error('Match introduction did not complete');
      const local = G.local, expectedYaw = nativeSpawnYaw(G.level, local.team, local.team ? Math.PI : 0);
      if (delta(g.rig.yaw, expectedYaw) > 1e-8 || delta(local.aimYaw, expectedYaw) > 1e-8) throw Error('Human camera and aim do not face the derived arena axis');
      const openingCamera = { rigYaw: g.rig.yaw, aimYaw: local.aimYaw, expectedYaw };
      g.input.mouse.left = true; for (let i = 0; i < 3; i++) g._frame(1 / hz);
      g.input.mouse.left = false; for (let i = 0; i < Math.ceil(hz * 1.5); i++) g._frame(1 / hz);
      if (local.s3?.squidSpawn || !local.grounded) throw Error('Human opening launch did not land');
      const openingLanding = local.pos.toArray();
      g.debug.freezeBots(); const opponent = G.actors.find(actor => actor.team === 1 && actor.bot);
      local.splat(opponent); local.respawn(); const resetLocal = check(local, 'human death reset');
      g.input.mouse.left = false; g._frame(1 / hz);
      g.input.mouse.left = true; for (let i = 0; i < 3; i++) g._frame(1 / hz); g.input.mouse.left = false;
      opponent.splat(local); opponent.respawn(); const resetOpponent = check(opponent, 'opposing bot death reset');
      for (let i = 0; i < Math.ceil(hz * 1.5); i++) g._frame(1 / hz);
      if (local.s3?.squidSpawn || opponent.s3?.squidSpawn || !local.grounded || !opponent.grounded) throw Error('Death reset launch did not land on actual source support');
      return { hz, actors: G.actors.length, bots: G.actors.filter(actor => actor.bot).length, initial, openingCamera, openingLanding, resetLocal, resetOpponent, humanGrounded: local.grounded, opposingBotGrounded: opponent.grounded, humanLanding: local.pos.toArray(), opposingBotLanding: opponent.pos.toArray() };
    }, hz);
    assert.equal(proof.actors, 8); assert.equal(proof.bots, 7); assert.equal(proof.initial.length, 8);
    result.rates.push(proof);
  }
  assert.equal(result.errors.length, 0); result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
finally {
  fs.writeFileSync(path.join(out, 'spawn.json'), JSON.stringify(result, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
