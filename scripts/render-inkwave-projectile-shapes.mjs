#!/usr/bin/env node
// Multi-angle render of in-flight main-weapon projectiles in the real built
// game (Practice Range, real input, fixed 60 Hz stepping). Presentation
// evidence only: it never asserts gameplay values.
// Usage: node scripts/render-inkwave-projectile-shapes.mjs <site> <out-dir> [case,...]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const [siteArg, outArg, only] = process.argv.slice(2);
if (!outArg) throw Error('Usage: node scripts/render-inkwave-projectile-shapes.mjs <site> <out-dir> [case,...]');
const site = path.resolve(siteArg), out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  const file = path.resolve(site, u === '/' ? 'index.html' : '.' + decodeURIComponent(u));
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

// [id, hold ticks before release (0 = tap), sample ticks after first projectile, jump]
const CASES = [
  ['shooter', 4, [2, 4, 7, 12, 18]],
  ['s3-shooter-heavy', 4, [2, 4, 7, 12, 18]],
  ['s3-shelter-normal', 2, [2, 4, 7, 12]],
  ['s3-stringer-normal', 75, [2, 5, 9, 15, 40]],
  ['s3-stringer-short', 50, [2, 5, 9, 15]],
  ['s3-saber-normal', 2, [1, 3, 5, 8]],
  ['s3-saber-normal-charged', 70, [1, 3, 5, 8]],
  ['s3-slosher-launcher', 2, [3, 8, 14, 22, 30]],
  ['s3-slosher-washtub', 2, [3, 8, 14, 22, 30]],
  ['s3-slosher-bathtub', 2, [4, 10, 18, 28, 40]],
];
const VIEWS = (process.env.VIEWS || 'wide,side,oblique,front,top').split(',');

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror', String(e)));
  await page.goto(base + '/?range&skipTitle');
  await page.waitForFunction(() => window.__G?.match?.range && window.__G.match.state === 'playing', null, { timeout: 240000 });
  await page.evaluate(() => {
    const G = window.__G, g = window.__inkwave; g.debug.freeze(); g.debug.freezeBots();
    window.shapeSpawn = G.local.pos.clone().set(23, G.local.pos.y, -18);
    const st = document.createElement('style'); st.textContent = 'body *{visibility:hidden!important}canvas{visibility:visible!important}'; document.head.appendChild(st);
  });
  const manifest = [];
  for (const [label, hold, samples] of CASES) {
    if (only && !only.split(',').includes(label)) continue;
    const id = label.replace(/-charged$/, '');
    const ready = await page.evaluate(({ id, hold }) => {
      const G = window.__G, g = window.__inkwave, a = G.local;
      G.projectiles.clear(); G.fx.clear?.();
      a.pos.copy(window.shapeSpawn); a.vel.set(0, 0, 0);
      a.setWeapon(id); a.ink = 100; a.weaponRunner.reset?.();
      const aim = () => { G.rig.yaw = 0; G.rig.pitch = window.shapePitch ?? 0.06; };
      window.shapeAim = aim; aim();
      g.debug.fire(false); g._skipRender = true;
      for (let i = 0; i < 40; i++) { aim(); a.pos.x = window.shapeSpawn.x; a.pos.z = window.shapeSpawn.z; g._frame(1 / 60); }
      const n0 = G.projectiles.list.length;
      g.debug.fire(true);
      let t = 0;
      for (; t < hold; t++) { a.ink = 100; aim(); g._frame(1 / 60); }
      const cs = a.weaponRunner.catalogState, held = { chargeF: cs?.chargeF, pending: !!cs?.pending, charge: a.weaponRunner.charge, cooldown: a.weaponRunner.cooldown };
      g.debug.fire(false);
      let wait = 0;
      while (wait++ < 90 && !G.projectiles.list.some(p => p.delay <= 0 && p.owner === a)) { aim(); g._frame(1 / 60); }
      window.shapeTick = 0;
      return { id: a.weapon?.id ?? a.weaponId, held, n: G.projectiles.list.length, n0, wait, pos: a.pos.toArray(), aim: a.aimDir.toArray(), yaw: a.aimYaw };
    }, { id, hold });
    console.log(label, JSON.stringify(ready));
    for (const tick of (process.env.TICKS ? process.env.TICKS.split(',').map(Number) : samples)) {
      const info = await page.evaluate(tick => {
        const G = window.__G, g = window.__inkwave, a = G.local;
        g._skipRender = true;
        while (window.shapeTick < tick) { window.shapeAim(); g._frame(1 / 60); window.shapeTick++; }
        g._skipRender = false;
        const list = G.projectiles.list.filter(p => p.delay <= 0 && p.owner === a);
        return { count: list.length, pos: list.slice(0, 4).map(p => p.pos.toArray().map(v => +v.toFixed(2))),
          types: [...new Set(list.map(p => p.type + ':' + (p.catalogVisual?.style || '-')))] };
      }, tick);
      for (const view of VIEWS) {
        await page.evaluate(({ view, d }) => {
          const G = window.__G, g = window.__inkwave, a = G.local, cam = G.camera;
          cam.up.set(0, 1, 0);
          const list = G.projectiles.list.filter(p => p.delay <= 0 && p.owner === a);
          const THREE = cam.position.constructor;
          const c = new THREE();
          if (list.length) { for (const p of list) c.add(p.pos); c.multiplyScalar(1 / list.length); } else c.copy(a.pos).add(new THREE(0, 1, 2));
          // frame muzzle + projectiles
          const mid = c.clone().lerp(a.pos.clone().add(new THREE(0, 1, 0)), 0.35);
          const span = Math.max(2.2, c.distanceTo(a.pos) * 0.75);
          const fwd = new THREE(Math.sin(a.aimYaw), 0, Math.cos(a.aimYaw)), right = new THREE(fwd.z, 0, -fwd.x);
          G.projectiles._draw();
          if (view === 'wide') { cam.position.copy(mid).addScaledVector(right, -span * 1.25).add(new THREE(0, 0.25, 0)); cam.lookAt(mid); }
          if (view === 'side') { cam.position.copy(c).addScaledVector(right, -d).add(new THREE(0, 0.15, 0)); cam.lookAt(c); }
          if (view === 'behind') { cam.position.copy(a.pos).addScaledVector(fwd, -2.2).add(new THREE(0.6, 1.9, 0)); cam.lookAt(c); }
          if (view === 'oblique') { cam.position.copy(c).addScaledVector(right, -d * 0.7).addScaledVector(fwd, d * 0.7).add(new THREE(0, d * 0.35, 0)); cam.lookAt(c); }
          if (view === 'front') { cam.position.copy(c).addScaledVector(fwd, d).add(new THREE(0.3, 0.3, 0)); cam.lookAt(c); }
          if (view === 'top') { cam.position.copy(c).add(new THREE(0, d * 1.2, 0)).addScaledVector(fwd, -0.01); cam.lookAt(c); }
          // telephoto close-ups (narrow FOV keeps the camera outside the near-lens dither)
          const tele = view.startsWith('tele-');
          if (tele) {
            const head = list.length ? list.reduce((b, p) => (p.pos.distanceTo(a.pos) > b.pos.distanceTo(a.pos) ? p : b)).pos : c;
            const at = head.clone().addScaledVector(fwd, -0.6);
            if (view === 'tele-side') cam.position.copy(at).addScaledVector(right, -9).add(new THREE(0, 0.8, 0));
            if (view === 'tele-oblique') cam.position.copy(at).addScaledVector(right, -6.5).addScaledVector(fwd, 6.5).add(new THREE(0, 2.4, 0));
            if (view === 'tele-back') cam.position.copy(at).addScaledVector(fwd, -9).addScaledVector(right, 1.5).add(new THREE(0, 2.0, 0));
            cam.lookAt(at);
          }
          window.__shapeFov ??= cam.fov;
          cam.fov = tele ? 14 : window.__shapeFov;
          cam.up.set(0, 1, 0);
          cam.updateMatrixWorld(); cam.updateProjectionMatrix();
          g.R.render();
        }, { view, d: Number(process.env.CAM_DIST || 2.6) });
        const file = `${label}-t${String(tick).padStart(2, '0')}-${view}.png`;
        await page.locator('canvas').first().screenshot({ path: path.join(out, file) });
        manifest.push({ label, tick, view, file, ...info });
      }
    }
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
} finally {
  await browser?.close();
  server.close();
}
