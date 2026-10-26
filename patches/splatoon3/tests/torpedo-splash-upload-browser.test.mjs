import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hash, persistentDirectory, persistentBrowserTemp } from '../../../scripts/lib/inkwave-runtime-evidence.mjs';

// Opt-in: real WebGL buffer uploads/readback, not a hardware frame-rate claim.
test('Torpedo and Fizzy live-prefix uploads preserve GPU values and pixels', {
  skip: process.env.INKWAVE_TORPEDO_UPLOAD_BROWSER !== '1', timeout: 120000,
}, async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const site = path.resolve(process.env.INKWAVE_BUILT_SITE || root);
  const evidence = persistentDirectory(process.env.INKWAVE_UPLOAD_EVIDENCE || path.join(root, '.ci-scratch/torpedo-upload'));
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = persistentBrowserTemp(path.join(root, '.ci-scratch/bt'));
  const { chromium } = await import('playwright');
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      const vendor = process.env.INKWAVE_BUILT_SITE ? '/vendor/three/' : '/inkwave-public/vendor/three/';
      res.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports: {
        three: vendor + 'build/three.module.js', 'three/addons/': vendor + 'jsm/',
      } }) + '</script><body></body>'); return;
    }
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1);
    const file = path.resolve(site, rel);
    if (!file.startsWith(site + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const report = await page.evaluate(async ({ built }) => {
      const THREE = await import((built ? '/' : '/inkwave-public/') + 'vendor/three/build/three.module.js');
      const { spawnTorpedoSplashes, spawnFizzySplashes, stepTorpedoSplashes, clearTorpedoSplashes } = await import('/patches/splatoon3/runtime/torpedo-splashes.mjs');
      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setSize(32, 32); renderer.setClearColor(0x123456);
      const gl = renderer.getContext(), uploads = [], buffers = new WeakMap(), bound = new Map();
      const bind = gl.bindBuffer.bind(gl), data = gl.bufferData.bind(gl), sub = gl.bufferSubData.bind(gl);
      gl.bindBuffer = function(target, buffer) { bound.set(target, buffer); return bind(target, buffer); };
      gl.bufferData = function(target, array, ...rest) {
        if (ArrayBuffer.isView(array)) buffers.set(array, bound.get(target));
        uploads.push({ op: 'data', bytes: array.byteLength ?? array }); return data(target, array, ...rest);
      };
      gl.bufferSubData = function(target, offset, array, sourceOffset, length) {
        uploads.push({ op: 'sub', bytes: (length ?? array.length) * array.BYTES_PER_ELEMENT });
        return sourceOffset === undefined ? sub(target, offset, array) : sub(target, offset, array, sourceOffset, length);
      };
      const camera = new THREE.PerspectiveCamera(45, 1, .01, 100); camera.position.set(0, 0, 4);
      const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 3));
      const game = { scene, teamColors: [new THREE.Color(0xff3300), new THREE.Color(0x2244ff)] };
      const system = {};
      const api = { THREE, G: game, Hit: class {} };
      const owner = { color: new THREE.Color(0xff3300), remote: false };
      const splash = { count: 8, pitchDegrees: 65, velocityMin: 2, velocityMax: 3, paintRadius: .5 };
      const source = { seed: 42, owner, team: 0, chasedTarget: true,
        spec: { gravity: 24, splashDamage: 12, splashAround: splash, bursts: [{ splashAround: splash }] } };
      let birth = 0;
      const updateVisuals = count => {
        const list = system._s3TorpedoSplashes || [];
        for (let i = count; i < list.length; i++) { list[i].pos.y = -101; list[i].vel.set(0, 0, 0); }
        stepTorpedoSplashes(api, system, 0, () => { throw Error('unexpected burst'); });
        const live = system._s3TorpedoSplashes?.length || 0;
        if (count > live) {
          splash.count = count - live; owner.color.setHex(++birth % 2 ? 0xff3300 : 0x2244ff);
          if (birth % 2) spawnTorpedoSplashes(api, system, source, new THREE.Vector3());
          else spawnFizzySplashes(api, system, source, new THREE.Vector3(), 0);
        }
        for (const [i, item] of (system._s3TorpedoSplashes || []).entries()) item.pos.copy(drop(i).pos);
        stepTorpedoSplashes(api, system, 0, () => { throw Error('unexpected burst'); });
      };
      const drop = i => ({ pos: new THREE.Vector3((i % 7 - 3) * .18, (i % 5 - 2) * .13, -(i % 3) * .1) });
      const pixel = () => { const a = new Uint8Array(32 * 32 * 4); gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
      const gpu = attribute => {
        const buffer = buffers.get(attribute.array);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const out = new Float32Array(attribute.array.length);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, out);
        return out;
      };
      let mesh;
      const frames = [];
      // Growth, compaction, empty hide, reactivation and capacity boundaries.
      for (const count of [8, 8, 16, 64, 1, 0, 3, 768, 1]) {
        const previous = mesh, colorVersion = mesh?.instanceColor.version;
        updateVisuals(count);
        mesh = scene.getObjectByName('s3-torpedo-fizzy-detached-splashes') || mesh;
        const colorChanged = mesh !== previous || mesh?.instanceColor.version !== colorVersion;
        uploads.length = 0; renderer.render(scene, camera);
        const measured = uploads.map(x => ({ ...x })), pixels = pixel();
        let prefixMatches = true;
        if (count) for (const a of [mesh.instanceMatrix, mesh.instanceColor]) {
          const actual = gpu(a), n = count * a.itemSize;
          for (let i = 0; i < n; i++) if (!Object.is(actual[i], a.array[i])) prefixMatches = false;
        }
        // Identical visual state with legacy full-capacity updates.
        if (count) for (const a of colorChanged ? [mesh.instanceMatrix, mesh.instanceColor] : [mesh.instanceMatrix]) { a.clearUpdateRanges(); a.needsUpdate = true; }
        uploads.length = 0; renderer.render(scene, camera);
        const full = uploads.map(x => ({ ...x })), baselinePixels = pixel();
        let paintedPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== 18 || pixels[i + 1] !== 52 || pixels[i + 2] !== 86) paintedPixels++;
        frames.push({ count, measured, full, prefixMatches, paintedPixels,
          pixelsMatch: pixels.every((x, i) => x === baselinePixels[i]) });
      }
      const error = gl.getError(); clearTorpedoSplashes(system); renderer.dispose();
      return { frames, error, renderer: gl.getParameter(gl.RENDERER) };
    }, { built: !!process.env.INKWAVE_BUILT_SITE });
    report.sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    report.harnessHash = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
    report.runtimeHash = hash(fs.readFileSync(path.join(site, 'patches/splatoon3/runtime/torpedo-splashes.mjs')));
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2));
    assert.equal(report.error, 0);
    assert.equal(report.frames[0].measured.filter(x => x.op === 'data' && x.bytes === 49152).length, 1, 'full matrix storage allocated initially');
    assert.equal(report.frames[0].measured.filter(x => x.op === 'data' && x.bytes === 9216).length, 1, 'full color storage allocated initially');
    for (const [i, frame] of report.frames.entries()) {
      assert.equal(frame.prefixMatches, true, 'GPU live prefix ' + frame.count);
      assert.equal(frame.pixelsMatch, true, 'pixel parity ' + frame.count);
      if (frame.count) assert.ok(frame.paintedPixels > 0, 'visible ink must render pixels');
      if (i) {
        const expected = frame.count * (i === 1 ? 64 : 76);
        assert.equal(frame.measured.reduce((sum, x) => sum + x.bytes, 0), expected, 'live upload bytes ' + frame.count);
      }
      if (frame.count === 3) assert.equal(frame.measured.filter(x => x.op === 'data' && x.bytes === 49152).length, 0, 'idle-pool reactivation reuses existing GPU allocation');
      assert.equal(frame.full.reduce((sum, x) => sum + x.bytes, 0), frame.count ? (i === 1 ? 49152 : 58368) : 0, 'legacy full upload bytes');
    }
    console.log(JSON.stringify(report));
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});
