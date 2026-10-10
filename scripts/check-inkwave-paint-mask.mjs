#!/usr/bin/env node
// Real WebGL contract test for source-composed AND minified emitted paint.
// No game boot, image-diff tolerance, or hand-written shader substitute.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from './inkwave-source-composition.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const site = path.resolve(arg('--site', '_site'));
const evidence = path.resolve(arg('--evidence-dir', '.ci-scratch/paint-mask'));
const profile = path.resolve(arg('--profile-dir', '.ci-scratch/paint-mask-profile'));
const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const p of [evidence, profile]) {
  assert(!['/tmp', '/var/tmp', '/dev/shm'].some(root => physical(p) === root || physical(p).startsWith(root + '/')), 'persistent evidence/profile required');
  fs.mkdirSync(p, { recursive: true });
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
assert.equal(hash(JSON.stringify(build.files)), build.inputHash);
assert.equal(hash(JSON.stringify(build.artifacts)), build.contentHash);
for (const [file, expected] of Object.entries(build.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), expected, file);
const fixtureRel = 'patches/splatoon3/tests/paint-mask-browser-fixture.mjs';
const fixtureCode = fs.readFileSync(path.join(ROOT, fixtureRel), 'utf8');
let sourceSha = null;
if (process.argv.includes('--exact-source')) {
  sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = new Map(execFileSync('git', ['ls-tree', '-r', '-z', sourceSha], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean).map(row => { const [metadata, file] = row.split('\t'); return [file, metadata.split(' ')[2]]; }));
  const roots = { 'upstream/': 'inkwave-public/', 'patch/': 'patches/splatoon3/', 'touch-layout/': 'patches/touch-layout/',
    'reliability/': 'patches/reliability/', 'local-quality/': 'patches/local-quality/', 'network-replication/': 'patches/network-replication/',
    'loading-cache/': 'patches/loading-cache/', 'practice-range/': 'patches/practice-range/', 'build-script/': 'scripts/' };
  const files = Object.entries(build.files).map(([key, expected]) => {
    const prefix = Object.keys(roots).find(p => key.startsWith(p)); assert(prefix, key);
    const file = roots[prefix] + key.slice(prefix.length); assert.equal(hash(fs.readFileSync(path.join(ROOT, file))), expected, file); return file;
  });
  assert.equal(hash(fs.readFileSync(path.join(ROOT, 'scripts/build-inkwave.mjs'))), build.build.script);
  files.push('scripts/build-inkwave.mjs', 'scripts/inkwave-source-composition.mjs', 'scripts/check-inkwave-paint-mask.mjs', fixtureRel);
  const blobs = execFileSync('git', ['hash-object', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  files.forEach((file, i) => assert.equal(blobs[i], tree.get(file), file + ' must match the tested commit'));
}
const received = new Set(), errors = [];
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const mode = pathname.startsWith('/source/') ? 'source' : 'built';
    const asset = mode === 'source' ? '/source/' : '/built/_versions/' + build.build.revision + '/';
    if (/^\/(source|built)\/fixture.html$/.test(pathname)) {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports: { three: asset + 'vendor/three/build/three.module.js', 'three/addons/': asset + 'vendor/three/jsm/' } }) +
        '</script><script type="module">import {runPaintMaskProbe} from "' + '/' + mode + '/fixture.mjs"; runPaintMaskProbe().then(result=>globalThis.paintMaskResult=result).catch(error=>globalThis.paintMaskError=error.stack);</script>'); return;
    }
    if (/^\/(source|built)\/fixture.mjs$/.test(pathname)) {
      res.setHeader('content-type', 'text/javascript'); res.end(fixtureCode.replaceAll('/ASSET/', asset)); return;
    }
    assert(pathname.startsWith('/source/') || pathname.startsWith('/built/'));
    const relative = pathname.slice(mode.length + 2);
    let bytes;
    if (mode === 'source') {
      const native = relative.startsWith('src/') || relative.startsWith('vendor/');
      const root = native ? path.join(ROOT, 'inkwave-public') : ROOT;
      const file = path.resolve(root, relative); assert(file.startsWith(root + path.sep));
      bytes = fs.readFileSync(file);
      if (/\.m?js$/.test(file)) bytes = Buffer.from(adaptBuildSource(relative, bytes.toString()));
    } else {
      const file = path.resolve(site, relative); assert(file.startsWith(site + path.sep));
      bytes = fs.readFileSync(file); assert.equal(hash(bytes), build.artifacts[relative], relative + ' served artifact binding');
    }
    received.add(mode + '/' + relative);
    res.setHeader('content-type', /\.json$/.test(relative) ? 'application/json' : 'text/javascript');
    res.setHeader('cache-control', 'no-store'); res.end(bytes);
  } catch (error) { errors.push(error.message); res.writeHead(404); res.end(); }
});
const { chromium } = await import(arg('--playwright') ? pathToFileURL(path.resolve(arg('--playwright'))).href : 'playwright');
let context;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context = await chromium.launchPersistentContext(profile, { headless: true,
    ...(arg('--executable') ? { executablePath: arg('--executable') } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = {};
  for (const mode of ['source', 'built']) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/${mode}/fixture.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.paintMaskResult || globalThis.paintMaskError, null, { timeout: 120000 });
    const outcome = await page.evaluate(() => ({ result: globalThis.paintMaskResult, error: globalThis.paintMaskError }));
    assert.equal(outcome.error, undefined, outcome.error); assert.equal(errors.length, 0, JSON.stringify(errors));
    results[mode] = outcome.result; await page.close();
  }
  assert.deepEqual(results.source, results.built, 'source-composed and emitted mask/hash receipts must agree exactly');
  for (const mode of ['source', 'built']) {
    assert([...received].some(file => file.startsWith(mode + '/') && file.endsWith('/src/world/paint.js')), mode + ' paint module served');
    assert([...received].some(file => file.startsWith(mode + '/') && file.endsWith('/patches/splatoon3/runtime/paint-ownership.mjs')), mode + ' CPU ownership module served');
  }
  const receipt = { status: 'passed', sourceSha, contentHash: build.contentHash, inputHash: build.inputHash,
    verifierHash: hash(fs.readFileSync(fileURLToPath(import.meta.url))), fixtureHash: hash(fixtureCode), received: [...received].sort(), results };
  fs.writeFileSync(path.join(evidence, 'paint-mask-result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: receipt.status, sourceSha, cases: results.built.rows.length,
    hashQueries: results.built.hashQueries, cells: results.built.cells, negativeUnsupported: results.built.negativeUnsupported,
    body: { cases: results.built.body.rows.length, cpuCells: results.built.body.cpuCells, gpuCells: results.built.body.gpuCells,
      cpuOnly: results.built.body.cpuOnly, gpuOnly: results.built.body.gpuOnly, ties: results.built.body.ties } }));
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); }
