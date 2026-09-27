// Render a GLB (source or Blender master/game export) inside the live modeler studio, with the runtime model hidden.
// usage: node scripts/inkwave_glb_three_render.mjs <file.glb> <outprefix> [jobs.json]
// Same camera/light/tone-mapping path as __INKWAVE_QA.render/renderPersp, so its frames compare 1:1 with the runtime
// renders: this is how the exported materials (baked hair maps, cornea, normal maps) are checked in a web engine.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const [,, glbFile, out, jobsFile] = process.argv;
if (!glbFile || !out) { console.error('usage: <file.glb> <outprefix> [jobs.json]'); process.exit(2); }
const jobs = jobsFile ? JSON.parse(fs.readFileSync(jobsFile, 'utf8')) : [
  { name: 'front_beauty', view: 'front', mode: 'beauty', scale: 0.5 },
  { name: 'perspective_beauty', persp: [-0.55, 0.08, 3.3, 700, 875, [0, 0.8, 0], 30] },
];
const three = fs.readFileSync(path.join(base, 'analysis', 'three.min.js'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/three.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await page.route('https://inkwave.invalid/model.glb', (r) => r.fulfill({ body: fs.readFileSync(glbFile), contentType: 'model/gltf-binary' }));
  await page.goto('file://' + path.join(base, 'INKWAVE_AI_MODELER_FINAL.html'));
  await page.waitForFunction(() => window.__INKWAVE_READY || (window.__INKWAVE_BOOT_ERRORS || []).length, null, { timeout: 120000 });
  const loaded = await page.evaluate(async () => window.__INKWAVE_QA.showGLB('https://inkwave.invalid/model.glb'));
  for (const job of jobs) {
    const url = await page.evaluate((j) => (j.persp ? window.__INKWAVE_QA.renderPersp(...j.persp) : window.__INKWAVE_QA.render(j.view, j.mode || 'beauty', null, j.scale || 1, j.box || null)), job);
    fs.writeFileSync(`${out}_${job.name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ glb: path.basename(glbFile), ...loaded, frames: jobs.length }));
} finally { await browser.close(); }
