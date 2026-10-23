// Run from repo root after a diagnostic build, e.g.
//   INKWAVE_BUILD_UNMINIFIED=1 node scripts/build-inkwave.mjs inkwave-public .built-site/diag
//   node reports/inkwave-program-reuse-probe-2026-10-23.mjs .built-site/diag
// Counts the WebGL programs linked during a fixed offline match: the match load, then five Super Jumps of the local
// player to a teammate and four launched Recycled Brella canopies (bots frozen, fixed 60 Hz steps, one render every
// 250 ms of game time). A program created after the load is a synchronous shader link in the middle of play.
// Requires playwright (see docs/inkwave-development.md); CHROMIUM_PATH selects a system Chromium.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const site = path.resolve(process.argv[2] || '_site');
const weapon = process.env.WEAPON || 's3-shelter-focus';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(site, '.' + pathname);
  if (!file.startsWith(site)) { response.writeHead(403); response.end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync(path.resolve('.browser-profile-program-reuse-'));
const browser = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 640, height: 360 },
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = browser.pages()[0] || await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { globalThis.G = (await import(new URL('src/core/ctx.js', document.baseURI).href)).G; });
  await page.waitForFunction(() => !!globalThis.G?.game?.menus && globalThis.G.s3?.installed && globalThis.G.mode !== 'boot', null, { timeout: 600000 });
  await page.evaluate(async (weapon) => {
    const count = globalThis.__programs = { phase: 'load', byPhase: {} };
    const proto = WebGL2RenderingContext.prototype, create = proto.createProgram;
    proto.createProgram = function () { count.byPhase[count.phase] = (count.byPhase[count.phase] || 0) + 1; return create.apply(this, arguments); };
    G.game.profile.weapon = weapon;
    G.game.menus.wipe?.cancel?.();
    await G.game.startMatch({ mapId: 'tidewater', difficulty: 'easy', duration: 180, mode: 'turf' });
    G.game.debug.freeze(); G.game.debug.freezeBots();
  }, weapon);
  const result = await page.evaluate(() => {
    const count = globalThis.__programs, me = G.match.local, mate = G.actors.find(a => a !== me && a.team === me.team);
    const step = () => G.game.debug.step(250), canopyShown = () => G.scene.children.some(o => /^brella-canopy:/.test(o.name));
    const log = [];
    count.phase = 'settle';
    for (let i = 0; i < 12; i++) step();
    for (let j = 1; j <= 5; j++) {
      count.phase = 'jump' + j;
      const started = me.superJump(mate);
      for (let n = 0; n < 60 && (me.superJumpState || n < 4); n++) step();
      for (let i = 0; i < 4; i++) step();
      log.push({ phase: count.phase, started });
    }
    for (let k = 1; k <= 4; k++) {
      count.phase = 'canopy' + k;
      G.game.debug.fire(true);
      let launched = false;
      for (let n = 0; n < 40 && !launched; n++) { step(); launched = canopyShown(); }
      G.game.debug.fire(false);
      for (let n = 0; n < 40 && canopyShown(); n++) step();
      for (let i = 0; i < 4; i++) step();
      log.push({ phase: count.phase, launched });
    }
    return { weapon: me.weapon?.id, log, programs: count.byPhase };
  });
  console.log(JSON.stringify({ site, ...result, errors }, null, 2));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
