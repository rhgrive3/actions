#!/usr/bin/env node
// Concise lightweight acceptance probe for Issue #190: Bounded Paint Atlas Mipmaps.
// Instruments native WebGL gl.generateMipmap and gl.getError plus RT pixel readback
// in real Chromium with SwiftShader WebGL2. Designed for direct embedding in active CI.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { adaptPaintMipmaps, MIP_POLICY } from '../patches/local-quality/issue-190-adapter.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));

let chromium = null;
try {
  const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright').catch(() => null);
  chromium = pw?.chromium;
  if (!chromium) {
    const req = createRequire(import.meta.url);
    const pkg = req('/mnt/workspace/.npm-global/lib/node_modules/@playwright/test');
    chromium = pkg?.chromium;
  }
} catch (e) {
  // handled below
}

if (!chromium) {
  console.error('Playwright/Chromium not found. Please install playwright or set PLAYWRIGHT_MODULE.');
  process.exit(1);
}

// Minimal local HTTP server to serve ES modules to headless Chromium
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head>
      <script type='importmap'>
      { "imports": { "three": "/vendor/three/build/three.module.js" } }
      </script>
    </head><body><canvas id='c'></canvas></body></html>`);
    return;
  }
  const rel = req.url.slice(1);
  if (rel === 'src/world/paint.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end(adaptPaintMipmaps(rel, fs.readFileSync(path.join(SRC, rel), 'utf8')));
    return;
  }
  const file = path.join(SRC, rel);
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404);
    res.end('Not found: ' + rel);
  }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);

  const report = await page.evaluate(async () => {
    const THREE = await import('three');
    const { PaintSystem } = await import('/src/world/paint.js');

    const canvas = document.getElementById('c');
    canvas.width = 512;
    canvas.height = 512;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const gl = renderer.getContext();

    let mipCalls = 0;
    let maxGlError = 0;
    const origGenerateMipmap = gl.generateMipmap.bind(gl);
    gl.generateMipmap = function(...args) {
      mipCalls++;
      const res = origGenerateMipmap(...args);
      const err = gl.getError();
      if (err !== 0) maxGlError = err;
      return res;
    };

    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const face = {
      paintable: true, turf: true,
      origin: v(0, 0, 0), u: v(1, 0, 0), v: v(0, 0, 1), n: v(0, 1, 0),
      su: 20, sv: 20, block: 0, wall: false
    };
    const block = {
      aabbMin: v(-10, -5, -10), aabbMax: v(30, 5, 30),
      faces: [0, -1, -1, -1, -1, -1]
    };
    const level = {
      faces: [face], blocks: [block],
      pointInside: () => false,
      queryBlocks: () => [0]
    };

    // 1. Initial creation and clear
    const paint = new PaintSystem(renderer, level, { atlasSize: 512 });
    const initialMipCalls = mipCalls;
    const initialGlError = gl.getError();

    // 2. Draw splat and verify actual RT pixel upload
    paint.splat(v(5, 0, 5), 1.0, 1, { instant: true, seed: 0.1 });
    paint.flush(1 / 60);

    const buf = new Uint8Array(512 * 512 * 4);
    renderer.readRenderTargetPixels(paint.rt, 0, 0, 512, 512, buf);
    let paintedPixels = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) paintedPixels++;
    }

    // 3. 60 frames (1.0s) drying cadence measurement
    const preDryingCalls = mipCalls;
    for (let f = 0; f < 60; f++) {
      paint.flush(1 / 60);
    }
    const dryingCalls = mipCalls - preDryingCalls;

    // 4. Test explicit public _regenerateMipmaps into empty scene
    const preRegenCalls = mipCalls;
    paint._regenerateMipmaps();
    const regenCalls = mipCalls - preRegenCalls;
    const postRegenGlError = gl.getError();

    return {
      glVersion: gl.getParameter(gl.VERSION),
      glRenderer: gl.getParameter(gl.RENDERER),
      initialMipCalls,
      initialGlError,
      paintedPixels,
      preDryingCalls,
      dryingCalls,
      regenCalls,
      totalMipCalls: mipCalls,
      postRegenGlError,
      maxGlError,
      rtGenerateMipmapsRestored: paint.rt.texture.generateMipmaps === false,
      autoClearRestored: renderer.autoClear === true,
      counts: [...paint.counts],
    };
  });

  // Strict acceptance criteria
  assert.equal(report.initialGlError, 0, 'GL error must be 0 after init');
  assert.equal(report.maxGlError, 0, 'gl.getError must remain 0 throughout all generateMipmap calls');
  assert.equal(report.postRegenGlError, 0, 'GL error must remain 0 after _regenerateMipmaps');
  assert.equal(report.initialMipCalls, 1, 'Initial clear must synchronize mipmap chain exactly once');
  assert.ok(report.paintedPixels > 1000, `Actual GPU paint pass must draw pixels into RT (got ${report.paintedPixels})`);
  assert.ok(report.dryingCalls <= 6 && report.dryingCalls >= 3, `Drying mip calls (${report.dryingCalls}) must be bounded ~4 Hz over 60 frames`);
  assert.equal(report.regenCalls, 1, '_regenerateMipmaps via empty scene pass must trigger exactly 1 native gl.generateMipmap');
  assert.equal(report.rtGenerateMipmapsRestored, true, 'rt.texture.generateMipmaps must be false in finally');
  assert.equal(report.autoClearRestored, true, 'renderer.autoClear must be restored to true in finally');

  console.log('INKWAVE Paint Mipmaps Acceptance Probe: PASS');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}