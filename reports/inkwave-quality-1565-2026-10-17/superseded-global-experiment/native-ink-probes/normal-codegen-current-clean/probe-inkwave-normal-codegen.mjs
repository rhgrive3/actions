#!/usr/bin/env node
// Scratch diagnostic: one exact production game/realm/context and one frozen
// native ink overlay. Only test-material normal expressions differ. This is
// neither whole-game performance acceptance nor a physical GPU measurement.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
const root = path.resolve(arg('--source-root', '/workspace/render-1565'));
const site = path.resolve(arg('--site', '/workspace/inkwave-render-candidate'));
const sourceSha = arg('--source-sha', 'f2a9e79a75fd1f930c1bf7eb04498ab69e87bfed');
const { verifyRuntimeBuild, hash } = await import(pathToFileURL(path.join(root, 'scripts/lib/inkwave-runtime-evidence.mjs')).href);
const manifest = verifyRuntimeBuild(site, root, sourceSha);
assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash);
const output = path.resolve(arg('--out', '/workspace/render-1565/.ci-scratch/1565/normal-codegen'));
if (fs.existsSync(path.join(output, 'normal-codegen.json'))) throw Error('Fresh --out required');
if (['/tmp', '/var/tmp', '/dev/shm'].some(p => output === p || output.startsWith(p + '/'))) throw Error('Persistent output required');
fs.mkdirSync(output, { recursive: true });
const browserTemp = path.resolve(arg('--browser-temp', path.join(root, '.ci-scratch/np')));
if (Buffer.byteLength(browserTemp) + 48 >= 108 || ['/tmp', '/var/tmp', '/dev/shm'].some(p => browserTemp === p || browserTemp.startsWith(p + '/'))) throw Error('Short persistent browser temp required');
fs.mkdirSync(browserTemp, { recursive: true });
for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = browserTemp;
const width = Number(arg('--width', '480')), height = Number(arg('--height', '300'));
const warmup = Number(arg('--warmup', '12')), batch = Number(arg('--batch', '8')), cycles = Number(arg('--cycles', '2'));
if (![width, height, warmup, batch, cycles].every(v => Number.isSafeInteger(v) && v > 0) || warmup < 12 || batch < 4) throw Error('Require positive dimensions, warmup >=12, batch >=4');
const selected = arg('--variants', 'current,vec4-final,mat3-no-sign,vec4-folded,conditional-original').split(',');
const allowed = ['current', 'vec4-final', 'mat3-no-sign', 'vec4-folded', 'conditional-original'];
if (!selected.length || selected.some(v => !allowed.includes(v)) || new Set(selected).size !== selected.length) throw Error('Unknown/duplicate --variants');
const loaded = new Set(), errors = [];
const result = { status: 'prepared', sourceSha, inputHash: manifest.inputHash, contentHash: manifest.contentHash,
  harnessSha256: hash(fs.readFileSync(new URL(import.meta.url))), argv: process.argv,
  environment: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, node: process.version },
  config: { width, height, warmup, batch, cycles, selected, order: 'ABBA / BAAB, repeated per comparison' },
  scope: 'Single Chromium realm/context. Actual frozen native Scorch ink overlay, original geometry/index/atlas/texlib/uniforms/lights. Stage depth prefilled once; other world draws hidden; original depth retained. Test-material shader strings vary only in the normal expression. No simulation, postprocessing or shadow-map updates inside timed batches.',
  limitations: ['Software SwiftShader diagnostics only; no hardware, full-frame pacing or adoption inference.',
    'One material/scene/camera/painted workload; shader compiler sensitivity and unrelated whole-game costs remain separate.',
    'Both materials and all programs are resident/warmed; this excludes shader compilation and load costs.',
    'GPU elapsed queries are software-driver durations. Missing/disjoint results invalidate GPU summaries.',
    'Color is cleared before each overlay draw, keeping the same prefilled world depth; this is not a final game image.'], errors };
const save = () => fs.writeFileSync(path.join(output, 'normal-codegen.json'), JSON.stringify(result, null, 2) + '\n');
save();
fs.writeFileSync(path.join(output, 'probe-inkwave-normal-codegen.mjs'), fs.readFileSync(new URL(import.meta.url)));
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'), key = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    const file = fs.realpathSync(path.resolve(site, key));
    if (!file.startsWith(fs.realpathSync(site) + '/')) throw Error('Path escape');
    const bytes = fs.readFileSync(file);
    if (key !== 'inkwave-build.json' && (!manifest.artifacts[key] || hash(bytes) !== manifest.artifacts[key])) throw Error('Unverified artifact: ' + key);
    loaded.add(key); response.writeHead(200, { 'content-type': mime[path.extname(key)] || 'application/octet-stream' }); response.end(bytes);
  } catch (error) { response.writeHead(404); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(pathToFileURL(arg('--playwright', '/workspace/actions/node_modules/playwright/index.mjs')).href);
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: arg('--chromium', '/usr/bin/chromium'),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  result.environment.browser = browser.version();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'medium', shadows: true, bloom: true, minimap: false, music: .6, sfx: .85, master: .8 }));
    let state = 20261013;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  });
  result.status = 'booting'; save();
  await page.goto('http://127.0.0.1:' + server.address().port + '/?map=scorch', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.evaluate(async () => { globalThis.PG = (await import(new URL('src/core/ctx.js', document.baseURI))).G; });
  await page.waitForFunction(() => { const g = PG.game; if (g) g.frozen = true; return !!(g?.debug && PG.s3?.installed && PG.mode !== 'boot') || !!document.querySelector('#boot-error')?.textContent; }, null, { timeout: 180000 });
  const bootError = await page.locator('#boot-error').textContent(); if (bootError) throw Error(bootError);
  await page.waitForFunction(() => globalThis.__inkwaveStartup?.report?.cache?.offlineReady === true && navigator.serviceWorker?.controller?.state === 'activated', null, { timeout: 180000 });
  result.status = 'preparing-frozen-overlay'; save();
  result.setup = await page.evaluate(async () => {
    const G = PG, g = G.game; g.debug.freeze(); g.menus.wipe.cancel();
    await g.startMatch({ mapId: 'scorch', mode: 'turf', difficulty: 'normal', duration: 180 }); g.debug.freeze();
    await Promise.all(G.actors.map(a => a.character._sourceMotionLoader));
    g.R.setDynamicScale(1); g._skipRender = true; g.s3Clock?.reset();
    for (let i = 0; i < 330; i++) g._frame(1 / 60);
    const nodes = G.nav.nodes.filter(n => Number.isFinite(n.y)).sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z || a.id - b.id);
    const anchor = nodes[0], near = nodes.filter(n => Math.abs(n.y - anchor.y) < .5 && Math.hypot(n.x - anchor.x, n.z - anchor.z) < 5).slice(0, 8);
    if (near.length !== 8) throw Error('Native node fixture unavailable');
    const center = { x: near.reduce((s, n) => s + n.x, 0) / 8, y: near.reduce((s, n) => s + n.y, 0) / 8, z: near.reduce((s, n) => s + n.z, 0) / 8 };
    for (let i = 0; i < 8; i++) {
      const a = G.actors[i], n = near[i]; a.setWeapon('shooter'); a.spawnAt(a.pos.clone().set(n.x, n.y + .05, n.z), 0);
      const outward = () => { a.intent.move.set(0, 0, 0); a.intent.fire = true; a.intent.squid = a.intent.jump = a.intent.sub = a.intent.special = false; a.aimYaw = Math.atan2(a.pos.x - center.x, a.pos.z - center.z); a.aimPitch = -.6; a.aimPoint.set(a.pos.x + Math.sin(a.aimYaw) * 4, center.y, a.pos.z + Math.cos(a.aimYaw) * 4); };
      if (a.bot) { const update = a.bot.update; a.bot.update = function (...args) { const out = update.apply(this, args); outward(); return out; }; }
      else { const update = g.match.controller.update; g.match.controller.update = function (...args) { const out = update.apply(this, args); outward(); return out; }; const aim = g.match.controller.computeAim; g.match.controller.computeAim = function (...args) { const out = aim.apply(this, args); outward(); return out; }; }
    }
    for (let i = 0; i < 60; i++) g._frame(1 / 60);
    G.paint.flush(0); G.camera.position.set(center.x, center.y + 12, center.z - 12); G.camera.lookAt(center.x, center.y + 1, center.z); G.camera.updateMatrixWorld();
    if (!G.level.native || !g.levelMesh?.chunks?.length || !g.levelMat?.userData?.uniforms?.tNormal) throw Error('Expected actual native ink / texlib path');
    const r = G.renderer, gl = r.getContext(), ink = g.levelMesh, savedBackground = G.scene.background;
    // Prefill the real stage depth once; the transparent overlay never writes it.
    ink.visible = false; r.autoClear = true; r.render(G.scene, G.camera); gl.finish(); ink.visible = true;
    const hidden = [];
    G.scene.traverse(o => { if (o !== ink && o.material) { hidden.push([o, o.visible]); o.visible = false; } });
    G.scene.background = null; r.autoClear = false; r.info.autoReset = false; r.shadowMap.autoUpdate = false; r.setClearColor(0x20242b, 1);
    globalThis.normalProbe = { G, g, r, gl, ink, base: ink.material, hidden, savedBackground };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { native: G.level.native, texlib: !!g.levelMat.userData.uniforms.tNormal, paintCounts: Array.from(G.paint.counts), atlas: G.paint.size,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      geometryVertices: ink.geometry.attributes.position.count, chunks: ink.chunks.length, materialSide: ink.material.side, camera: G.camera.position.toArray(),
      nativeMaterialKey: ink.material.customProgramCacheKey(), nativeDepthWrite: ink.material.depthWrite };
  });
  if (!/SwiftShader/i.test(result.setup.renderer) || !result.setup.paintCounts.some(v => v > 0) || result.setup.materialSide !== 0) throw Error('Expected software renderer, FrontSide overlay and nonempty real paint');
  result.status = 'measuring'; save();
  result.probe = await page.evaluate(async ({ selected, warmup, batch, cycles }) => {
    const P = normalProbe, { G, r, gl, ink, base } = P;
    const old = 'vec3 wn = normalize(nBase - slope.x * T - slope.y * Bt);\nnormal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);';
    const expressions = {
      original: old,
      current: 'normal = normalize(mat3(viewMatrix) * (nBase - slope.x * T - slope.y * Bt)) * faceDirection;',
      'vec4-final': 'normal = normalize((viewMatrix * vec4(nBase - slope.x * T - slope.y * Bt, 0.0)).xyz) * faceDirection;',
      'mat3-no-sign': 'normal = normalize(mat3(viewMatrix) * (nBase - slope.x * T - slope.y * Bt));',
      'vec4-folded': 'normal = normalize((viewMatrix * vec4((nBase - slope.x * T - slope.y * Bt) * faceDirection, 0.0)).xyz);',
      'conditional-original': old + '\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif',
    };
    const connection = /normal\s*=\s*normalize\(mat3\(viewMatrix\)\s*\*\s*\(nBase\s*-\s*slope\.x\s*\*\s*T\s*-\s*slope\.y\s*\*\s*Bt\)\)\s*\*\s*faceDirection\s*;/;
    const originalConnection = /vec3 wn\s*=\s*normalize\(nBase\s*-\s*slope\.x\s*\*\s*T\s*-\s*slope\.y\s*\*\s*Bt\);\s*normal\s*=\s*normalize\(\(viewMatrix\s*\*\s*vec4\(wn,\s*0\.0\)\)\.xyz\);/;
    const materials = {}, templates = {}, gpuSources = {}, warm = [], errorChecks = [];
    const checkError = stage => { const codes = []; for (let code = gl.getError(); code !== gl.NO_ERROR; code = gl.getError()) codes.push(code); errorChecks.push({ stage, codes }); if (codes.length) throw Error('WebGL error at ' + stage + ': ' + codes.join(',')); };
    checkError('before-probe-materials');
    // Capture actual expanded GLSL at the live shaderSource call, passing the
    // exact string through. Three deletes shader handles after linking; do not
    // query those deleted handles or invoke the optional translated getter.
    const shaderSource = gl.shaderSource; let compilingName = null;
    gl.shaderSource = function (shader, source) { if (compilingName && source.includes('gl_FragColor')) gpuSources[compilingName] = { expandedGLSL: source, translated: null, translatedUnavailable: 'Not queried: diagnostic deleted-shader getters were removed; no driver assembly claim.' }; return shaderSource.call(this, shader, source); };
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const resource = () => ({ geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs.length });
    let gpuCalls = 0, gpuVertices = 0;
    const arrays = gl.drawArrays, elements = gl.drawElements;
    gl.drawArrays = function (...args) { gpuCalls++; gpuVertices += args[2]; return arrays.apply(this, args); };
    gl.drawElements = function (...args) { gpuCalls++; gpuVertices += args[1]; return elements.apply(this, args); };
    const draw = name => { ink.material = materials[name]; r.clear(true, false, false); r.render(G.scene, G.camera); };
    const read = () => { const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const difference = (a, b) => { let changedPixels = 0, maxChannelError = 0; for (let i = 0; i < a.length; i += 4) { let changed = false; for (let k = 0; k < 4; k++) { const d = Math.abs(a[i + k] - b[i + k]); changed ||= d > 0; maxChannelError = Math.max(maxChannelError, d); } changedPixels += changed; } return { pixels: a.length / 4, changedPixels, maxChannelError }; };
    const pixels = {}, images = {};
    for (const name of ['original', ...selected]) {
      const material = base.clone(); material.userData = base.userData; material.onBeforeRender = base.onBeforeRender;
      material.customProgramCacheKey = () => base.customProgramCacheKey() + '-normal-codegen-' + name;
      material.onBeforeCompile = shader => { base.onBeforeCompile(shader); const match = connection.test(shader.fragmentShader) ? connection : originalConnection; if (!match.test(shader.fragmentShader)) throw Error('Normal expression connection missing'); shader.fragmentShader = shader.fragmentShader.replace(match, expressions[name]); templates[name] = shader.fragmentShader; };
      materials[name] = material; const t = performance.now(); compilingName = name; checkError('before-warm-' + name);
      for (let i = 0; i < warmup; i++) draw(name);
      gl.finish(); pixels[name] = read(); images[name] = r.domElement.toDataURL();
      checkError('after-warm-readback-' + name);
      warm.push({ name, draws: warmup, elapsedMs: performance.now() - t, resources: resource() });
    }
    compilingName = null; gl.shaderSource = shaderSource; checkError('after-all-warm-capture');
    const fixedResources = resource(), geometry = ink.geometry, indexVersion = geometry.index.version;
    const expectedDrawRange = { ...geometry.drawRange }, originalPixels = pixels.original;
    const pixelComparisons = selected.map(name => ({ name, ...difference(originalPixels, pixels[name]) }));
    if (pixelComparisons.some(row => row.maxChannelError > 1)) throw Error('Normal variant changed image by more than 1/255');
    let visiblePixels = 0;
    for (let i = 0; i < originalPixels.length; i += 4) if (originalPixels[i] !== originalPixels[0] || originalPixels[i + 1] !== originalPixels[1] || originalPixels[i + 2] !== originalPixels[2]) visiblePixels++;
    if (visiblePixels < 100) throw Error('Frozen real painted overlay is absent');
    const gpuResult = async (query, preDisjoint) => {
      if (!query) return { supported: false, valid: false };
      const deadline = performance.now() + 30000;
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE), disjoint = preDisjoint || !!gl.getParameter(timer.GPU_DISJOINT_EXT);
      const nanoseconds = available ? gl.getQueryParameter(query, gl.QUERY_RESULT) : null; gl.deleteQuery(query);
      return { supported: true, available, disjoint, valid: available && !disjoint && Number.isFinite(nanoseconds), milliseconds: available && !disjoint ? nanoseconds / 1e6 : null };
    };
    const rows = [], completionPixel = new Uint8Array(4);
    for (const variant of selected) for (let cycle = 0; cycle < cycles; cycle++) for (const [ordinal, label] of ['A', 'B', 'B', 'A', 'B', 'A', 'A', 'B'].entries()) {
      const name = label === 'A' ? 'original' : variant;
      gl.finish(); r.info.reset(); gpuCalls = gpuVertices = 0; checkError('before-query-' + variant + '-' + cycle + '-' + ordinal);
      const query = timer ? gl.createQuery() : null, preDisjoint = timer ? !!gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      checkError('after-query-begin-' + variant + '-' + cycle + '-' + ordinal);
      const start = performance.now();
      for (let i = 0; i < batch; i++) draw(name);
      const submit = performance.now(); checkError('after-batch-draws-' + variant + '-' + cycle + '-' + ordinal);
      if (query) gl.endQuery(timer.TIME_ELAPSED_EXT); checkError('after-query-end-' + variant + '-' + cycle + '-' + ordinal);
      gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, completionPixel); const complete = performance.now();
      checkError('after-completion-readback-' + variant + '-' + cycle + '-' + ordinal);
      const gpu = await gpuResult(query, preDisjoint), resources = resource();
      checkError('after-query-result-' + variant + '-' + cycle + '-' + ordinal);
      const row = { variant, cycle, ordinal, label, name, batch, submitMs: submit - start, completedMs: complete - start,
        completedPerDrawMs: (complete - start) / batch, gpu, calls: r.info.render.calls, triangles: r.info.render.triangles, gpuCalls, gpuVertices, resources,
        sameGeometry: ink.geometry === geometry, sameIndexVersion: geometry.index.version === indexVersion, sameDrawRange: JSON.stringify(geometry.drawRange) === JSON.stringify(expectedDrawRange) };
      rows.push(row);
      if (JSON.stringify(resources) !== JSON.stringify(fixedResources) || !row.sameGeometry || !row.sameIndexVersion || !row.sameDrawRange
          || row.calls !== batch || row.gpuCalls !== batch || row.gpuVertices !== expectedDrawRange.count * batch
          || row.triangles * 3 !== expectedDrawRange.count * batch) throw Error('Draw/geometry/resource workload changed');
    }
    draw('original'); gl.finish(); const repeat = difference(originalPixels, read());
    if (repeat.changedPixels !== 0) throw Error('Frozen original pixels changed during measurements');
    const webglError = gl.getError(); gl.drawArrays = arrays; gl.drawElements = elements; ink.material = base;
    Object.values(materials).forEach(material => material.dispose());
    return { warm, pixelComparisons, visiblePixels, fixedResources, expectedDrawRange, rows, repeat, webglError, errorChecks, templates, gpuSources, images,
      paintCounts: Array.from(G.paint.counts), sourceGeometryVertices: geometry.attributes.position.count, timerSupported: !!timer };
  }, { selected, warmup, batch, cycles });
  assert.equal(result.probe.webglError, 0); assert.equal(errors.length, 0, errors.join('\n'));
  for (const [name, template] of Object.entries(result.probe.templates)) { const file = name + '-shader-template.glsl'; fs.writeFileSync(path.join(output, file), template); result.probe.templates[name] = { file, sha256: hash(template) }; }
  for (const [name, sources] of Object.entries(result.probe.gpuSources)) if (sources) for (const kind of ['expandedGLSL', 'translated']) if (sources[kind]) { const source = sources[kind], file = name + '-' + kind + '.glsl'; fs.writeFileSync(path.join(output, file), source); result.probe.gpuSources[name][kind] = { file, sha256: hash(source) }; }
  for (const [name, image] of Object.entries(result.probe.images)) { const bytes = Buffer.from(image.split(',')[1], 'base64'), file = name + '.png'; fs.writeFileSync(path.join(output, file), bytes); result.probe.images[name] = { file, sha256: hash(bytes) }; }
  const stats = values => { const sorted = values.slice().sort((a, b) => a - b); return { n: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p50: sorted[Math.floor(sorted.length * .5)], min: sorted[0], max: sorted.at(-1), samples: values }; };
  result.summary = Object.fromEntries(selected.map(variant => [variant, Object.fromEntries(['A', 'B'].map(label => { const rows = result.probe.rows.filter(row => row.variant === variant && row.label === label); const completeGpu = rows.every(row => row.gpu.valid); return [label, { completedPerDraw: stats(rows.map(row => row.completedPerDrawMs)), gpuComplete: completeGpu, gpuPerDraw: completeGpu ? stats(rows.map(row => row.gpu.milliseconds / row.batch)) : null }]; }))]));
  result.status = 'passed-diagnostic-only';
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally { result.loadedArtifacts = [...loaded]; save(); await browser?.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ status: result.status, error: result.error, summary: result.summary, evidence: output })); }
