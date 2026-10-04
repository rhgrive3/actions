#!/usr/bin/env node
// Actual WebGL proof for resource budgets: depth-only allocation, shadow pixel parity,
// context restore, and native marina reflection cadence. Does not replace rendering.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyWallBuild, wallPixelDifference } from './check-inkwave-wall-render.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = 480, HEIGHT = 360;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const resourcePixelDifference = wallPixelDifference;
export function verifyResourceBuild(site, exactSource = false) {
  const result = verifyWallBuild(site, exactSource);
  const file = 'scripts/check-inkwave-resource-render.mjs';
  if (exactSource) {
    const expected = execFileSync('git', ['rev-parse', 'HEAD:' + file], { cwd: ROOT, encoding: 'utf8' }).trim();
    const actual = execFileSync('git', ['hash-object', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (expected !== actual) throw Error('Resource verifier differs from commit');
  }
  result.source.verifierSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  return result;
}
export function validateResourceResult(result) {
  const names = ['initial', 'dynamic-motion', 'static-demotion', 'stage-roots', 'light-change', 'shadow-resize', 'offscreen-actor', 'after-allocation-probe', 'context-restored'];
  if (result.rows?.length !== names.length || names.some((name, i) => result.rows[i]?.name !== name)) throw Error('Resource shadow denominator');
  if (!result.gpu?.webgl?.startsWith('WebGL 2.0') || !result.gpu.renderer) throw Error('Resource GPU identity missing');
  for (const row of result.rows) {
    const p = row.pixels;
    if (p?.pixels !== WIDTH * HEIGHT || p.changedBytes !== 0 || p.changedPixels !== 0 || p.totalDifference !== 0 || !(row.rebuilds > 0))
      throw Error('Resource shadow pixel mismatch: ' + row.name);
  }
  if (!(result.sensitivity?.changedPixels > 20) || result.contextRestored !== true || result.disposed !== true) throw Error('Resource lifecycle/sensitivity missing');
  if (result.allocations?.length !== 2 || result.allocations.some((a, i) => a.size !== [2048, 4096][i] || a.textures !== 0 || a.complete !== true
      || a.colorAttachment !== 'NONE' || a.depthAttachment !== 'RENDERBUFFER' || a.removedColorBytes !== a.size * a.size * 4)) throw Error('Resource color allocation remains');
  const expected = [['high',false,6,.4],['ultra',false,6,.5],['high',true,3,.2],['ultra',true,3,.2],['low',true,0,0]];
  if (result.reflection?.length !== expected.length || expected.some(([q,t,c,s], i) => {
    const r = result.reflection[i]; return r.quality !== q || r.touch !== t || r.calls !== c || r.frames !== 6
      || r.width !== (c ? Math.max(64, Math.round(WIDTH*s)) : 0) || r.height !== (c ? Math.max(64, Math.round(HEIGHT*s)) : 0);
  })) throw Error('Resource effective reflection budget mismatch');
  return { shadowPixelEqualScenarios: names.length, removedColorMiB: [16,64], touchReflectionCalls: '3/6 frames', contextRestore: true };
}
async function main() {
  const option = name => {
    const i = process.argv.indexOf(name);
    if (i < 0 || !process.argv[i + 1]) throw Error('Required ' + name);
    return path.resolve(process.argv[i + 1]);
  };
  const site = fs.realpathSync(option('--site')), output = option('--evidence-dir'), profileDir = option('--profile-dir');
  const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
  for (const dir of [output, profileDir, os.tmpdir(), process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean)) {
    const resolved = physical(dir);
    if (['/tmp', '/var/tmp', '/dev/shm'].some(root => resolved === root || resolved.startsWith(root + '/')))
      throw Error('Persistent storage required: ' + resolved);
    if (resolved === site || resolved.startsWith(site + '/')) throw Error('Immutable site cannot store evidence/profile/cache');
  }
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(profileDir, { recursive: true });
  const publish = value => {
    const file = path.join(output, 'resource-render-result.json');
    fs.writeFileSync(file + '.writing', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.writing', file);
  };
  const errors = [], loaded = new Map(); let browser, server, page, identity, result, failure;
  const recordError = error => { if (errors.length < 20) errors.push(String(error).slice(0, 1800)); };
  publish({ status: 'running', gate: 'resource-render', startedAt: new Date().toISOString() });
  try {
    identity = verifyResourceBuild(site, process.argv.includes('--exact-source'));
    const { manifest } = identity, prefix = '/_versions/' + manifest.build.revision + '/';
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
    server = http.createServer((req, res) => {
      if (req.url === '/resource-render') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
        return;
      }
      try {
        const file = fs.realpathSync(path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)));
        if (!file.startsWith(site + '/') || !fs.statSync(file).isFile()) throw Error('Missing artifact');
        res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream', 'cache-control': 'no-store' });
        fs.createReadStream(file).pipe(res);
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: WIDTH, height: HEIGHT },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    page = await browser.newPage();
    page.on('pageerror', error => recordError(error.message));
    page.on('console', message => { if (message.type() === 'error') recordError(message.text()); });
    const address = 'http://127.0.0.1:' + server.address().port;
    await page.route(address + '/**', async route => {
      try {
        const response = await route.fetch(), body = await response.body();
        const key = decodeURIComponent(new URL(response.url()).pathname).slice(1);
        if (key !== 'resource-render') {
          if (!manifest.artifacts[key] || hash(body) !== manifest.artifacts[key]) throw Error('Resource loaded artifact mismatch: ' + key);
          loaded.set(key, { path: key, sha256: hash(body), bytes: body.length });
        }
        await route.fulfill({ response, body });
      } catch (error) { recordError(error.message); await route.abort(); }
    });
    await page.goto(address + '/resource-render');
    await page.addScriptTag({ content: 'globalThis.resourcePixelDifference = ' + resourcePixelDifference.toString() + ';' });
    result = await page.evaluate(async ({ prefix, width, height }) => {
      const THREE = await import('three');
      const { G } = await import(prefix + 'src/core/ctx.js');
      const { ShadowCache } = await import(prefix + 'src/core/shadowcache.js');
      const { Environment } = await import(prefix + 'src/world/environment.js');
      const assert = (condition, message) => { if (!condition) throw Error(message); };
      const bounded = (promise, phase) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Resource GPU timeout: ' + phase)), 10000);
        promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
      });
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      document.body.append(renderer.domElement); renderer.setSize(width, height); renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      const gl = renderer.getContext();
      const scene = G.scene = new THREE.Scene(); scene.background = new THREE.Color('#cbd4df'); G.actors = [];
      const camera = new THREE.PerspectiveCamera(42, width / height, .1, 50); camera.position.set(6, 7, 9); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
      const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(4, 8, 3); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .5, far: 25 }); sun.shadow.mapSize.set(512, 512);
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x777777, 1));
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, side: THREE.DoubleSide }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
      const fixed = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshStandardMaterial({ color: 0xc46635 }));
      fixed.position.set(-1.5, 1.5, 0); fixed.castShadow = true; scene.add(fixed);
      const moving = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2260b0 }));
      moving.position.set(2, .5, 0); moving.castShadow = true; scene.add(moving);
      const target = new THREE.WebGLRenderTarget(width, height);
      const cache = new ShadowCache(renderer); cache.setStaticRoots([fixed]);
      const images = [], rows = [], difference = globalThis.resourcePixelDifference;
      const pixels = () => {
        renderer.shadowMap.needsUpdate = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
        const data = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(target, 0, 0, width, height, data); return data;
      };
      const png = (name, data) => {
        const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
        const flipped = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) flipped.set(data.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
        cv.getContext('2d').putImageData(new ImageData(flipped, width, height), 0, 0); images.push({ name, image: cv.toDataURL() });
      };
      const pair = name => {
        globalThis.resourceProbeProgress = { phase: name };
        cache.enabled = false; const full = pixels(); cache.enabled = true; const cached = pixels();
        const d = difference(full, cached); assert(d.changedBytes === 0, name + ' static shadow pixels differ: ' + JSON.stringify(d));
        assert(cache.enabled && cache.cache?.valid(), name + ' cache disabled/fallback');
        assert(gl.getError() === gl.NO_ERROR, name + ' WebGL error');
        png(name + '-cached', cached); rows.push({ name, pixels: d, rebuilds: cache.stats.rebuilds, statics: cache.stats.lastStatic });
        return cached;
      };
      let env;
      try {
        const shadow = pair('initial');
        cache.enabled = false; fixed.castShadow = moving.castShadow = false; const noShadow = pixels();
        fixed.castShadow = moving.castShadow = true; cache.enabled = true;
        const sensitivity = difference(shadow, noShadow); assert(sensitivity.changedPixels > 20, 'shadow test has no visible shadows');
        moving.position.z = 2; pair('dynamic-motion');
        fixed.position.x = 0; pair('static-demotion'); assert(cache.dynamic.has(fixed), 'moved static caster not demoted');
        cache.setStaticRoots([moving]); pair('stage-roots');
        sun.position.x = -3; pair('light-change');
        sun.shadow.mapSize.set(1024, 1024); pair('shadow-resize');
        // Prove the existing offscreen culling decision still excludes only an invisible actor shadow.
        const off = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()); off.castShadow = true; off.position.set(1000, 0, 1000); scene.add(off);
        G.actors = [{ pos: off.position, character: { root: off } }]; pair('offscreen-actor'); assert(cache.stats.skippedActors === 1, 'offscreen actor not culled'); G.actors = []; scene.remove(off); off.geometry.dispose(); off.material.dispose();
        globalThis.resourceProbeProgress = { phase: 'allocation' };
        const allocations = [], nativeCreateTexture = gl.createTexture; let textures = 0;
        gl.createTexture = function (...args) { textures++; return nativeCreateTexture.apply(this, args); };
        try {
          for (const size of [2048, 4096]) {
            assert(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) >= size, 'insufficient actual GPU renderbuffer size');
            cache._ensureCache(size, size, THREE.UnsignedIntType); const c = cache.cache;
            assert(c?.valid() && c.colorBytes === 0, 'missing depth-only framebuffer');
            const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
            gl.bindFramebuffer(gl.FRAMEBUFFER, c.framebuffer);
            const color = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE);
            const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            const depthKind = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
            assert(color === gl.NONE && complete && depthKind === gl.RENDERBUFFER, 'cache framebuffer has color or is incomplete');
            allocations.push({ size, textures, complete, colorAttachment: 'NONE', depthAttachment: 'RENDERBUFFER', removedColorBytes: size * size * 4 });
          }
        } finally { gl.createTexture = nativeCreateTexture; }
        assert(textures === 0, 'private cache allocated a texture'); cache.invalidate(); pair('after-allocation-probe');
        // Native Environment method, real HDR render/mips/clipping. Diagnostic marina scene.
        globalThis.resourceProbeProgress = { phase: 'reflection' };
        env = Object.create(Environment.prototype);
        Object.assign(env, { _marina: true, reflections: true, _frameId: 0, U: { uReflOn: { value: 0 }, uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() } } });
        const nativeRender = renderer.render; let reflectionRenders = 0;
        renderer.render = function (...args) { if (env._reflBusy) reflectionRenders++; return nativeRender.apply(this, args); };
        const reflection = [];
        try {
          for (const [quality, touch, expected] of [['high', false, 6], ['ultra', false, 6], ['high', true, 3], ['ultra', true, 3], ['low', true, 0]]) {
            G.settings = { quality }; G.game = { mobile: { touch } }; const before = reflectionRenders; env.U.uReflOn.value = 0;
            for (let i = 0; i < 6; i++) { env._frameId++; env._renderReflection(renderer, scene, camera); }
            const calls = reflectionRenders - before; assert(calls === expected, 'reflection cadence mismatch ' + quality + '/' + touch + ':' + calls);
            if (expected) {
              const scale = touch ? .2 : quality === 'ultra' ? .5 : .4;
              assert(env._reflRT.width === Math.max(64, Math.round(width * scale)), 'reflection width bypassed effective policy');
              assert(env._reflRT.height === Math.max(64, Math.round(height * scale)), 'reflection height bypassed effective policy');
              const data = new Uint16Array(env._reflRT.width * env._reflRT.height * 4); renderer.readRenderTargetPixels(env._reflRT, 0, 0, env._reflRT.width, env._reflRT.height, data);
              assert(data.some((v, i) => i % 4 === 3 && v > 0), 'reflection pass produced no coverage');
            } else assert(env.U.uReflOn.value === 0, 'low reflection remains enabled');
            reflection.push({ quality, touch, frames: 6, calls, width: expected ? env._reflRT.width : 0, height: expected ? env._reflRT.height : 0 });
          }
          G.settings.quality = 'high'; const before = reflectionRenders; env._marina = false; env._frameId++; env._renderReflection(renderer, scene, camera);
          assert(reflectionRenders === before && !env.U.uReflOn.value, 'non-marina continued work');
          env._marina = true; env._frameId++; env._renderReflection(renderer, scene, camera); assert(reflectionRenders === before + 1, 'return to marina did not refresh');
          const state = { rt: renderer.getRenderTarget(), xr: renderer.xr.enabled, auto: renderer.shadowMap.autoUpdate, need: renderer.shadowMap.needsUpdate };
          env._frameId += 2; env._renderReflection(renderer, scene, camera);
          assert(renderer.getRenderTarget() === state.rt && renderer.xr.enabled === state.xr && renderer.shadowMap.autoUpdate === state.auto && renderer.shadowMap.needsUpdate === state.need, 'reflection leaked renderer state');
        } finally { renderer.render = nativeRender; }
        assert(gl.getError() === gl.NO_ERROR, 'reflection WebGL error');
        // Real context loss/restoration; Three replaces its shadow renderer.
        const loss = gl.getExtension('WEBGL_lose_context'); assert(loss, 'context-loss extension unavailable');
        const lost = new Promise(resolve => renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); resolve(); }, { once: true }));
        globalThis.resourceProbeProgress = { phase: 'context-loss' };
        loss.loseContext(); await bounded(lost, 'context-loss');
        const restored = new Promise(resolve => renderer.domElement.addEventListener('webglcontextrestored', resolve, { once: true }));
        globalThis.resourceProbeProgress = { phase: 'context-restore' };
        loss.restoreContext(); await bounded(restored, 'context-restore');
        assert(cache.dirty && cache.cache === null && renderer.shadowMap.render === cache._depthHook, 'cache did not reconnect after context restore');
        pair('context-restored');
        const owned = cache.cache, original = cache._orig; cache.dispose();
        assert(!gl.isFramebuffer(owned.framebuffer) && !gl.isRenderbuffer(owned.depth), 'owned cache GPU resource survived dispose');
        assert(renderer.shadowMap.render === original, 'dispose did not restore shadow renderer');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { rows, sensitivity, allocations, reflection, contextRestored: true, disposed: true, images,
          gpu: { webgl: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
          fixture: { source: 'immutable production ShadowCache/Environment and Three; actual WebGL draws/readbacks',
            comparison: 'cached static+dynamic shadows against uncached full redraw of the same scene',
            boundaries: 'diagnostic marina/actors; Chromium software GPU, not an iOS device profile or Nintendo equivalence' } };
      } finally {
        cache.dispose(); env?._reflRT?.dispose(); target.dispose();
        for (const mesh of [ground, fixed, moving]) { mesh.geometry.dispose(); mesh.material.dispose(); }
        sun.shadow.map?.dispose(); renderer.dispose(); renderer.domElement.remove();
      }
    }, { prefix, width: WIDTH, height: HEIGHT });
    result.summary = validateResourceResult(result);
    const required = ['src/core/shadowcache.js', 'src/world/environment.js', 'patches/local-quality/depth-cache.mjs',
      'patches/local-quality/resource-budget.mjs', 'vendor/three/build/three.module.js'];
    for (const file of required) if (!loaded.has(prefix.slice(1) + file)) throw Error('Actual Resource module not loaded: ' + file);
    if (errors.length) throw Error('Resource browser/shader errors: ' + errors.join('; '));
    for (const entry of result.images) {
      const file = path.join(output, entry.name + '.png');
      fs.writeFileSync(file + '.writing', Buffer.from(entry.image.split(',')[1], 'base64')); fs.renameSync(file + '.writing', file);
    }
    delete result.images;
    // Revalidate after browser work, detecting site or input mutations in flight.
    const after = verifyResourceBuild(site, process.argv.includes('--exact-source'));
    if (after.source.sourceSha !== identity.source.sourceSha || after.source.verifierSha256 !== identity.source.verifierSha256)
      throw Error('Resource source/verifier identity changed during verification');
    result.toolchain = { node: process.version, chromium: browser.browser()?.version() || null };
  } catch (error) {
    failure = error;
    try { if (page) result = { ...(result || {}), progress: await page.evaluate(() => globalThis.resourceProbeProgress || null) }; } catch {}
    try { await page?.screenshot({ path: path.join(output, 'resource-render-failed.png'), timeout: 10000 }); } catch {}
  } finally {
    try { await browser?.close(); } catch (error) { failure ||= error; }
    try { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } catch (error) { failure ||= error; }
  }
  const receipt = { ...result, status: failure ? 'failed' : 'passed', gate: 'resource-render', finishedAt: new Date().toISOString(),
    contentHash: identity?.manifest.contentHash || null, build: identity?.manifest.build || null, source: identity?.source || null,
    command: process.argv, loaded: [...loaded.values()], errors, ...(failure ? { message: String(failure.message || failure).slice(0, 2500) } : {}) };
  publish(receipt);
  console.log(JSON.stringify({ status: receipt.status, sourceSha: receipt.source?.sourceSha, contentHash: receipt.contentHash,
    summary: receipt.summary, message: receipt.message, evidence: path.join(output, 'resource-render-result.json') }));
  if (failure) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
