// Export the exact current runtime model from the single-file generator.
// usage: node scripts/inkwave_export_source.mjs [HTML] [output.glb] [report-dir]
// The report directory receives runtime_tree.json / export_tree.json: the exact per-mesh world-bounds and
// material contract that scripts/inkwave_roundtrip_qa.mjs checks the Blender master against.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const html = path.resolve(process.argv[2] || path.join(base, 'INKWAVE_AI_MODELER_FINAL.html'));
const output = path.resolve(process.argv[3] || path.join(base, 'blender', 'inkwave_character_source.glb'));
const reportDir = process.argv[4] ? path.resolve(process.argv[4]) : null;
fs.mkdirSync(path.dirname(output), { recursive: true });
if (reportDir) fs.mkdirSync(reportDir, { recursive: true });
const three = fs.readFileSync(path.join(base, 'analysis', 'three.min.js'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/three.min.js', route => route.fulfill({ body: three, contentType: 'application/javascript' }));
  await page.goto('file://' + html);
  await page.waitForFunction(() => window.__INKWAVE_READY || (window.__INKWAVE_BOOT_ERRORS || []).length, null, { timeout: 120000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const source = await page.evaluate(() => window.__INKWAVE_QA.stats());
  const target = await page.evaluate(() => window.__INKWAVE_QA.exportRootStats());
  if (reportDir) {
    for (const [hook, file] of [['tree', 'runtime_tree.json'], ['exportTree', 'export_tree.json']]) {
      const report = await page.evaluate((name) => window.__INKWAVE_QA[name](), hook);
      fs.writeFileSync(path.join(reportDir, file), JSON.stringify(report));
    }
  }
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.locator('#exportBlender').click()]);
  await download.saveAs(output);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, source, exported: target }));
} finally { await browser.close(); }
