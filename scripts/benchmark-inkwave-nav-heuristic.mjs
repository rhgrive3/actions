// Actual emitted modules in Chromium, compared with the pinned composed main
// implementation. Component CPU timings only; no full-game/device/FPS claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [siteArg, outputArg] = process.argv.slice(2);
if (!siteArg || !outputArg) throw Error('Usage: node scripts/benchmark-inkwave-nav-heuristic.mjs SITE OUTPUT.json');
const site = path.resolve(siteArg), output = path.resolve(outputArg);
const baseline = fs.readFileSync(new URL('../patches/local-quality/tests/fixtures/nav-9c070329.mjs.txt', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(baseline) !== '6439aa71cbf266777b0190a8e568561aaaf41b39b149fadd6735bb3f116b280f') throw Error('Baseline identity mismatch');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw Error('Manifest hash mismatch');
for (const [name, digest] of Object.entries(manifest.artifacts))
  if (hash(fs.readFileSync(path.join(site, name))) !== digest) throw Error('Artifact mismatch: ' + name);
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/src/game/nav-baseline.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(baseline); return;
    }
    const file = path.resolve(site, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(site + path.sep)) throw Error('Invalid path');
    const bytes = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'text/javascript' }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const importMap = JSON.parse(fs.readFileSync(path.join(site, 'index.html'), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  // Same-origin document, using the build's exact vendored import map.
  await page.route(origin + '/probe.html', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">' + JSON.stringify(importMap) + '</script>' }));
  await page.goto(origin + '/probe.html');
  const result = await page.evaluate(async () => {
    const [before, after] = await Promise.all([import('/src/game/nav-baseline.js'), import('/src/game/nav.js')]);
    let seed = 31917;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const width = 32, nodes = [];
    for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) nodes.push({ id: nodes.length, x, y: 0, z, zone: -1, nb: [] });
    for (const n of nodes) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      const x = n.x + dx, z = n.z + dz;
      if (x < 0 || z < 0 || x >= width || z >= width || (x === 16 && z % 7)) continue;
      n.nb.push({ to: z * width + x, cost: Math.hypot(dx, dz) + random() * .6, type: 'walk' });
    }
    const cases = Array.from({ length: 256 }, () => [(random() * nodes.length) | 0, (random() * nodes.length) | 0]);
    const pair = [before, after].map(api => Object.assign(Object.create(api.NavGraph.prototype), { nodes }));
    const call = (nav, args) => nav.path(...args, 0, 6000);
    let paths = 0;
    for (const args of cases) {
      const a = call(pair[0], args), b = call(pair[1], args);
      if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('Route differs: ' + args);
      if (a?.length > 1) paths++;
      for (const key of ['_g', '_from', '_seen', '_closed'])
        if (JSON.stringify(Array.from(pair[0][key])) !== JSON.stringify(Array.from(pair[1][key]))) throw Error('Search differs: ' + key);
    }
    const counts = [], original = Math.hypot;
    try {
      for (const nav of pair) {
        let n = 0;
        Math.hypot = (...args) => { n++; return original(...args); };
        for (const args of cases) call(nav, args);
        counts.push(n);
      }
    } finally { Math.hypot = original; }
    for (let warm = 0; warm < 4; warm++) for (const nav of pair) for (const args of cases) call(nav, args);
    const batches = [[], []];
    for (let round = 0; round < 6; round++) for (const k of round % 2 ? [1, 0, 0, 1] : [0, 1, 1, 0]) {
      const start = performance.now();
      for (const args of cases) call(pair[k], args);
      batches[k].push(performance.now() - start);
    }
    if (paths < 200 || counts[1] >= counts[0] * .9) throw Error('Insufficient workload or calculation reduction');
    return { nodes: nodes.length, queriesPerBatch: cases.length, nontrivialPaths: paths,
      pathsAndSearchStateExact: true, heuristicCalls: { before: counts[0], after: counts[1] },
      extraScratchBytes: pair[1]._h.byteLength, batchMilliseconds: { before: batches[0], after: batches[1] } };
  });
  const report = { status: 'passed', baselineCommit: '9c0703298aed297667837533c32454cc60980603',
    baselineSha256: hash(baseline), buildContentHash: manifest.contentHash, browser: browser.version(),
    scope: 'Headless Chromium A* component with emitted production NavGraph. Synthetic obstacle graph. Alternating ABBA/BAAB batches; 4 warm rounds. No rendering, full-game FPS, device memory or crash-prevention claim.', ...result };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
