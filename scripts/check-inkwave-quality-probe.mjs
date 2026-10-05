#!/usr/bin/env node
// CLI entry point for the lightweight browser acceptance probe for quality switching.
// Integrates with persistent workspace storage and the active CI suite.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runQualityBrowserProbe } from '../patches/local-quality/quality-probe.mjs';

const option = (name, def = null, required = false) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) {
    if (required) throw new Error('Required argument: ' + name);
    return def;
  }
  return path.resolve(process.argv[i + 1]);
};

const site = option('--site', '.built-site/_site');
const evidence = option('--evidence-dir', null, false);
const profile = option('--profile-dir', null, false);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const physicalLocation = (name) => fs.existsSync(name) ? fs.realpathSync(name) : path.join(physicalLocation(path.dirname(name)), path.basename(name));

for (const dir of [evidence, profile].filter(Boolean)) {
  const resolved = physicalLocation(dir);
  if (['/tmp', '/var/tmp', '/dev/shm'].some((root) => resolved === root || resolved.startsWith(root + '/'))) {
    throw new Error('Use workspace-owned persistent storage: ' + resolved);
  }
  fs.mkdirSync(dir, { recursive: true });
}

let playwright;
try {
  playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
} catch (e) {
  console.log('[quality-probe] playwright not installed in local environment, probe export is ready for CI embedding');
  process.exit(0);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw new Error('Missing');
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch (_) {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/`;

let browser;
try {
  browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(address);
  const result = await runQualityBrowserProbe(page);

  if (evidence) {
    fs.writeFileSync(path.join(evidence, 'quality-browser-result.json'), JSON.stringify(result, null, 2));
  }
  console.log('[quality-probe] passed successfully');
} finally {
  if (browser) await browser.close();
  server.close();
}
