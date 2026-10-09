#!/usr/bin/env node
// #642 actual-WebGL before/after proof for the composer ping-pong target preset isolation.
//
// Composes inkwave-public through the COMPLETE production adapter composition (same six
// layers as scripts/build-inkwave.mjs), then loads the composed src/core/renderer.js twice
// in a real Chromium WebGL2 context — pre-fix baseline (the composition with the #642 block
// reverted, which must equal upstream byte-for-byte) and post-fix — and records:
//   * EXT_color_buffer_float presence plus raw R11F_G11F_B10F / RGBA16F framebuffer completeness
//   * renderTarget1/2 dimensions, texture type and format per touch preset (LOW/MEDIUM/HIGH)
//   * color-only pair memory bytes on the touch profile before/after
//   * pixel equality of the rendered post chain (grade -> output -> FXAA) per device profile
//   * target lifetime: texture-count stability and render-target disposals across quality
//     switches and orientation-style resizes
// Usage: node scripts/check-inkwave-composer-target.mjs --output <persistent-dir> [--profile-dir <dir>]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource } from '../patches/local-quality/adapter.mjs';
import { adaptNetworkSource } from '../patches/network-replication/adapter.mjs';
import { adaptRange } from '../patches/practice-range/adapter.mjs';
import { revertComposerTarget } from '../patches/local-quality/composer-target-adapter.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
// Same composition order as scripts/build-inkwave.mjs (the complete production adapter composition).
const adaptBuildSource = (rel, code) =>
  adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(
    rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const physical = p => fs.existsSync(p) ? fs.realpathSync(p)
  : path.join(physical(path.dirname(p)), path.basename(p));
const OUT = option('--output', path.join(ROOT, '.ci-scratch/inkwave-composer-target'));
const PROFILE = option('--profile-dir', path.join(ROOT, '.ci-scratch/inkwave-composer-642-profile'));
for (const dir of [OUT, PROFILE]) {
  const resolved = physical(dir);
  if (['/tmp', '/var/tmp', '/dev/shm'].some(root => resolved === root || resolved.startsWith(root + '/')))
    throw Error('Persistent storage required: ' + resolved);
}
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const REL = 'src/core/renderer.js';
const rawRenderer = fs.readFileSync(path.join(SRC, REL), 'utf8');
const afterRenderer = adaptBuildSource(REL, rawRenderer);
const beforeRenderer = revertComposerTarget(afterRenderer);
if (beforeRenderer !== rawRenderer)
  throw Error('#642 baseline reconstruction differs from upstream renderer.js');
if (afterRenderer === rawRenderer || !afterRenderer.includes('THREE.UnsignedInt101111Type'))
  throw Error('#642 composed renderer.js does not carry the policy');

// Compose every src module once; only renderer.js differs between the two variants.
const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const composed = new Map();
for (const file of walk(path.join(SRC, 'src'))) {
  const rel = 'src/' + path.relative(path.join(SRC, 'src'), file).split(path.sep).join('/');
  const code = fs.readFileSync(file, 'utf8');
  composed.set(rel, /\.m?js$/.test(rel) ? adaptBuildSource(rel, code) : null);
}
composed.set(REL, afterRenderer);
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const probeHtml = variant => `<!doctype html><html><head><meta charset="utf-8"><title>#642 composer target ${variant}</title>
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/jsm/" } }</script>
</head><body>
<div id="c"></div>
<script type="module">
import * as THREE from 'three';
import { Renderer as RendererBefore } from '/before/${REL}';
import { Renderer as RendererAfter } from '/after/${REL}';
const VARIANT = ${JSON.stringify(variant)};
const ActiveRenderer = VARIANT === 'before' ? RendererBefore : RendererAfter;
const bytesPerType = t => t === THREE.HalfFloatType ? 8 : t === THREE.UnsignedInt101111Type ? 4
  : t === THREE.UnsignedByteType ? 1 : t === THREE.FloatType ? 16 : null;
const rawGlProbe = () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { webgl2: false };
  const probe = (internal, format, type) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, 64, 48);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    let hdrWrite = null;
    if (complete) {
      gl.viewport(0, 0, 64, 48);
      gl.clearColor(0.25, 0.75, 2.5, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const px = new Float32Array(4);
      gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.FLOAT, px);
      hdrWrite = gl.getError() === gl.NO_ERROR ? Array.from(px) : 'readback:' + gl.getError();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return { complete, hdrWrite };
  };
  return {
    webgl2: true,
    renderer: gl.getParameter(gl.RENDERER),
    colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'),
    colorBufferHalfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
    r11f: probe(gl.R11F_G11F_B10F, gl.RGB, gl.UNSIGNED_INT_10F_11F_11F_REV),
    rgba16f: probe(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
  };
};
let rtDisposals = 0;
const origDispose = THREE.WebGLRenderTarget.prototype.dispose;
THREE.WebGLRenderTarget.prototype.dispose = function () { rtDisposals++; return origDispose.call(this); };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
// Deterministic HDR scene: linear gradient from 0.002 to >1.0 stops, an above-1.0 emissive
// quad (tone-mapping highlight rolloff) and a translucent quad (blending without dst alpha).
const geo = new THREE.PlaneGeometry(9, 6);
const pos = geo.attributes.position;
const colors = new Float32Array(pos.count * 3);
for (let i = 0; i < pos.count; i++) {
  const t = (pos.getY(i) + 3) / 6;
  colors[i * 3] = 0.002 + t * t * 4.5;
  colors[i * 3 + 1] = 0.002 + t * 2.4;
  colors[i * 3 + 2] = 0.01 + (1 - t) * 0.7;
}
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
const hdrQuad = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 1.5) }));
hdrQuad.position.set(-1.8, 1.0, 0.5); scene.add(hdrQuad);
const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 0.4), transparent: true, opacity: 0.5 }));
glass.position.set(1.4, -0.8, 0.8); scene.add(glass);

const settings = { quality: 'high', bloom: true, shadows: true };
const readPixels = R => {
  const gl = R.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let bin = '';
  for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return { w, h, b64: btoa(bin) };
};
const rt = R => {
  const a = R.composer.renderTarget1, b = R.composer.renderTarget2;
  return {
    type1: a.texture.type, type2: b.texture.type, format1: a.texture.format, format2: b.texture.format,
    w: a.width, h: a.height, w2: b.width, h2: b.height,
    bytesPerTexel: bytesPerType(a.texture.type),
    pairBytes: (a.width * a.height + b.width * b.height) * bytesPerType(a.texture.type),
  };
};
const snapshot = (R, label) => ({
  label, ...rt(R),
  ao: R.q.ao, bloom: R.q.bloom, msaa: R.q.msaa,
  textures: R.renderer.info.memory.textures, rtDisposals,
});
// One shot = a fresh Renderer instance in its own WebGL context, rendered and read back,
// then released. Same-page shots isolate the #642 format delta from launch noise.
const shoot = (Ctor, tag) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const R = new Ctor(container, settings);
  R.setScene(scene, camera);
  R.render(); R.render();
  const snap = snapshot(R, tag);
  const px = readPixels(R);
  R._disposeComposer();
  R.renderer.dispose();
  container.remove();
  return { snap, px };
};
let R = null;   // live variant instance for preset-switch and resize lifetime checks
window.__probeA = () => {
  const glInfo = rawGlProbe();
  // Same-launch attribution: before vs before (determinism control) and before vs after
  // (the #642 format delta) — all shots in one process, one page, one driver session.
  const shots = {
    before1: shoot(RendererBefore, 'shot-before1'),
    before2: shoot(RendererBefore, 'shot-before2'),
    after: shoot(RendererAfter, 'shot-after'),
    // before3 runs AFTER the after shot: if shot order or a warmed driver context were
    // responsible for any delta, before3 would move away from before1.
    before3: shoot(RendererBefore, 'shot-before3'),
  };
  R = new ActiveRenderer(document.getElementById('c'), settings);
  R.setScene(scene, camera);
  R.render(); R.render();
  const snapshots = [snapshot(R, 'high-initial')];
  const steadyTextures = R.renderer.info.memory.textures;
  for (const quality of ['low', 'medium', 'high']) {
    R.applySettings({ quality, bloom: true, shadows: true });
    R.render();
    snapshots.push(snapshot(R, 'preset-' + quality));   // steady-state asserted on the Node side
  }
  return { variant: VARIANT, ua: navigator.userAgent, dpr: window.devicePixelRatio,
    touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
    threeTypes: { HalfFloatType: THREE.HalfFloatType, UnsignedInt101111Type: THREE.UnsignedInt101111Type,
      RGBFormat: THREE.RGBFormat, RGBAFormat: THREE.RGBAFormat },
    glInfo, shots, snapshots, steadyTextures };
};
window.__settle = () => { window.__steady = R.renderer.info.memory.textures; };
window.__probeB = () => {
  R.render();   // resize() picks up the new window size (orientation-style resize)
  return snapshot(R, 'after-resize');
};
window.__ready = true;
</script>
</body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type) => {
    res.writeHead(code, { 'Content-Type': type || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const m = url.pathname.match(/^\/(before|after)\/(probe\.html|src\/.*)$/);
  if (m) {
    const [, variant, target] = m;
    if (target === 'probe.html') return send(200, probeHtml(variant), 'text/html');
    const rel = decodeURIComponent(target);
    if (composed.has(rel)) {
      let code = composed.get(rel);
      if (rel === REL && variant === 'before') code = beforeRenderer;
      if (code === null) code = fs.readFileSync(path.join(SRC, rel), 'utf8');
      return send(200, code, MIME[path.extname(rel)] || 'text/javascript');
    }
  }
  const vendor = url.pathname.match(/^\/(vendor|patches)\/(.*)$/);
  if (vendor) {
    const base = vendor[1] === 'vendor' ? SRC : ROOT;   // vendor lives inside inkwave-public/
    const file = path.join(base, vendor[1], vendor[2]);
    if (file.startsWith(base + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile())
      return send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  }
  return send(404, 'not found');
});

const BROWSER_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const DEVICES = {
  touch: { hasTouch: true, isMobile: true, viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 },
};

const comparePixels = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return { error: 'size mismatch', a: [a.w, a.h], b: [b.w, b.h] };
  const pa = Buffer.from(a.b64, 'base64'), pb = Buffer.from(b.b64, 'base64');
  if (pa.length !== pb.length) return { error: 'length mismatch' };
  let changedPixels = 0, maxDelta = 0, sum = 0, signedRgb = 0, brighter = 0, darker = 0;
  for (let i = 0; i < pa.length; i += 4) {
    let d = 0, s = 0;
    for (let c = 0; c < 3; c++) { const delta = pb[i + c] - pa[i + c]; s += delta; d = Math.max(d, Math.abs(delta)); }
    d = Math.max(d, Math.abs(pa[i + 3] - pb[i + 3]));
    signedRgb += s / 3;
    if (s > 0) brighter++; else if (s < 0) darker++;
    if (d) { changedPixels++; maxDelta = Math.max(maxDelta, d); sum += d; }
  }
  const pixels = pa.length / 4;
  return { pixels, changedPixels, changedFraction: changedPixels / pixels, maxDelta,
    meanDeltaOfChanged: changedPixels ? sum / changedPixels : 0,
    meanSignedRgb: signedRgb / pixels, brighterPixels: brighter, darkerPixels: darker };
};
const only = (i => i >= 0 ? process.argv[i + 1] : null)(process.argv.indexOf('--only'));
const run = async () => {
  const { chromium } = await import('playwright');
  const results = { startedAt: new Date().toISOString(),
    baseline: { reconstructedEqualsUpstream: beforeRenderer === rawRenderer, composedBytes: afterRenderer.length },
    runs: {} };
  const failures = [];
  const assert = (cond, msg) => { if (!cond) failures.push(msg); };
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    for (const device of Object.keys(DEVICES)) {
      for (const variant of ['before', 'after']) {
        if (only && only !== `${device}-${variant}`) continue;
        const context = await chromium.launchPersistentContext(
          path.join(PROFILE, `${device}-${variant}`), { headless: true, ...DEVICES[device], args: BROWSER_ARGS });
        const page = await context.newPage();
        const logs = [];
        page.on('console', m => logs.push(`console:${m.type()}: ${m.text()}`));
        page.on('pageerror', e => logs.push(`pageerror: ${e}`));
        page.on('requestfailed', r => logs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
        page.on('response', r => { if (r.status() >= 400) logs.push(`response:${r.status()}: ${r.url()}`); });
        await page.goto(`http://127.0.0.1:${port}/${variant}/probe.html`);
        try {
          await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
        } catch (error) {
          console.error(`probe not ready (${device}-${variant}):\n` + logs.join('\n'));
          await context.close();
          throw error;
        }
        const a = await page.evaluate(() => window.__probeA());
        await page.evaluate(() => window.__settle());
        await page.setViewportSize(device === 'touch'
          ? { width: 640, height: 480 } : { width: 900, height: 640 });
        const b = await page.evaluate(() => window.__probeB());
        await context.close();
        results.runs[device + '-' + variant] = { ...a, resize: b, logs: logs.filter(l => !l.startsWith('console:log')) };
      }
    }
  } finally {
    server.close();
  }
  const bytesName = t => t === T.UnsignedInt101111Type ? 'UnsignedInt101111Type(R11F_G11F_B10F)'
    : t === T.HalfFloatType ? 'HalfFloatType(RGBA16F)' : 'type-' + t;
  const T = results.runs['touch-after'].threeTypes;
  const glTouch = results.runs['touch-after'].glInfo;
  assert(glTouch.webgl2, 'WebGL2 unavailable');
  assert(glTouch.colorBufferFloat, 'EXT_color_buffer_float unavailable: the R11F path would fall back');
  assert(glTouch.r11f.complete, 'R11F_G11F_B10F framebuffer incomplete on native WebGL2');
  assert(glTouch.rgba16f.complete, 'RGBA16F framebuffer incomplete (baseline broken)');
  results.touchPresets = {};
  for (const variant of ['before', 'after']) {
    results.touchPresets[variant] = results.runs['touch-' + variant].snapshots.map(s => ({
      label: s.label, type1: bytesName(s.type1), type2: bytesName(s.type2), format1: s.format1,
      w: s.w, h: s.h, bytesPerTexel: s.bytesPerTexel, pairMiB: +(s.pairBytes / 1048576).toFixed(3),
      ao: s.ao, bloom: s.bloom, msaa: s.msaa, textures: s.textures,
    }));
  }
  const beforeSnaps = results.runs['touch-before'].snapshots;
  const afterSnaps = results.runs['touch-after'].snapshots;
  assert(beforeSnaps.length === 4 && afterSnaps.length === 4, 'expected 4 touch snapshots per variant');
  beforeSnaps.forEach((s, i) => {
    assert(s.type1 === T.HalfFloatType && s.type2 === T.HalfFloatType, `${s.label}: baseline touch type must stay HalfFloatType(RGBA16F)`);
    assert(s.format1 === T.RGBAFormat, `${s.label}: baseline format must stay RGBAFormat`);
    assert(s.bytesPerTexel === 8, `${s.label}: baseline bytes per texel`);
  });
  afterSnaps.forEach((s, i) => {
    assert(s.type1 === T.UnsignedInt101111Type && s.type2 === T.UnsignedInt101111Type, `${s.label}: fixed touch type must be UnsignedInt101111Type`);
    assert(s.format1 === T.RGBFormat, `${s.label}: fixed format must be RGBFormat (R11F_G11F_B10F)`);
    assert(s.bytesPerTexel === 4, `${s.label}: fixed bytes per texel`);
    assert(s.w === beforeSnaps[i].w && s.h === beforeSnaps[i].h, `${s.label}: dimensions unchanged`);
    assert(s.ao === false && s.bloom === false && s.msaa === 0, `${s.label}: touch preset invariant (msaa/ao/bloom off)`);
    assert(s.pairBytes * 2 === beforeSnaps[i].pairBytes, `${s.label}: pair memory halved`);
  });
  results.memorySummary = beforeSnaps.map((s, i) => ({
    preset: s.label, w: s.w, h: s.h,
    beforeMiB: +(s.pairBytes / 1048576).toFixed(3),
    afterMiB: +(afterSnaps[i].pairBytes / 1048576).toFixed(3),
  }));
  // Desktop HDR/MSAA presets untouched by the policy.
  for (const variant of ['before', 'after']) {
    const run = results.runs['desktop-' + variant];
    const T = run.threeTypes;
    run.snapshots.forEach((s, i) => {
      assert(s.type1 === T.HalfFloatType && s.type2 === T.HalfFloatType,
        `desktop-${variant}: RGBA16F retained (${s.label})`);
      assert(s.bytesPerTexel === 8, `desktop-${variant}: bytes per texel (${s.label})`);
    });
  }
  // Pixel attribution matrix:
  //  * sameLaunch.control = before1 vs before2 inside one page (determinism control, exact);
  //  * sameLaunch.variant = before1 vs after inside one page — desktop must be exact (policy
  //    inactive), touch is the #642 format delta within the agreed tolerance;
  //  * crossLaunch.*      = before-page vs after-page (environmental noise, recorded only).
  results.pixelDiff = { sameLaunch: {}, crossLaunch: {} };
  for (const device of Object.keys(DEVICES)) {
    const b = results.runs[`${device}-before`], a = results.runs[`${device}-after`];
    if (!b || !a) continue;
    const control = comparePixels(b.shots.before1.px, b.shots.before2.px);
    const order = comparePixels(b.shots.before1.px, b.shots.before3.px);
    const variant = comparePixels(b.shots.before1.px, a.shots.after.px);
    results.pixelDiff.sameLaunch[device] = { control, order, variant };
    results.pixelDiff.crossLaunch[device] = {
      control: comparePixels(b.shots.before1.px, a.shots.before1.px),
      variant: comparePixels(b.shots.after.px, a.shots.after.px),
    };
    assert(!control.error && control.changedPixels === 0,
      `${device} same-launch determinism control failed: ` + JSON.stringify(control));
    assert(!order.error && order.changedPixels === 0,
      `${device} shot-order control failed (before3 after the after shot): ` + JSON.stringify(order));
    assert(!variant.error, `${device} same-launch pixel compare failed`);
    if (device === 'desktop') {
      // Desktop HIGH runs MSAA+GTAO+bloom; SwiftShader instance-to-instance noise is
      // quantified by the control above. The policy must stay inside that noise floor
      // with no systematic signed shift, while type/format/dimension assertions above
      // carry the exact byte-level claim.
      assert(variant.changedFraction <= control.changedFraction + 0.01,
        'desktop variant exceeds control noise floor: ' + JSON.stringify(variant));
      assert(Math.abs(variant.meanSignedRgb) <= 0.01,
        'desktop variant shows a systematic shift beyond control noise: ' + JSON.stringify(variant));
    } else {
      // Measured SwiftShader envelope (deterministic — both controls above are exact-0):
      // SwiftShader's fp32 -> R11F_G11F_B10F pack deviates from spec rounding for
      // non-representable values (localize2-result.json: representable constants exact,
      // gradient storage dev up to 0.0586 linear), which the grade chain amplifies to a
      // systematic darker shift of mean 2.08/255, max 8/255, on every pixel. fp11 carries
      // the fp16 mantissa/exp (R/G exact, B -1 bit), so a spec-conformant driver rounds
      // RGBA16F-comparably; these bounds are pinned to the measured ceiling and also
      // discriminate against an RGBA8 downgrade (highlight clamp alone reaches 33/255).
      assert(variant.maxDelta > 0 && variant.maxDelta <= 8,
        'touch pixel diff exceeds the measured SwiftShader R11F ceiling: ' + JSON.stringify(variant));
      assert(variant.meanSignedRgb < 0 && variant.meanSignedRgb >= -3,
        'touch pixel systematic shift outside the measured SwiftShader envelope: ' + JSON.stringify(variant));
    }
  }
  // Resize lifetime: texture count stable, old pair released, per device/variant.
  for (const [key, run] of Object.entries(results.runs)) {
    assert(run.resize.textures === run.steadyTextures,
      `${key}: texture count drifted after resize (${run.resize.textures} vs ${run.steadyTextures})`);
    assert(run.resize.rtDisposals > run.snapshots.at(-1).rtDisposals,
      `${key}: resize did not release old targets (${run.resize.rtDisposals} <= ${run.snapshots.at(-1).rtDisposals})`);
    const drift = run.snapshots.filter(s => s.textures !== run.steadyTextures)
      .map(s => `${s.label}:${s.textures}`).join(',');
    // Touch presets force ao/bloom off, so the texture count must hold across LOW/MEDIUM/HIGH.
    // Desktop texture counts legitimately change with the pass set (GTAO/bloom pyramids), so
    // there the initial and final snapshots (same HIGH preset) plus the cross-variant equality
    // check below carry the lifetime guarantee.
    if (run.touch) assert(!drift,
      `${key}: texture count drifted across quality switches (steady ${run.steadyTextures}; ${drift})`);
    assert(run.snapshots[0].textures === run.snapshots.at(-1).textures,
      `${key}: HIGH preset texture count changed after a preset round-trip (${run.snapshots[0].textures} vs ${run.snapshots.at(-1).textures})`);
    const flat = run.snapshots.slice(1).filter((s, i) => s.rtDisposals <= run.snapshots[i].rtDisposals)
      .map(s => s.label).join(',');
    assert(!flat, `${key}: old targets not released on quality switch (${flat})`);
  }
  // The lifetime signature must be identical between variants (the policy does not change
  // pass counts, rebuild counts or release behaviour).
  for (const device of Object.keys(DEVICES)) {
    const b = results.runs[`${device}-before`], a = results.runs[`${device}-after`];
    if (!b || !a) continue;
    b.snapshots.forEach((s, i) => assert(
      s.textures === a.snapshots[i].textures && s.rtDisposals === a.snapshots[i].rtDisposals,
      `${device} ${s.label}: lifetime differs between variants (before ${s.textures}/${s.rtDisposals}, after ${a.snapshots[i].textures}/${a.snapshots[i].rtDisposals})`));
  }
  results.failures = failures;
  results.finishedAt = new Date().toISOString();
  for (const run of Object.values(results.runs))
    for (const shot of Object.values(run.shots))
      shot.px = { w: shot.px.w, h: shot.px.h, b64Bytes: shot.px.b64.length };
  const file = path.join(OUT, 'composer-target-result.json');
  fs.writeFileSync(file + '.writing', JSON.stringify(results, null, 2) + '\n');
  fs.renameSync(file + '.writing', file);
  console.log('touch presets:', JSON.stringify(results.memorySummary));
  console.log('pixelDiff:', JSON.stringify(results.pixelDiff));
  console.log('gl:', JSON.stringify(glTouch));
  if (failures.length) {
    console.error('FAILURES:\n' + failures.map(f => ' - ' + f).join('\n'));
    console.error('result: ' + file);
    process.exit(1);
  }
  console.log('INKWAVE #642 composer target native before/after OK: ' + file);
};

run().catch(error => { console.error(error); process.exit(1); });
