#!/usr/bin/env node
// Scratch only. Execute only after the parent explicitly releases the CPU slot.
// One context, two emitted material factories, shared authored grate / texlib.
// This does not qualify whole-game performance or physical GPU performance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
if (!process.argv.includes('--execute')) throw Error('Scratch timing probe: require --execute after the parent releases the CPU slot');
const root = fs.realpathSync(arg('--source-root', '/workspace/render-1565'));
const sourceSha = arg('--source-sha', '602774b9caf8a5cbb12290096a09d4d17cc756b0');
const baselineSha = arg('--baseline-sha', 'd5265f73d9dad69f1afd9690e374caee45195f11');
assert.equal(sourceSha, '602774b9caf8a5cbb12290096a09d4d17cc756b0', 'Frozen narrow candidate source');
assert.equal(baselineSha, 'd5265f73d9dad69f1afd9690e374caee45195f11', 'Frozen original-expression baseline source');
const { verifyRuntimeBuild, hash, persistentDirectory, persistentBrowserTemp } = await import(pathToFileURL(path.join(root, 'scripts/lib/inkwave-runtime-evidence.mjs')).href);
const sites = { A: fs.realpathSync(arg('--baseline-site', '/workspace/inkwave-baseline-current')), B: fs.realpathSync(arg('--site', '/workspace/inkwave-render-narrow')) };
const manifests = { A: verifyRuntimeBuild(sites.A, root, baselineSha), B: verifyRuntimeBuild(sites.B, root, sourceSha) };
assert.equal(manifests.A.contentHash, '8f56a1470c72ecf04250ba7be2cf74a3c89f7267674c840d7d63c14fa3b29775');
assert.equal(manifests.B.contentHash, '50b919d25d49699574f9846c99400b8486c70c60d1634d94bc7bc75121211bb3');
for (const manifest of Object.values(manifests)) assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash);
// The module changes only the material normal/cache block. Every dependency
// imported by the fixture must be exactly the same emitted artifact bytes.
for (const file of ['src/world/level.js', 'src/world/texlib.js', 'src/world/inkShading.js', 'src/core/ctx.js', 'vendor/three/build/three.module.js']) {
  assert.equal(manifests.A.artifacts[file], manifests.B.artifacts[file], 'Shared emitted dependency: ' + file);
  assert.ok(manifests.A.artifacts[file]);
}
const output = persistentDirectory(arg('--out', path.join(root, '.ci-scratch/1565/grate-performance')));
if (Object.values(sites).some(site => output === site || output.startsWith(site + '/'))) throw Error('Evidence must remain outside immutable builds');
if (fs.existsSync(path.join(output, 'grate-performance.json'))) throw Error('Fresh --out required');
const browserTemp = persistentBrowserTemp(arg('--browser-temp', path.join(root, '.ci-scratch/gp')));
for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = browserTemp;
const width = Number(arg('--width', '480')), height = Number(arg('--height', '300'));
const warmup = Number(arg('--warmup', '12')), batch = Number(arg('--batch', '32')), cycles = Number(arg('--cycles', '1'));
if (![width, height, warmup, batch, cycles].every(v => Number.isSafeInteger(v) && v > 0) || warmup < 12 || batch < 8) throw Error('Require positive sizes/cycles, warmup >=12 and batch >=8');
const prefixes = Object.fromEntries(Object.entries(manifests).map(([name, manifest]) => [name, '/' + name + '/_versions/' + manifest.build.revision + '/']));
const loaded = new Map(), errors = [];
const result = {
  status: 'prepared', harnessSha256: hash(fs.readFileSync(new URL(import.meta.url))), argv: process.argv,
  candidate: { sourceSha, contentHash: manifests.B.contentHash, inputHash: manifests.B.inputHash, materialArtifactSha256: manifests.B.artifacts['src/world/levelMaterial.js'] },
  baseline: { sourceSha: baselineSha, contentHash: manifests.A.contentHash, inputHash: manifests.A.inputHash, materialArtifactSha256: manifests.A.artifacts['src/world/levelMaterial.js'] },
  environment: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, node: process.version },
  config: { width, height, warmup, batch, cycles, windowsPerView: cycles * 8, order: 'ABBA then BAAB, per view', texlibSize: 64 },
  scope: 'Single Chromium realm/context, exact emitted A original and B narrow DoubleSide grate material factories, shared real generated 25-layer texlib at 64px and shared authored Level top-face geometry. Nonpaintable production grate attributes; same zero-paint atlas, uniforms, camera/light, coverage and draw workload. Four front/back × top/bottom-light views. Independent reversed-normal/winding FrontSide oracle outside timing.',
  limitations: ['Component only; no full-game, startup/load, hardware GPU, heap, or general nondegradation claim.',
    '64px real procedural texlib is a diagnostic resolution, not the production 256/512px library.',
    'No world lightmap, mural, environment map, shadow map, postprocessing or simulation; these are identical between component A/B.',
    'GPU elapsed-query durations are SwiftShader/driver observations; unsupported, missing, or disjoint results fail the run.',
    'Intentional backside lighting changes are compared to an independent reversed-geometry oracle, not blanket A/B parity.',
    'The oracle is restricted to this horizontal, nonpaintable pattern-12 grate: unchanged UV/tangent/position attributes, identity mesh transform, no stair remap, ink/wake/ripple slopes, mural, or see-through fade.',
    'Its existing max-1/255 and at-most-1%-changed-pixels arithmetic tolerance is a separate component-oracle criterion; the committed PR FrontSide controls require exact zero changed pixels.',
    'Timing starts after query begin/error checks and ends after gl.finish plus mandatory one-pixel readPixels. Full-frame reads, PNGs, validation and query polling remain outside timing.'], errors,
};
const save = () => fs.writeFileSync(path.join(output, 'grate-performance.json'), JSON.stringify(result, null, 2) + '\n');
save();
fs.copyFileSync(new URL(import.meta.url), path.join(output, 'probe-inkwave-grate-performance.mjs'));
const server = http.createServer((request, response) => {
  if (request.url === '/grate-performance') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefixes.B}vendor/three/build/three.module.js","three/addons/":"${prefixes.B}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#20242b"></body></html>`);
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost'), parts = decodeURIComponent(url.pathname).slice(1).split('/'), name = parts.shift(), key = parts.join('/');
    if (!sites[name] || !manifests[name].artifacts[key]) throw Error('Unlisted artifact');
    const file = fs.realpathSync(path.resolve(sites[name], key));
    if (!file.startsWith(sites[name] + '/')) throw Error('Artifact path escape');
    const bytes = fs.readFileSync(file), sha256 = hash(bytes);
    assert.equal(sha256, manifests[name].artifacts[key], name + '/' + key);
    loaded.set(name + '/' + key, { variant: name, path: key, sha256, bytes: bytes.length });
    response.writeHead(200, { 'content-type': /\.m?js$/.test(key) ? 'text/javascript' : 'application/json', 'cache-control': 'no-store' }); response.end(bytes);
  } catch (error) { response.writeHead(404); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page, watchdog;
try {
  const { chromium } = await import(pathToFileURL(arg('--playwright', '/workspace/actions/node_modules/playwright/index.mjs')).href);
  browser = await chromium.launch({ headless: true, executablePath: arg('--chromium', '/home/agent/.cache/ms-playwright/chromium-1194/chrome-linux/chrome'),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  watchdog = setTimeout(() => { result.timeout = 'Five-minute browser deadline exceeded'; void browser?.close(); }, 300000);
  result.environment.browser = browser.version(); result.status = 'booting-component'; save();
  page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/grate-performance', { waitUntil: 'domcontentloaded', timeout: 60000 });
  result.probe = await page.evaluate(async ({ prefixes, width, height, warmup, batch, cycles }) => {
    const require = (condition, text) => { if (!condition) throw Error(text); };
    const THREE = await import('three');
    const { Level } = await import(prefixes.B + 'src/world/level.js');
    const factories = { A: (await import(prefixes.A + 'src/world/levelMaterial.js')).createLevelMaterial, B: (await import(prefixes.B + 'src/world/levelMaterial.js')).createLevelMaterial };
    const { createTextureLibrary } = await import(prefixes.B + 'src/world/texlib.js');
    const Gs = [(await import(prefixes.A + 'src/core/ctx.js')).G, (await import(prefixes.B + 'src/core/ctx.js')).G];
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.setClearColor(0x20242b, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.debug.checkShaderErrors = true; renderer.info.autoReset = false;
    document.body.appendChild(renderer.domElement); Gs.forEach(G => { G.renderer = renderer; });
    const gl = renderer.getContext(), errorChecks = [];
    globalThis.grateProbePartial = { errorChecks, stage: 'context-created' };
    const checkError = stage => { const codes = []; for (let code = gl.getError(); code !== gl.NO_ERROR; code = gl.getError()) codes.push(code); errorChecks.push({ stage, codes }); require(codes.length === 0, 'WebGL error at ' + stage + ': ' + codes.join(',')); };
    checkError('after-context');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
    require(timer, 'Valid elapsed-query evidence requires EXT_disjoint_timer_query_webgl2');
    const gpu = { webgl: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, width / height, .05, 30);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, .25));
    const sun = new THREE.DirectionalLight(0xffffff, 3); scene.add(sun);
    const level = new Level({ id: 'grate-double-side-timing', bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, spawnPads: [[0, 0, -4], [0, 0, 4]], spawnBarrier: 1, half: [], single: [
      { kind: 'box', min: [-1.5, -.15, -1], max: [1.5, 0, 1], grate: true, pattern: 12, color: '#87969d', bevel: 0 },
    ] });
    require(level.blocks.length === 1 && level.blocks[0].grate && !level.blocks[0].paint, 'Production grate must remain unpaintable');
    const native = level.buildGeometry(1, block => block.grate), indices = [];
    for (let i = 0; i < native.index.count; i += 3) {
      const tri = [native.index.getX(i), native.index.getX(i + 1), native.index.getX(i + 2)];
      if (tri.every(v => native.attributes.normal.getY(v) > .999)) indices.push(...tri);
    }
    require(indices.length === 6, 'Authored Level grate must contribute exactly two top-face triangles');
    const face = native.clone(); face.setIndex(indices); face.computeBoundingSphere();
    for (const v of indices) require(face.attributes.faceData.getX(v) === 12 && face.attributes.faceData.getY(v) === 0, 'Do not synthesize paintable grates');
    const reversed = face.clone();
    for (let i = 0; i < reversed.attributes.normal.count; i++) { const n = reversed.attributes.normal; n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    const reverseIndices = indices.slice();
    for (let i = 0; i < reverseIndices.length; i += 3) [reverseIndices[i + 1], reverseIndices[i + 2]] = [reverseIndices[i + 2], reverseIndices[i + 1]];
    reversed.setIndex(reverseIndices); reversed.computeBoundingSphere();
    const oracleScope = { horizontalPattern12: true, unpaintable: true, unchangedAttributesExceptNormal: true,
      texlibRemapIdentity: true, noStairs: true, noInkSlopes: true, noMural: true, noSeeThrough: true,
      tolerance: { maxChannelError: 1, maxChangedPixelFraction: .01, separateFromExactZeroFrontSidePRGate: true } };
    for (const v of indices) {
      require(face.attributes.normal.getX(v) === 0 && face.attributes.normal.getY(v) === 1 && face.attributes.normal.getZ(v) === 0 && face.attributes.faceTan.getY(v) === 0, 'Oracle requires a horizontal unit normal and orthogonal authored tangent');
      require(face.attributes.faceFlags.getZ(v) < -.5, 'Oracle excludes murals');
    }
    for (const [name, attribute] of Object.entries(face.attributes)) if (name !== 'normal') require(attribute.array.every((value, i) => value === reversed.attributes[name].array[i]), 'Oracle must preserve ' + name + ' attributes byte-for-value');
    const paint = new THREE.DataTexture(new Uint8Array(4), 1, 1); paint.needsUpdate = true;
    const library = await createTextureLibrary(renderer, { size: 64 }); checkError('after-real-texlib-generation');
    require(library.size === 64 && library.names.length === 25 && Number.isFinite(library.layers.grate), 'Expected generated 64px real 25-layer library including grate');
    const opts = { grate: true, texlib: library }, materials = { A: factories.A(paint, 1, null, opts), B: factories.B(paint, 1, null, opts) };
    for (const material of Object.values(materials)) {
      const u = material.userData.uniforms, remap = u.uTLt.value[12], stair = u.uTLs.value[12];
      require(remap.z === 12 && remap.w === 12 && stair.toArray().every(value => value === 0), 'Oracle requires unchanged pattern-12 remap and no stair coordinates');
      require(u.uSeeOn.value === 0 && u.uAO.value === 0, 'Oracle excludes see-through fade and AO lightmaps');
    }
    const oracle = factories.A(paint, 1, null, opts); oracle.side = THREE.FrontSide;
    const oracleX = { value: 1 }, oldOracleCompile = oracle.onBeforeCompile, oldOracleKey = oracle.customProgramCacheKey;
    oracle.customProgramCacheKey = () => oldOracleKey() + '-scratch-reversed-normal-oracle';
    oracle.onBeforeCompile = function (shader, ...args) {
      oldOracleCompile.call(this, shader, ...args); shader.uniforms.uProbeNormalX = oracleX;
      const anchor = 'nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm,';
      require(shader.fragmentShader.split(anchor).length === 2, 'Independent oracle texlib tangent connection missing');
      // Attribute clones preserve positions, faceUv, faceTan, flags and paintUv.
      // With unpaintable pid=12, no stair remap or procedural/ink slope is active.
      // Reversing N leaves T unchanged and sends B=cross(N,T) to -B; reflecting
      // tangent-normal x therefore gives q'=-q for q=T*x*s+B*y*s+N*z.
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uProbeNormalX;').replace(anchor, 'gTexN.x *= uProbeNormalX;\n' + anchor);
    };
    const mesh = new THREE.Mesh(face, materials.A); mesh.receiveShadow = true; scene.add(mesh);
    require(mesh.position.lengthSq() === 0 && mesh.quaternion.equals(new THREE.Quaternion()) && mesh.scale.equals(new THREE.Vector3(1, 1, 1)), 'Oracle is scoped to the identity mesh transform');
    const templates = {}, expanded = {}, shaderSource = gl.shaderSource; let activeCompile = null;
    Object.assign(globalThis.grateProbePartial, { gpu, templates, expanded, stage: 'capturing-and-warming-materials' });
    gl.shaderSource = function (shader, source) {
      if (activeCompile) { const stage = source.includes('gl_Position') ? 'vertex' : 'fragment'; (expanded[activeCompile] ||= {})[stage] = source; }
      return shaderSource.call(this, shader, source);
    };
    for (const [label, material] of Object.entries({ ...materials, oracle })) {
      require(material.defines.USE_TEXLIB === 1 && material.defines.GRATE === 1, label + ' production defines missing');
      const compile = material.onBeforeCompile;
      material.onBeforeCompile = function (shader, ...args) { compile.call(this, shader, ...args); templates[label] = { vertex: shader.vertexShader, fragment: shader.fragmentShader }; };
    }
    const resource = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length });
    const uniformValues = material => JSON.stringify(Object.fromEntries(Object.entries(material.userData.uniforms).map(([key, entry]) => {
      const value = entry.value, convert = v => v?.isTexture ? { texture: v.uuid } : v?.toArray ? v.toArray() : v;
      return [key, Array.isArray(value) ? value.map(convert) : convert(value)];
    })));
    const materialValues = material => JSON.stringify({ type: material.type, side: material.side, defines: material.defines, vertexColors: material.vertexColors, roughness: material.roughness, metalness: material.metalness,
      clearcoat: material.clearcoat, clearcoatRoughness: material.clearcoatRoughness, envMapIntensity: material.envMapIntensity, transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite, depthTest: material.depthTest, alphaToCoverage: material.alphaToCoverage });
    require(materials.A.side === THREE.DoubleSide && materials.B.side === THREE.DoubleSide, 'Both timed materials must use actual DoubleSide');
    require(materialValues(materials.A) === materialValues(materials.B), 'A/B material state differs outside shader');
    let gpuCalls = 0, gpuVertices = 0, gpuModes = [];
    const drawArrays = gl.drawArrays, drawElements = gl.drawElements;
    gl.drawArrays = function (...args) { gpuCalls++; gpuVertices += args[2]; gpuModes.push(args[0]); return drawArrays.apply(this, args); };
    gl.drawElements = function (...args) { gpuCalls++; gpuVertices += args[1]; gpuModes.push(args[0]); return drawElements.apply(this, args); };
    const draw = (label, back = false) => { mesh.geometry = label === 'oracle' && back ? reversed : face; mesh.material = label === 'oracle' ? oracle : materials[label]; oracleX.value = back ? -1 : 1; renderer.render(scene, camera); };
    const fullRead = () => { const bytes = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const diff = (a, b) => { let changedPixels = 0, maxChannelError = 0; for (let i = 0; i < a.length; i += 4) { let changed = false; for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); changed ||= d > 0; maxChannelError = Math.max(maxChannelError, d); } changedPixels += changed; } return { pixels: a.length / 4, changedPixels, maxChannelError }; };
    const covered = bytes => { let total = 0; for (let i = 3; i < bytes.length; i += 4) total += bytes[i] > 0; return total; };
    const onePixel = new Uint8Array(4), drain = () => { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, onePixel); };
    const views = [['front-toplight', 3, 5], ['front-underlight', 3, -5], ['back-toplight', -3, 5], ['back-underlight', -3, -5]];
    const setView = ([, y, lightY]) => { camera.position.set(0, y, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); sun.position.set(2, lightY, 3); sun.updateMatrixWorld(); };
    setView(views[0]);
    const warm = [];
    globalThis.grateProbePartial.warm = warm;
    // Compile/warm both timed paths and the independent oracle before any sample.
    for (const label of ['A', 'B', 'oracle']) {
      activeCompile = label; const start = performance.now();
      for (let i = 0; i < warmup; i++) draw(label);
      drain(); checkError('after-initial-warm-' + label); warm.push({ label, draws: warmup, elapsedMs: performance.now() - start, resources: resource() });
    }
    // Upload reversed geometry and exercise the negative-facing uniform state
    // before freezing the resource set for every later view, not just each batch.
    setView(views[2]);
    for (const label of ['A', 'B', 'oracle']) {
      activeCompile = label; const start = performance.now();
      for (let i = 0; i < warmup; i++) draw(label, true);
      drain(); checkError('after-back-resource-warm-' + label); warm.push({ label, back: true, draws: warmup, elapsedMs: performance.now() - start, resources: resource() });
    }
    setView(views[0]);
    activeCompile = null; gl.shaderSource = shaderSource;
    const oldNormal = /vec3\s+wn\s*=\s*normalize\(nBase\s*-\s*slope\.x\s*\*\s*T\s*-\s*slope\.y\s*\*\s*Bt\);\s*normal\s*=\s*normalize\(\(viewMatrix\s*\*\s*vec4\(wn,\s*0\.0\)\)\.xyz\);/;
    const guardedNormal = /#ifdef\s+DOUBLE_SIDED\s+normal\s*=\s*normalize\(mat3\(viewMatrix\)\s*\*\s*\(nBase\s*-\s*slope\.x\s*\*\s*T\s*-\s*slope\.y\s*\*\s*Bt\)\)\s*\*\s*faceDirection\s*;\s*#else\s+vec3\s+wn\s*=\s*normalize\(nBase\s*-\s*slope\.x\s*\*\s*T\s*-\s*slope\.y\s*\*\s*Bt\);\s*normal\s*=\s*normalize\(\(viewMatrix\s*\*\s*vec4\(wn,\s*0\.0\)\)\.xyz\);\s*#endif/;
    const canonical = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '').replace(/\s+/g, '');
    const shaderChecks = { baselineOriginalConnection: oldNormal.test(templates.A.fragment), candidateGuardedConnection: guardedNormal.test(templates.B.fragment) };
    require(shaderChecks.baselineOriginalConnection && shaderChecks.candidateGuardedConnection, 'Frozen baseline original / candidate narrow expression connection missing');
    for (const kind of ['template', 'expanded']) {
      const pair = kind === 'template' ? templates : expanded;
      require(pair.A && pair.B && pair.A.fragment && pair.B.fragment, kind + ' actual shader capture missing');
      require(pair.A.vertex === pair.B.vertex, kind + ' A/B vertex shader differs');
      require(guardedNormal.test(pair.B.fragment), kind + ' narrow guard missing');
      const currentAsOriginal = pair.B.fragment.replace(guardedNormal, 'vec3 wn = normalize(nBase - slope.x * T - slope.y * Bt);\nnormal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);');
      require(canonical(pair.A.fragment) === canonical(currentAsOriginal), kind + ' shader differs outside normal block/comments');
      shaderChecks[kind + 'EqualOutsideNormalAndComments'] = true;
    }
    for (const label of ['A', 'B']) for (const define of ['USE_TEXLIB', 'DOUBLE_SIDED', 'GRATE']) require(new RegExp('^#define ' + define + '\\b', 'm').test(expanded[label].fragment), label + ' actual expanded GLSL lacks ' + define);
    shaderChecks.actualDefines = { USE_TEXLIB: true, DOUBLE_SIDED: true, GRATE: true };
    require(uniformValues(materials.A) === uniformValues(materials.B), 'A/B warmed uniform values or shared texture identities differ');
    const frozenUniforms = uniformValues(materials.A), fixedResourcesBeforeViews = resource();
    const geometryState = { indexVersion: face.index.version, indices: Array.from(face.index.array), drawRange: { ...face.drawRange }, attributes: Object.fromEntries(Object.entries(face.attributes).map(([name, a]) => [name, { version: a.version, count: a.count, itemSize: a.itemSize }])) };
    const geometryUnchanged = () => mesh.geometry === face && face.index.version === geometryState.indexVersion && JSON.stringify(Array.from(face.index.array)) === JSON.stringify(geometryState.indices) && JSON.stringify(face.drawRange) === JSON.stringify(geometryState.drawRange)
      && Object.entries(face.attributes).every(([name, a]) => a.version === geometryState.attributes[name].version && a.count === geometryState.attributes[name].count && a.itemSize === geometryState.attributes[name].itemSize);
    const queryResult = async (query, preDisjoint) => {
      const deadline = performance.now() + 30000;
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE), disjoint = preDisjoint || !!gl.getParameter(timer.GPU_DISJOINT_EXT), nanoseconds = available ? gl.getQueryParameter(query, gl.QUERY_RESULT) : null;
      gl.deleteQuery(query); return { available, disjoint, valid: available && !disjoint && Number.isFinite(nanoseconds) && nanoseconds > 0, nanoseconds, milliseconds: available && !disjoint ? nanoseconds / 1e6 : null };
    };
    const rows = [], correctness = [], images = {};
    Object.assign(globalThis.grateProbePartial, { rows, correctness, images, shaderChecks, stage: 'correctness-and-timing' });
    for (const view of views) {
      const [name, cameraY] = view, back = cameraY < 0; setView(view);
      // Camera/light/resource warming and complete image comparisons are untimed.
      for (const label of ['A', 'B', 'oracle']) { for (let i = 0; i < warmup; i++) draw(label, back); drain(); }
      const snapshots = {};
      for (const label of ['A', 'B', 'oracle']) { draw(label, back); drain(); snapshots[label] = fullRead(); images[name + '-' + label] = renderer.domElement.toDataURL(); }
      const comparison = diff(snapshots.B, snapshots.oracle), intentional = diff(snapshots.A, snapshots.B), coverage = Object.fromEntries(Object.entries(snapshots).map(([label, bytes]) => [label, covered(bytes)]));
      const correctnessRow = { view: name, back, coverage, candidateVsOracle: comparison, originalVsCandidate: intentional, camera: camera.position.toArray(), light: sun.position.toArray() };
      correctness.push(correctnessRow);
      require(coverage.A > 10000 && coverage.A === coverage.B && coverage.B === coverage.oracle, name + ' geometry/discard coverage differs or absent');
      require(comparison.maxChannelError <= 1 && comparison.changedPixels <= width * height * .01, name + ' candidate differs materially from reversed geometric normal oracle');
      require(!back || intentional.changedPixels > 10000 && intentional.maxChannelError > 10, name + ' must exercise the intended lighting correction');
      require(back || intentional.maxChannelError <= 1 && intentional.changedPixels <= width * height * .01, name + ' front arithmetic changed material appearance');
      checkError('after-correctness-' + name);
      const fixedResources = resource();
      require(JSON.stringify(fixedResources) === JSON.stringify(fixedResourcesBeforeViews), name + ' added resources after complete initial warmup');
      for (let cycle = 0; cycle < cycles; cycle++) for (const [ordinal, label] of ['A', 'B', 'B', 'A', 'B', 'A', 'A', 'B'].entries()) {
        draw(label, back); drain(); renderer.info.reset(); gpuCalls = gpuVertices = 0; gpuModes = [];
        checkError('before-query-' + name + '-' + cycle + '-' + ordinal);
        const query = gl.createQuery(), preDisjoint = !!gl.getParameter(timer.GPU_DISJOINT_EXT); require(query, 'GPU query allocation failed');
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query); checkError('after-query-begin-' + name + '-' + cycle + '-' + ordinal);
        const start = performance.now();
        for (let i = 0; i < batch; i++) draw(label, back);
        const submitted = performance.now(); gl.endQuery(timer.TIME_ELAPSED_EXT); drain(); const completed = performance.now();
        checkError('after-completion-readback-' + name + '-' + cycle + '-' + ordinal);
        const elapsed = await queryResult(query, preDisjoint); checkError('after-query-result-' + name + '-' + cycle + '-' + ordinal);
        const counts = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, gpuCalls, gpuIndices: gpuVertices, allTriangleMode: gpuModes.every(mode => mode === gl.TRIANGLES) }, resources = resource();
        const sameGeometry = geometryUnchanged(), sameUniforms = uniformValues(materials.A) === frozenUniforms && uniformValues(materials.B) === frozenUniforms;
        const row = { view: name, cycle, ordinal, block: ordinal < 4 ? 'ABBA' : 'BAAB', label, batch, submitMs: submitted - start, completedMs: completed - start, completedPerDrawMs: (completed - start) / batch, gpu: elapsed, counts, resources, sameGeometry, sameUniforms };
        rows.push(row);
        require(elapsed.valid, name + ' has unsupported/missing/disjoint/empty GPU duration');
        require(JSON.stringify(resources) === JSON.stringify(fixedResources) && sameGeometry && sameUniforms, name + ' changed resources/geometry/uniforms inside timing');
        require(counts.calls === batch && counts.triangles === batch * 2 && counts.gpuCalls === batch && counts.gpuIndices === batch * 6 && counts.allTriangleMode, name + ' changed exact GL draw workload');
      }
      const repeat = {};
      for (const label of ['A', 'B']) { draw(label, back); drain(); repeat[label] = diff(snapshots[label], fullRead()); require(repeat[label].changedPixels === 0, name + '-' + label + ' frozen pixels changed during measurements'); }
      Object.assign(correctnessRow, { repeat, resources: resource() });
      checkError('after-view-' + name);
    }
    gl.drawArrays = drawArrays; gl.drawElements = drawElements; checkError('after-hooks-restored');
    const finalResources = resource();
    const output = { gpu, warm, oracleScope, shaderChecks, templates, expanded, correctness, rows, fixedResourcesBeforeViews, finalResources, geometryState, errorChecks, images, authoredFaceIndices: indices.length,
      atlas: { width: 1, height: 1, nonzeroBytes: 0 }, texlib: { size: library.size, layers: library.names.length, grateLayer: library.layers.grate },
      materialKeys: { A: materials.A.customProgramCacheKey(), B: materials.B.customProgramCacheKey() }, translatedShader: 'Not queried: live gl.shaderSource capture only; no deleted shader getters or assembly claim.' };
    Object.values(materials).forEach(material => material.dispose()); oracle.dispose(); paint.dispose(); library.dispose(); native.dispose(); face.dispose(); reversed.dispose(); renderer.dispose();
    return output;
  }, { prefixes, width, height, warmup, batch, cycles });
  assert.equal(errors.length, 0, errors.join('\n'));
  for (const kind of ['templates', 'expanded']) for (const [label, sources] of Object.entries(result.probe[kind])) for (const [stage, source] of Object.entries(sources)) {
    const file = label + '-' + kind + '-' + stage + '.glsl'; fs.writeFileSync(path.join(output, file), source); sources[stage] = { file, sha256: hash(source) };
  }
  for (const [name, image] of Object.entries(result.probe.images)) { const bytes = Buffer.from(image.split(',')[1], 'base64'), file = name + '.png'; fs.writeFileSync(path.join(output, file), bytes); result.probe.images[name] = { file, sha256: hash(bytes) }; }
  const stats = values => { const sorted = values.slice().sort((a, b) => a - b), mean = sorted.reduce((a, b) => a + b, 0) / sorted.length; return { n: sorted.length, mean, p50: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, min: sorted[0], max: sorted.at(-1), samples: values }; };
  const means = (rows, label) => { const filtered = rows.filter(row => row.label === label); return { submitPerDrawMs: stats(filtered.map(row => row.submitMs / row.batch)), completedPerDrawMs: stats(filtered.map(row => row.completedPerDrawMs)), gpuPerDrawMs: stats(filtered.map(row => row.gpu.milliseconds / row.batch)) }; };
  result.summary = Object.fromEntries([...new Set(result.probe.rows.map(row => row.view))].map(view => { const rows = result.probe.rows.filter(row => row.view === view), A = means(rows, 'A'), B = means(rows, 'B'); return [view, { A, B, completedRatioBoverA: B.completedPerDrawMs.mean / A.completedPerDrawMs.mean, gpuRatioBoverA: B.gpuPerDrawMs.mean / A.gpuPerDrawMs.mean }]; }));
  result.pairedBlocks = [];
  for (let i = 0; i < result.probe.rows.length; i += 4) {
    const rows = result.probe.rows.slice(i, i + 4), A = means(rows, 'A'), B = means(rows, 'B'); result.pairedBlocks.push({ view: rows[0].view, cycle: rows[0].cycle, order: rows.map(row => row.label).join(''), completedRatioBoverA: B.completedPerDrawMs.mean / A.completedPerDrawMs.mean, gpuRatioBoverA: B.gpuPerDrawMs.mean / A.gpuPerDrawMs.mean, A, B });
  }
  result.status = 'passed-component-diagnostic-only';
} catch (error) {
  result.status = 'failed'; result.error = error.stack; process.exitCode = 1;
  if (page && !page.isClosed()) try { result.partial = await page.evaluate(() => globalThis.grateProbePartial || null); } catch (partialError) { result.partialCaptureError = partialError.message; }
}
finally { clearTimeout(watchdog); result.loadedArtifacts = [...loaded.values()]; save(); await browser?.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ status: result.status, error: result.error, summary: result.summary, evidence: output })); }
