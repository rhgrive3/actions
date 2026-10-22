// Capture a live INKWAVE match (Tidewater turf, bots frozen) with a deterministic two-team paint field for ink-material
// review: fresh and settled ink toward / across / away from the sun, optional sequential frames of a camera pan
// (FRAMES=n) and a render-time sample (40 frames, one-pixel readback; PERF_ONLY=1 skips the images, NOPERF=1 skips timing).
// usage: node scripts/capture-inkwave-ink-material.mjs <siteDir> <outDir> [port]
// Software (SwiftShader) rendering: images are for side-by-side review, timings are not device performance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const [siteArg, out, portArg] = process.argv.slice(2); const site = path.resolve(siteArg);
const port = +(portArg || 8123);
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ktx2': 'application/octet-stream', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p);
  if (!f.startsWith(path.resolve(site)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(port, '127.0.0.1');

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { let s = 12345; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async () => { globalThis.P = (await import(new URL('src/core/ctx.js', document.baseURI).href)).G; });
await page.waitForFunction(() => !!globalThis.P?.game?.menus && globalThis.P.mode !== 'boot', null, { timeout: 300000 });
await page.evaluate(async () => { const g = P.game; g.debug.freeze(); g.menus.wipe.cancel(); g.api.setSettings?.({ quality: 'high' }); await g.startMatch({ mapId: 'tidewater', difficulty: 'easy', duration: 180, mode: 'turf' }); });
await page.waitForFunction(() => P.game.hud?._visible && !document.querySelector('.iw-lineup'), null, { timeout: 60000 });
await page.addStyleTag({ content: 'body > *:not(canvas):not(#app):not(#game){visibility:hidden !important} .iw-hud,.hud,[class*="hud"]{visibility:hidden !important}' });
const info = await page.evaluate(() => {
  const g = P.game; g.debug.freezeBots(); g._skipRender = true;
  for (let i = 0; i < 270; i++) g._frame(1 / 60);
  const a = g.match.local;
  if (a.s3?.squidSpawn?.phase === 'aim') { g.debug.fire(false); g._frame(1 / 60); g.debug.fire(true); g._frame(1 / 60); g.debug.fire(false); for (let i = 0; i < 70; i++) g._frame(1 / 60); }
  for (let i = 0; i < 30; i++) g._frame(1 / 60);
  g._skipRender = false;
  return { pos: a.pos.toArray(), yaw: a.yaw ?? a.facing ?? null, clock: P.paint.clock };
});
console.log(JSON.stringify(info));
// deterministic paint field all around the actor: two teams with a meandering border
const sun = await page.evaluate(() => {
  const g = P.game, a = g.match.local, V = a.pos.constructor;
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const v = new V();
  for (let i = 0; i < 520; i++) {
    const ang = rnd() * Math.PI * 2, d = 0.3 + Math.sqrt(rnd()) * 14;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    const team = x + Math.sin(z * 0.6) * 2.2 > 0.8 ? 1 : 0;
    v.set(a.pos.x + x, a.pos.y + 0.3, a.pos.z + z);
    P.paint.splat(v, 0.6 + rnd() * 1.1, team, { seed: rnd() });
  }
  let L = null; P.scene.traverse(o => { if (o.isDirectionalLight && (!L || o.intensity > L.intensity)) L = o; });
  const d = L.position.clone().sub(L.target.position).normalize();
  return { dir: d.toArray(), az: Math.atan2(d.x, d.z) };
});
console.log(JSON.stringify({ sun }));
const views = (process.env.VIEWS || 'sun:0,side:1.5708,back:3.1416').split(',').map(t => t.split(':'));
const shot = async (name, settleFrames) => {
  await page.evaluate(n => { const g = P.game; g._skipRender = true; for (let i = 0; i < n; i++) g._frame(1 / 60); g._skipRender = false; g._frame(1 / 60); }, settleFrames);
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 120000 });
};
const aim = async (yaw) => page.evaluate(y => { const g = P.game, a = g.match.local; a.yaw = a.aimYaw = y; g.rig.yaw = y; g.rig.pitch = -0.32; a.aimPitch = -0.32; }, yaw);
const PERF_ONLY = !!process.env.PERF_ONLY;
if (!PERF_ONLY) for (const [vn, off] of views) { await aim(sun.az + +off); await shot('fresh-' + vn, 2); }
await page.evaluate(() => { const g = P.game; g._skipRender = true; for (let i = 0; i < 600; i++) g._frame(1 / 60); g._skipRender = false; });
if (!PERF_ONLY) {
  for (const [vn, off] of views) { await aim(sun.az + +off); await shot('settled-' + vn, 20); }
  const N = +(process.env.FRAMES || 0);
  if (N) { fs.mkdirSync(path.join(out, 'seq'), { recursive: true });
    for (let i = 0; i < N; i++) { await aim(sun.az - 0.7 + 1.4 * i / (N - 1)); await page.evaluate(() => { const g = P.game; g._skipRender = true; g._frame(1 / 60); g._skipRender = false; g._frame(1 / 60); });
      await page.screenshot({ path: path.join(out, 'seq', String(i).padStart(4, '0') + '.png'), timeout: 120000 }); } }
}
await aim(sun.az);
const perf = process.env.NOPERF ? null : await page.evaluate(() => {
  // a one-pixel readback drains the GL queue each frame (gl.finish stalls for seconds under SwiftShader)
  const g = P.game, gl = g.R.renderer.getContext(), px = new Uint8Array(4), t = [];
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < 10; i++) { g._frame(1 / 60); sync(); }
  for (let i = 0; i < 40; i++) { const t0 = performance.now(); g._frame(1 / 60); sync(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b); const q = p => t[Math.floor(p * (t.length - 1))];
  return { n: t.length, median: q(.5), p10: q(.1), p90: q(.9), mean: t.reduce((a, b) => a + b, 0) / t.length };
});
console.log(JSON.stringify({ perf }));
await browser.close(); server.close();
