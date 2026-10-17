#!/usr/bin/env node
// Actual emitted level shader and authored-Level runtime geometry (not an
// imported source-stage mesh). Compare a double-sided grate face with
// the same indexed face reversed into a front-facing reference. The
// reference changes winding/normals only; no lighting or coverage is mocked.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(i < 0 ? fallback : process.argv[i + 1]);
};
const site = fs.realpathSync(option('--site', '_site'));
const output = option('--evidence-dir', '.ci-scratch/grate-normal');
const browserName = process.argv[process.argv.indexOf('--browser') + 1] === 'webkit' ? 'webkit' : 'chromium';
const executableAt = process.argv.indexOf('--executable-path');
const executablePath = executableAt < 0 ? (browserName === 'webkit' ? undefined : process.env.CHROMIUM_PATH || '/usr/bin/chromium') : process.argv[executableAt + 1];
if (output === site || output.startsWith(site + '/')) throw Error('Evidence must be outside the immutable build');
fs.mkdirSync(output, { recursive: true });
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const prefix = '/_versions/' + manifest.build.revision + '/';
const loaded = new Map(), errors = [];
const server = http.createServer((request, response) => {
  if (request.url === '/grate-normal') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#20242b"></body></html>`);
    return;
  }
  try {
    const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
    const file = fs.realpathSync(path.resolve(site, key));
    if (!file.startsWith(site + '/') || !manifest.artifacts[key]) throw Error('Missing artifact');
    const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), manifest.artifacts[key], key + ' differs from its manifest');
    loaded.set(key, { path: key, bytes: bytes.length, sha256: hash(bytes) });
    response.writeHead(200, { 'content-type': /\.m?js$/.test(key) ? 'text/javascript' : 'application/json', 'cache-control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, result, failure;
try {
  browser = await (browserName === 'webkit' ? webkit : chromium).launch({ executablePath, headless: true,
    ...(browserName === 'webkit' ? {} : { args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) });
  const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/grate-normal');
  result = await page.evaluate(async ({ prefix }) => {
    const THREE = await import('three');
    const { Level } = await import(prefix + 'src/world/level.js');
    const { createLevelMaterial } = await import(prefix + 'src/world/levelMaterial.js');
    const { G } = await import(prefix + 'src/core/ctx.js');
    const width = 480, height = 360;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.debug.checkShaderErrors = true;
    document.body.appendChild(renderer.domElement);
    G.renderer = renderer;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#20242b');
    const camera = new THREE.PerspectiveCamera(40, width / height, .05, 30);
    const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, .25); scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 3); scene.add(sun);
    const level = new Level({ id: 'grate-normal-fixture', bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
      spawnPads: [[0, 0, -4], [0, 0, 4]], spawnBarrier: 1, half: [], single: [
        { kind: 'box', min: [-1.5, -.15, -1], max: [1.5, 0, 1], grate: true, pattern: 12, color: '#87969d', bevel: 0 },
      ] });
    const native = level.buildGeometry(1, block => block.grate);
    const indices = [];
    for (let i = 0; i < native.index.count; i += 3) {
      const a = native.index.getX(i), b = native.index.getX(i + 1), c = native.index.getX(i + 2);
      if ([a, b, c].every(vertex => native.attributes.normal.getY(vertex) > .999)) indices.push(a, b, c);
    }
    if (indices.length !== 6) throw Error('Authored Level grate-face denominator');
    const face = native.clone(); face.setIndex(indices); face.computeBoundingSphere();
    const reversed = face.clone();
    for (let i = 0; i < reversed.attributes.normal.count; i++) {
      const n = reversed.attributes.normal;
      n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    }
    const reversedIndices = indices.slice();
    for (let i = 0; i < reversedIndices.length; i += 3) [reversedIndices[i + 1], reversedIndices[i + 2]] = [reversedIndices[i + 2], reversedIndices[i + 1]];
    reversed.setIndex(reversedIndices);
    const paint = new THREE.DataTexture(new Uint8Array(4), 1, 1); paint.needsUpdate = true;
    const material = createLevelMaterial(paint, 1, null, { grate: true });
    const reference = createLevelMaterial(paint, 1, null, { grate: true }); reference.side = THREE.FrontSide;
    let fragmentShader = '';
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, ...rest) { compile.call(this, shader, ...rest); fragmentShader = shader.fragmentShader; };
    const mesh = new THREE.Mesh(face, material); scene.add(mesh);
    let referenceGeometry = reversed;
    const gl = renderer.getContext();
    const pixels = () => { const value = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, value); return value; };
    const diff = (a, b) => {
      let changedPixels = 0, maxChannelError = 0;
      for (let i = 0; i < a.length; i += 4) {
        let changed = false;
        for (let c = 0; c < 4; c++) { const error = Math.abs(a[i + c] - b[i + c]); changed ||= error > 0; maxChannelError = Math.max(maxChannelError, error); }
        changedPixels += changed;
      }
      return { pixels: width * height, changedPixels, maxChannelError };
    };
    const draw = referenceOn => {
      mesh.geometry = referenceOn ? referenceGeometry : face;
      mesh.material = referenceOn ? reference : material;
      renderer.info.reset(); renderer.render(scene, camera); gl.finish();
      return { image: renderer.domElement.toDataURL(), pixels: pixels(),
        cost: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
    };
    const rows = [];
    for (const [name, cameraY, lightY] of [['top', 3, 5], ['back-toplight', -3, 5], ['back-underlight', -3, -5]]) {
      camera.position.set(0, cameraY, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      sun.position.set(2, lightY, 3); sun.updateMatrixWorld();
      // The top reference uses the original normal/winding and FrontSide;
    // the back reference reverses the same authored triangle attributes.
      referenceGeometry = cameraY > 0 ? face : reversed;
      draw(false); draw(true); draw(false); draw(true);
      const actual = draw(false), expected = draw(true), again = draw(false);
      rows.push({ name, orientation: diff(actual.pixels, expected.pixels), stable: diff(actual.pixels, again.pixels),
        cost: actual.cost, referenceCost: expected.cost, image: actual.image, referenceImage: expected.image,
        pixelBytes: Array.from(actual.pixels) });
    }
    // Alternate the same real draw and drain its queue. Software-renderer
    // timings are diagnostics; they do not certify a physical mobile GPU.
    const timing = [];
    for (let i = 0; i < 20; i++) { const start = performance.now(); draw(false); timing.push(performance.now() - start); }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = { webgl: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    const shader = { textureAccesses: [...fragmentShader.matchAll(/\btexture(?:2D|Grad|Lod)?\s*\(/g)].length,
      doubleSided: material.side === THREE.DoubleSide, cacheKey: material.customProgramCacheKey(),
      customOrientation: /normal\s*=\s*normalize\([^;]+\)\s*\*\s*faceDirection/.test(fragmentShader), fragmentShader };
    const webglError = gl.getError();
    material.dispose(); reference.dispose(); native.dispose(); face.dispose(); reversed.dispose(); paint.dispose(); renderer.dispose();
    return { rows, timing, gpu, shader, webglError, authoredFaceIndices: indices.length, width, height };
  }, { prefix });
  for (const row of result.rows) {
    for (const [key, suffix] of [['image', 'actual'], ['referenceImage', 'reference']]) {
      const bytes = Buffer.from(row[key].split(',')[1], 'base64');
      fs.writeFileSync(path.join(output, row.name + '-' + suffix + '.png'), bytes);
      row[key + 'SHA256'] = hash(bytes); delete row[key];
    }
    row.pixelSHA256 = hash(Buffer.from(row.pixelBytes)); delete row.pixelBytes;
    assert.equal(row.stable.changedPixels, 0, row.name + ' changed during a frozen redraw');
    assert.deepEqual(row.cost, row.referenceCost, row.name + ' draw/resource cost changed');
    assert.equal(row.cost.calls, 1); assert.equal(row.cost.triangles, 2);
  }
  fs.writeFileSync(path.join(output, 'compiled-fragment.glsl'), result.shader.fragmentShader); delete result.shader.fragmentShader;
  assert.equal(result.webglError, 0); assert.equal(errors.length, 0, errors.join('\n'));
  for (const row of result.rows) assert.equal(row.orientation.changedPixels, 0, row.name + ' differs from correctly oriented authored geometry');
} catch (error) { failure = error; }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  const receipt = { status: failure ? 'failed' : 'passed', measurement: browserName + ' WebGL2; emitted level material / authored Level geometry / fallback surface branch; deterministic static render; software timings only; concurrent workloads may confound timing',
    inputHash: manifest.inputHash, contentHash: manifest.contentHash, result, errors, loaded: [...loaded.values()],
    ...(failure ? { error: failure.stack } : {}) };
  fs.writeFileSync(path.join(output, 'grate-normal-result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: receipt.status, rows: result?.rows.map(row => ({ name: row.name, orientation: row.orientation, cost: row.cost })), error: failure?.message }));
  if (failure) process.exitCode = 1;
}
