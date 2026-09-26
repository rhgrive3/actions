import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('three.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.route('**/three.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.goto('file://' + fs.realpathSync(process.argv[2]));
await page.waitForFunction(() => window.__INKWAVE_READY || (window.__INKWAVE_BOOT_ERRORS || []).length, null, { timeout: 120000 });
const r = await page.evaluate(() => {
  const Q = window.__INKWAVE_QA, out = { boot: [...(window.__INKWAVE_BOOT_ERRORS || [])], presets: [] };
  for (const p of Q.presets()) { Q.applyPreset(p.id); const st = Q.stats(); out.presets.push({ id: p.id, tris: st.tris ?? st.triangles, errors: st.errors.length, valid: Q.validate().ok ?? Q.validate() }); }
  Q.applyPreset('inkwave-ref-aquatech');
  // slot sweep: every eye / skin / headgear option and a few shape extremes
  const base = Q.getProfile(); let bad = [];
  for (const [k, n] of [['eyes', 8], ['brows', 5], ['skin', 9], ['headgear', 5], ['baseBody', 4]]) for (let i = 0; i < n; i++) {
    const p = JSON.parse(JSON.stringify(base)); p.style[k] = i; try { Q.setProfile(p); Q.rebuild(); } catch (e) { bad.push(k + i + ':' + e.message); }
  }
  for (const sh of [{ eyeScale: 1.2 }, { eyeScale: 0.85 }, { earLength: 1.3 }, { earLength: 0.7 }, { eyeSpacing: 1.15 }, { eyeHeight: 0.01 }, { headYaw: -0.35 }]) {
    const p = JSON.parse(JSON.stringify(base)); Object.assign(p.shape, sh); try { Q.setProfile(p); Q.rebuild(); } catch (e) { bad.push(JSON.stringify(sh) + ':' + e.message); }
  }
  Q.setProfile(base); out.sweepErrors = bad; out.final = Q.stats(); return out;
});
console.log(JSON.stringify(r, null, 1)); console.log('page errors:', errs.slice(0, 10));
await browser.close();
