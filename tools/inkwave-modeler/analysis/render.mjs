// usage: node render.mjs file.html outprefix [jobs.json]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, file, out, jobsFile] = process.argv;
const three = fs.readFileSync(new URL('./three.min.js', import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.route('**/three.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.goto('file://' + fs.realpathSync(file));
await page.waitForFunction(() => window.__INKWAVE_READY || (window.__INKWAVE_BOOT_ERRORS || []).length, null, { timeout: 120000 });
const errs = await page.evaluate(() => window.__INKWAVE_BOOT_ERRORS || []);
if (errs.length) { console.log('BOOT ERRORS', errs); }
const jobs = jobsFile ? JSON.parse(fs.readFileSync(jobsFile)) : [
  { name: 'front', view: 'front', box: [380, 60, 760, 360], scale: 2 },
  { name: 'side', view: 'left', box: [420, 40, 800, 340], scale: 2 },
  { name: 'p34', persp: [-0.62, 0.02, 0.62, 760, 600, [0.0, 1.36, 0.0], 30] },
];
for (const j of jobs) {
  if (j.profile) await page.evaluate((p) => window.__INKWAVE_QA.setProfile(p), j.profile);
  const url = await page.evaluate((j) => j.persp ? window.__INKWAVE_QA.renderPersp(...j.persp) : window.__INKWAVE_QA.render(j.view, j.mode || 'beauty', j.only || null, j.scale || 1, j.box || null), j);
  if (!url) { console.log('no url for', j.name); continue; }
  fs.writeFileSync(out + '_' + j.name + '.png', Buffer.from(url.split(',')[1], 'base64'));
}
const stats = await page.evaluate(() => window.__INKWAVE_QA.stats());
console.log(JSON.stringify({ tris: stats.tris ?? stats.triangles, buildMs: stats.buildMs, errors: stats.errors }));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
