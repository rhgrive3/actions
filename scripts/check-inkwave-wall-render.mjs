#!/usr/bin/env node
// Bounded full-production wall readiness/GTAOPass regression. Read back actual Chromium WebGL
// output; instrument real buffer uploads/deletions without replacing rendering.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const WIDTH = 480, HEIGHT = 360;
export function wallPixelDifference(a, b) {
  if (!a.length || a.length !== b.length || a.length % 4) throw Error('Wall pixel denominator');
  let changedPixels = 0, changedBytes = 0, totalDifference = 0;
  for (let i = 0; i < a.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      if (!Number.isFinite(d)) throw Error('Non-finite Wall pixel');
      changedBytes += d !== 0; totalDifference += d; changed ||= d !== 0;
    }
    changedPixels += changed;
  }
  return { pixels: a.length / 4, changedPixels, changedBytes, totalDifference };
}
export const WALL_RENDER_SCENARIOS = Object.freeze(['charge', 'ready-front', 'ready-oblique', 'ready-side', 'ready-scaled',
  'cancel', 'hidden', 'reset', 'death', 'disposed']);
export function validateWallRenderResult(result) {
  const pixel = (d, label) => {
    if (d?.pixels !== WIDTH * HEIGHT || !Number.isInteger(d.changedPixels) || d.changedPixels < 0 || d.changedPixels > d.pixels
        || !Number.isInteger(d.changedBytes) || d.changedBytes < d.changedPixels || d.changedBytes > 4 * d.changedPixels
        || !Number.isInteger(d.totalDifference) || d.totalDifference < d.changedBytes || d.totalDifference > 255 * d.changedBytes)
      throw Error('Wall pixel evidence invalid: ' + label);
    return d;
  };
  if (result.rows?.length !== WALL_RENDER_SCENARIOS.length || WALL_RENDER_SCENARIOS.some((name, i) => result.rows[i]?.name !== name))
    throw Error('Wall render scenario denominator');
  if (!result.gpu?.webgl?.startsWith('WebGL 2.0') || !result.gpu.renderer) throw Error('Wall actual GPU identity missing');
  for (const row of result.rows) {
    for (const pass of ['beauty', 'normal', 'depth', 'ao']) {
      const d = pixel(row.pixels?.[pass], row.name + '/' + pass);
      if (pass !== 'beauty' && d.changedBytes !== 0) throw Error('Wall glint changed GTAO ' + pass + ': ' + row.name);
    }
    const ready = row.name.startsWith('ready-');
    for (const key of ['visibleGlints', 'gpuBeautyDraws', 'gpuOverrideDraws', 'beautyIndexCount', 'overrideCalls', 'overrideNonzero'])
      if (!Number.isInteger(row[key]) || row[key] < 0) throw Error('Wall GPU draw evidence missing: ' + key);
    if (ready && (row.visibleGlints !== 1 || row.pixels.beauty.changedPixels < 10 || row.gpuBeautyDraws < 1 || row.beautyIndexCount !== 24
        || row.overrideCalls < 3 || row.snapshot?.ready !== true || !(row.snapshot.glow > .5)
        || !Number.isFinite(row.geometry?.planeError) || !Number.isFinite(row.geometry?.axisError)
        || row.geometry.planeError > 1e-6 || row.geometry.axisError > 1e-6 || !(row.geometry?.worldHalfAxis > .1)))
      throw Error('Wall readiness not rendered/camera-facing: ' + row.name);
    if (!ready && (row.visibleGlints !== 0 || row.gpuBeautyDraws !== 0)) throw Error('Wall glint survived interruption: ' + row.name);
    if (row.gpuOverrideDraws !== 0 || row.overrideNonzero !== 0 || row.sourceGeometryChanged !== false)
      throw Error('Wall glint override/native geometry regression: ' + row.name);
    if (!Array.isArray(row.nativeIK) || row.nativeIK.length !== 4 || row.nativeIK.some(v => !Number.isFinite(v)))
      throw Error('Wall native IK missing');
  }
  for (const pass of ['normal', 'depth', 'ao']) {
    if (pixel(result.nativePixels?.[pass], 'native/' + pass).changedPixels <= 10) throw Error('Native GPU rig absent: ' + pass);
    if (pixel(result.unoccludedSafePixels?.[pass], 'unoccluded-safe/' + pass).changedBytes !== 0)
      throw Error('Wall glint changed unoccluded GTAO ' + pass);
    if (pixel(result.unsafeOverridePixels?.[pass], 'unsafe/' + pass).changedPixels <= 10) throw Error('Wall drawRange check insensitive: ' + pass);
  }
  if (pixel(result.oldAffinePixels, 'old-affine').changedPixels <= 10) throw Error('Wall affine pixel check insensitive');
  const d = result.disposal;
  for (const key of ['uploadedNativeBuffers', 'uploadedNativeAttributes', 'deletedOwnedBuffers', 'releasedGlintVAOs', 'survivorPixels'])
    if (!Number.isInteger(d?.[key]) || d[key] <= 0) throw Error('Wall GPU disposal missing: ' + key);
  if (d.deletedNativeBuffers !== 0 || d.nativeBuffersAlive !== d.uploadedNativeBuffers || d.survivorNormalChangedBytes !== 0
      || d.glintGeometryDisposals !== 1 || d.glintMaterialDisposals !== 1 || d.glintDetached !== true)
    throw Error('Wall disposal damaged native buffers/resources');
  const l = result.lifecycle;
  if (l?.nativeAttached !== true || l.nativeReadyTicks !== 45 || l.zeroDtFrozen !== true || l.cancelImmediate !== true
      || l.hideImmediate !== true || l.resetImmediate !== true || l.deathImmediate !== true || l.disposedTerminal !== true
      || !(l.nonuniformRatio > 1.5)) throw Error('Wall native lifecycle incomplete');
  return { scenarios: WALL_RENDER_SCENARIOS.length, overridePixelEquality: true, nativeBuffers: d.uploadedNativeBuffers,
    indexedReadyViews: 4, unsafeOverridesDetected: true, affineCounterexampleDetected: true };
}

// Always bind inputs to this checkout. --exact-source additionally binds all
// inputs and this verifier to committed blobs, following check-inkwave-browser.
export function verifyWallBuild(site, exactSource = false) {
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  if (manifest.schema !== 1 || hash(JSON.stringify(manifest.files)) !== manifest.inputHash
      || hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash || !/^[a-f0-9]{64}$/.test(manifest.build.revision))
    throw Error('Wall build identity mismatch');
  const inside = (root, file) => file.startsWith(root + path.sep);
  for (const [file, digest] of Object.entries(manifest.artifacts)) {
    const physical = fs.realpathSync(path.resolve(site, file));
    if (!inside(site, physical) || hash(fs.readFileSync(physical)) !== digest) throw Error('Wall artifact mismatch: ' + file);
  }
  const files = Object.entries(manifest.files).map(([key, digest]) => {
    const file = key.startsWith('upstream/') ? 'inkwave-public/' + key.slice(9)
      : key.startsWith('patch/') ? 'patches/splatoon3/' + key.slice(6)
        : key.startsWith('touch-layout/') ? 'patches/touch-layout/' + key.slice(13)
          : key.startsWith('reliability/') ? 'patches/reliability/' + key.slice(12)
            : key.startsWith('local-quality/') ? 'patches/local-quality/' + key.slice(14)
              : key.startsWith('practice-range/') ? 'patches/practice-range/' + key.slice(15) : null;
    if (!file || !inside(ROOT.replace(/\/$/, ''), fs.realpathSync(path.resolve(ROOT, file)))
        || hash(fs.readFileSync(path.join(ROOT, file))) !== digest) throw Error('Wall build input differs from source: ' + key);
    return file;
  });
  if (hash(fs.readFileSync(path.join(ROOT, 'scripts/build-inkwave.mjs'))) !== manifest.build.script)
    throw Error('Wall build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs', 'scripts/check-inkwave-wall-render.mjs');
  let sourceSha = null;
  if (exactSource) {
    sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const tree = new Map(execFileSync('git', ['ls-tree', '-r', '-z', sourceSha], { cwd: ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean).map(row => { const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]]; }));
    const blobs = execFileSync('git', ['hash-object', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    files.forEach((file, i) => { if (blobs[i] !== tree.get(file)) throw Error('Wall source differs from commit: ' + file); });
  }
  return { manifest, source: { sourceSha, inputHash: manifest.inputHash, sourceFiles: files.length,
    verifierSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))) } };
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
    const file = path.join(output, 'wall-render-result.json');
    fs.writeFileSync(file + '.writing', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.writing', file);
  };
  const errors = [], loaded = new Map(); let browser, server, page, identity, result, failure;
  const recordError = error => { if (errors.length < 20) errors.push(String(error).slice(0, 1800)); };
  publish({ status: 'running', gate: 'wall-render', startedAt: new Date().toISOString() });
  try {
    identity = verifyWallBuild(site, process.argv.includes('--exact-source'));
    const { manifest } = identity, prefix = '/_versions/' + manifest.build.revision + '/';
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
    server = http.createServer((req, res) => {
      if (req.url === '/wall-render') {
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
        if (key !== 'wall-render') {
          if (!manifest.artifacts[key] || hash(body) !== manifest.artifacts[key]) throw Error('Wall loaded artifact mismatch: ' + key);
          loaded.set(key, { path: key, sha256: hash(body), bytes: body.length });
        }
        await route.fulfill({ response, body });
      } catch (error) { recordError(error.message); await route.abort(); }
    });
    await page.goto(address + '/wall-render');
    await page.addScriptTag({ content: 'globalThis.wallPixelDifference = ' + wallPixelDifference.toString() + ';' });
    result = await page.evaluate(async ({ prefix, width, height }) => {
      const THREE = await import('three');
      const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
      const { Level } = await import(prefix + 'src/world/level.js');
      const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
      const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
      const { wallMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/wall-motion.mjs');
      const { movementMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/movement-motion.mjs');
      const { Actor, Character, G, Physics, PaintSystem, Projectiles, PLAYER } = install(profile);
      const assert = (condition, message) => { if (!condition) throw Error(message); };
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe7e9');
      const camera = new THREE.PerspectiveCamera(40, width / height, .05, 30);
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.setSize(width, height); renderer.setPixelRatio(1); document.body.appendChild(renderer.domElement);
      const gl = renderer.getContext(), uploads = new Map(), deleted = new Set(), vaosDeleted = new Set();
      const nativeBufferData = gl.bufferData, nativeDeleteBuffer = gl.deleteBuffer, nativeDeleteVAO = gl.deleteVertexArray;
      const nativeDraw = gl.drawElements;
      let drawingGlint = false, gpuBeautyDraws = 0, gpuOverrideDraws = 0, beautyIndexCount = 0, overrideCalls = 0, overrideNonzero = 0;
      const glintVAOs = new Set();
      gl.bufferData = function (target, data, ...rest) {
        const result = nativeBufferData.call(this, target, data, ...rest);
        if (ArrayBuffer.isView(data)) uploads.set(data, this.getParameter(target === this.ARRAY_BUFFER
          ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING));
        return result;
      };
      gl.deleteBuffer = function (buffer) { deleted.add(buffer); return nativeDeleteBuffer.call(this, buffer); };
      gl.deleteVertexArray = function (vao) { vaosDeleted.add(vao); return nativeDeleteVAO.call(this, vao); };
      gl.drawElements = function (...args) {
        if (drawingGlint && args[1] > 0) {
          if (scene.overrideMaterial) gpuOverrideDraws++;
          else { gpuBeautyDraws++; beautyIndexCount = args[1]; glintVAOs.add(this.getParameter(this.VERTEX_ARRAY_BINDING)); }
        }
        return nativeDraw.apply(this, args);
      };
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667477, 2.2));
      const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(3, 5, 4); scene.add(light);
      const material = new THREE.MeshStandardMaterial({ color: 0xbfcbd0 });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(24, .5, 24), material); floor.position.y = -.25; scene.add(floor);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), material); wall.position.set(0, 1.5, -.5); scene.add(wall);
      const level = new Level({ bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, spawnPads: [[-8, 0, 0], [8, 0, 0]],
        spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-12, -.5, -12], max: [12, 0, 12] },
          { kind: 'box', min: [-3, 0, -1], max: [3, 3, 0] }] });
      Object.assign(G, { scene, camera, renderer, settings: { quality: 'high', shadows: false }, mode: 'match', actors: [], time: 0,
        level, physics: new Physics(level), teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
        match: { playing: () => true, canRespawn: () => false } });
      const paint = G.paint = new PaintSystem(renderer, level, { atlasSize: 512, maxDensity: 8 });
      const projectiles = G.projectiles = new Projectiles(scene);
      const actor = new Actor({ team: 0, name: 'wall-render', CharacterClass: Character, isLocal: true, weapon: 'shooter',
        style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      const ch = actor.character; ch.actor = actor; scene.add(ch.root); G.actors.push(actor); ch.setLod('game');
      const ao = new GTAOPass(scene, camera, width, height), target = new THREE.WebGLRenderTarget(width, height);
      const rows = [], images = [], records = [], observed = new WeakSet();
      let star, glintGeometryDisposals = 0, glintMaterialDisposals = 0;
      const nativeMeshes = ch.root.getObjectsByProperty('isMesh', true).filter(mesh => !mesh.name.startsWith('s3-'));
      for (const geometry of new Set(nativeMeshes.map(mesh => mesh.geometry))) records.push({ geometry, index: geometry.index,
        indexBytes: geometry.index && Array.from(geometry.index.array), range: geometry.drawRange, start: geometry.drawRange.start,
        count: geometry.drawRange.count, core: nativeMeshes.some(mesh => mesh.geometry === geometry && (mesh === ch.squid.body || mesh.isSkinnedMesh)),
        attributes: Object.entries(geometry.attributes).map(([key, a]) => [key, a, Array.from(a.array)]) });
      const immutable = () => {
        for (const r of records) {
          assert(r.geometry.index === r.index && r.geometry.drawRange === r.range && r.range.start === r.start && (!r.core || r.range.count === r.count),
            'Native geometry/index/drawRange identity changed');
          assert(Object.keys(r.geometry.attributes).length === r.attributes.length, 'Native attribute keys changed');
          for (const [key, a, bytes] of r.attributes) assert(r.geometry.attributes[key] === a && a.array.every((v, i) => Object.is(v, bytes[i]))
            && a.array.length === bytes.length, 'Native attribute changed: ' + key);
          if (r.index) assert(r.index.array.every((v, i) => v === r.indexBytes[i]), 'Native indices changed');
        }
      };
      const observe = () => {
        star = ch.squid.pivot.getObjectByName('s3-wall-ready-glint') || star;
        if (!star || observed.has(star)) return;
        observed.add(star);
        const before = star.onBeforeRender, after = star.onAfterRender;
        star.onBeforeRender = function (...args) {
          before.apply(this, args); drawingGlint = true;
          if (args[1].overrideMaterial) { overrideCalls++; overrideNonzero += args[3].drawRange.count !== 0; }
        };
        star.onAfterRender = function (...args) { after.apply(this, args); drawingGlint = false; };
        star.geometry.addEventListener('dispose', () => glintGeometryDisposals++);
        star.material.addEventListener('dispose', () => glintMaterialDisposals++);
      };
      const step = (dt = 1 / 60) => {
        G.time += dt; actor.anim.time = G.time; actor.update(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); observe();
        assert(Array.from(ch.P).every(Number.isFinite) && Array.from(ch.ikErr).every(Number.isFinite), 'Non-finite native pose/IK');
      };
      const state = () => JSON.stringify({ position: actor.pos.toArray(), velocity: actor.vel.toArray(), root: ch.root.position.toArray(),
        rotation: ch.root.rotation.toArray(), input: actor.intent, ink: actor.ink, hp: actor.hp, actions: actor.s3.actions,
        time: G.time, poseTime: ch.t, nativeTimers: Array.from(ch.tr), special: actor.special, movement: movementMotionSnapshot(ch),
        wall: wallMotionSnapshot(ch), ik: Array.from(ch.ikErr), bones: ch.skeleton.bones.map(b => b.matrix.toArray()),
        fuses: projectiles.bombs.map(b => b.armed), runner: Object.fromEntries(['cooldown', 'chargeT', 'charge', 'slosh', 'lockT', 'streaming', 'aimingSub']
          .map(k => [k, actor.weaponRunner[k]])) });
      const render = pass => {
        const before = state();
        if (pass === 'beauty') { renderer.setRenderTarget(null); renderer.render(scene, camera); renderer.render(scene, camera); }
        else { ao.output = GTAOPass.OUTPUT[pass === 'ao' ? 'AO' : pass === 'depth' ? 'Depth' : 'Normal']; ao.render(renderer, target, target); }
        const pixels = new Uint8Array(width * height * 4);
        if (pass === 'beauty') gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        else renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        assert(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), 'Actual WebGL error: ' + pass);
        assert(state() === before, 'Rendering changed native gameplay/visual clocks/root/IK: ' + pass);
        immutable(); return pixels;
      };
      const difference = globalThis.wallPixelDifference;
      const png = (name, pixels) => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'), data = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) data.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
        ctx.putImageData(data, 0, 0); images.push({ name, image: canvas.toDataURL('image/png') });
      };
      const pair = (pass, name) => {
        const on = render(pass), visible = star?.visible, ranges = records.map(r => r.range.count);
        if (star) star.visible = false;
        const off = render(pass); if (star) star.visible = visible;
        // Native small weapon parts intentionally gate their own drawRange in
        // override passes. Compare within a pass; never call that native gate a
        // mutation caused by this glint or require it to stay at Infinity.
        assert(records.every((r, i) => r.range.count === ranges[i]), 'Glint changed native drawRange within a pass');
        if (name) { png(name + '-' + pass, on); png(name + '-' + pass + '-baseline', off); }
        return difference(on, off);
      };
      const cameraAt = offset => {
        const focus = ch.squid.pivot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .1, 0));
        camera.position.copy(focus).add(new THREE.Vector3(...offset)); camera.lookAt(focus); camera.updateMatrixWorld(true);
      };
      const geometryProof = () => {
        if (!star?.parent || !star.visible) return null;
        const point = i => new THREE.Vector3().fromBufferAttribute(star.geometry.attributes.position, i).applyMatrix4(star.matrixWorld);
        const center = point(0), up = point(1).sub(center), right = point(3).sub(center);
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
        return { planeError: Math.max(...Array.from({ length: star.geometry.attributes.position.count }, (_, i) => Math.abs(point(i).sub(center).dot(n)))),
          axisError: Math.abs(up.length() - right.length()), worldHalfAxis: up.length(), matrixWorld: star.matrixWorld.toArray(),
          cameraPosition: camera.position.toArray(), mantleScale: ch.squid.pivot.scale.toArray() };
      };
      const capture = name => {
        const before = { beauty: gpuBeautyDraws, override: gpuOverrideDraws, calls: overrideCalls, nonzero: overrideNonzero }, pixels = {};
        for (const pass of ['beauty', 'normal', 'depth', 'ao']) pixels[pass] = pair(pass, name);
        render('beauty'); // Record matrix for the same actual beauty camera.
        let visibleGlints = 0;
        if (star?.parent && star.visible) { visibleGlints = 1; for (let p = star.parent; p; p = p.parent) if (!p.visible) visibleGlints = 0; }
        rows.push({ name, pixels, snapshot: wallMotionSnapshot(ch), visibleGlints, gpuBeautyDraws: gpuBeautyDraws - before.beauty,
          gpuOverrideDraws: gpuOverrideDraws - before.override, beautyIndexCount, overrideCalls: overrideCalls - before.calls,
          overrideNonzero: overrideNonzero - before.nonzero, geometry: geometryProof(), sourceGeometryChanged: false, nativeIK: Array.from(ch.ikErr) });
        globalThis.wallProbeProgress = { name, rows: rows.length };
      };
      const prepare = () => {
        actor.reset(); ch.setVisible(true); ch.setDance(null);
        actor.pos.set(0, .5, PLAYER.radius + .02); actor.vel.set(0, 0, 0); actor.grounded = false;
        actor.intent.squid = true; actor.intent.move.set(0, 0, -1); actor.intent.jump = false; actor.intent.fire = actor.intent.sub = false;
        for (let i = 0; i < 6; i++) step();
        assert(actor.climbing, 'Real Physics/paint did not attach to own-ink wall');
        actor.intent.jump = true;
        let ticks = 0;
        while (!wallMotionSnapshot(ch)?.ready && ticks < 48) { step(); ticks++; }
        assert(actor.s3.surge?.phase === 'charge' && actor.s3.surge.charge === 1 && wallMotionSnapshot(ch)?.glow > .5,
          'Native held-input charge did not produce readiness');
        return ticks;
      };
      try {
        actor.spawnAt(new THREE.Vector3(0, 0, 4), 0);
        camera.position.set(2.5, 1.8, 7.8); camera.lookAt(0, .68, 4); camera.updateMatrixWorld(true);
        for (let i = 0; i < 36; i++) step();
        const nativePixels = {};
        for (const pass of ['normal', 'depth', 'ao']) {
          const on = render(pass); ch.root.visible = false; const off = render(pass); ch.root.visible = true;
          nativePixels[pass] = difference(on, off); png('native-' + pass, on); png('native-' + pass + '-absent', off);
        }
        paint.splat(new THREE.Vector3(0, 1, .01), 20, 0, { seed: .5, instant: true });
        actor.reset(); actor.pos.set(0, .5, PLAYER.radius + .02); actor.intent.squid = true; actor.intent.move.set(0, 0, -1);
        for (let i = 0; i < 6; i++) step();
        assert(actor.climbing, 'Native wall attachment missing'); actor.intent.jump = true;
        for (let i = 0; i < 20; i++) step(); cameraAt([0, .3, 2.2]); capture('charge');
        let chargeTicks = 20;
        while (!wallMotionSnapshot(ch)?.ready && chargeTicks < 48) { step(); chargeTicks++; }
        const lifecycle = { nativeAttached: actor.climbing, nativeReadyTicks: chargeTicks };
        assert(star && star.geometry.index.count === 24 && ch.squid.ghost.visible, 'Indexed local wall ghost/glint missing');
        for (const [name, offset] of [['ready-front', [0, .3, 2.2]], ['ready-oblique', [1.5, 1, 1.8]], ['ready-side', [-2, .5, .8]]]) {
          cameraAt(offset); capture(name);
        }
        const originalScale = ch.squid.pivot.scale.clone(); ch.squid.pivot.scale.multiply(new THREE.Vector3(1.65, .6, 1.2));
        ch.root.updateMatrixWorld(true); cameraAt([1.5, 1, 1.8]);
        lifecycle.nonuniformRatio = Math.max(...ch.squid.pivot.scale.toArray()) / Math.min(...ch.squid.pivot.scale.toArray());
        capture('ready-scaled');
        // Pixel counterfactual: old quaternion-only billboard in the identical
        // native posed scene. All real draw callbacks still execute first.
        const safe = star.onBeforeRender, oldAffinePixels = (() => {
          const on = render('beauty');
          star.onBeforeRender = function (...args) {
            safe.apply(this, args);
            if (!args[1].overrideMaterial) {
              const invParent = ch.squid.pivot.getWorldQuaternion(new THREE.Quaternion()).invert();
              const rotation = invParent.multiply(camera.getWorldQuaternion(new THREE.Quaternion()));
              const scale = new THREE.Vector3().setScalar(star.matrixWorld.elements.slice(0, 3).reduce((n, v) => n + v * v, 0) ** .5);
              star.matrix.compose(new THREE.Vector3(0, .12, .055), rotation, scale); star.matrixWorldNeedsUpdate = true;
              star.updateWorldMatrix(false, false);
            }
          };
          const old = render('beauty'); png('old-quaternion-beauty', old); star.onBeforeRender = safe;
          return difference(on, old);
        })();
        // Recreate the broken nonzero drawRange during opaque override. This
        // must change actual normal/depth/AO pixels; callback counts cannot pass.
        const unsafeOverridePixels = {}, unoccludedSafePixels = {};
        render('beauty'); // Restore the corrected affine billboard after the old control.
        // The wall and mantle can fully occlude a broken opaque glint (beauty
        // deliberately disables depth testing). Hide those render surfaces for
        // this sensitivity diagnostic; Physics, native Actor pose, camera,
        // indexed glint and its size stay identical. The complete native rig is
        // independently pixel-tested above and in every readiness view.
        // Require the corrected gate to retain pixel equality here as well.
        const occluders = nativeMeshes.map(mesh => [mesh, mesh.visible]);
        const viewPosition = camera.position.clone(), viewRotation = camera.quaternion.clone();
        // The indexed star is clockwise: the default front-sided GTAO material
        // also culls it from the beauty side. View the frozen beauty billboard
        // from behind, without changing geometry or GTAO material semantics.
        cameraAt([-1.5, 1, -1.8]);
        wall.visible = false;
        for (const [mesh] of occluders) mesh.visible = false;
        for (const pass of ['normal', 'depth', 'ao']) unoccludedSafePixels[pass] = pair(pass, 'unoccluded-safe');
        try {
          star.onBeforeRender = function (...args) { safe.apply(this, args); if (args[1].overrideMaterial) args[3].drawRange.count = args[3].index.count; };
          for (const pass of ['normal', 'depth', 'ao']) unsafeOverridePixels[pass] = pair(pass, 'unsafe-drawRange');
        } finally {
          star.onBeforeRender = safe; star.geometry.drawRange.count = star.geometry.index.count; wall.visible = true;
          for (const [mesh, visible] of occluders) mesh.visible = visible;
          camera.position.copy(viewPosition); camera.quaternion.copy(viewRotation); camera.updateMatrixWorld(true);
        }
        ch.squid.pivot.scale.copy(originalScale); ch.root.updateMatrixWorld(true);
        const frozen = JSON.stringify(wallMotionSnapshot(ch)); actor._finishFrame(0);
        lifecycle.zeroDtFrozen = JSON.stringify(wallMotionSnapshot(ch)) === frozen;
        ch.trigger('movement_cancel');
        lifecycle.cancelImmediate = !star.visible && ch.mats.squid.emissive.toArray().every(v => v === 0); capture('cancel');
        prepare(); ch.setVisible(false); lifecycle.hideImmediate = !star.visible; capture('hidden');
        prepare(); actor.reset(); lifecycle.resetImmediate = !star.visible && wallMotionSnapshot(ch).phase === null; capture('reset');
        prepare(); actor.splat(null); lifecycle.deathImmediate = !star.visible && wallMotionSnapshot(ch).phase === null; capture('death');
        prepare(); render('beauty'); render('normal');
        const nativeArrays = new Set(records.flatMap(r => [r.index?.array, ...r.attributes.map(([, a]) => a.array)]).filter(a => a && uploads.has(a)));
        const nativeBuffers = new Set([...nativeArrays].map(a => uploads.get(a)));
        assert(nativeBuffers.size > 0 && [...nativeBuffers].every(b => gl.isBuffer(b)), 'No uploaded native buffers');
        const ownedBuffers = new Set([star.geometry.index, ...Object.values(star.geometry.attributes)].map(a => uploads.get(a.array)).filter(Boolean));
        const survivor = new Character({ name: 'native-shared-survivor', color: actor.color, weapon: 'shooter',
          style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
        survivor.setLod('game'); scene.add(survivor.root); survivor.root.position.set(0, 0, 4); ch.root.visible = false;
        for (let i = 0; i < 36; i++) survivor.update(1 / 60, { ...actor.anim, form: 'kid', grounded: true, speed: 0, vy: 0 });
        assert(survivor.root.getObjectsByProperty('isMesh', true).some(mesh => nativeMeshes.some(source => mesh.geometry.index
          && mesh.geometry.index === source.geometry.index)), 'Survivor has no cached shared native geometry');
        camera.position.set(2.5, 1.8, 7.8); camera.lookAt(0, .68, 4); camera.updateMatrixWorld(true);
        const survivorBefore = render('normal'); survivor.root.visible = false;
        const survivorPixels = difference(survivorBefore, render('normal')); survivor.root.visible = true;
        const deletedBefore = new Set(deleted), vaoBefore = new Set(vaosDeleted);
        ch.dispose(); ch.dispose();
        const survivorAfter = render('normal');
        const disposal = { uploadedNativeBuffers: nativeBuffers.size, uploadedNativeAttributes: nativeArrays.size,
          deletedNativeBuffers: [...nativeBuffers].filter(b => deleted.has(b) && !deletedBefore.has(b)).length,
          nativeBuffersAlive: [...nativeBuffers].filter(b => gl.isBuffer(b)).length,
          deletedOwnedBuffers: [...ownedBuffers].filter(b => deleted.has(b) && !deletedBefore.has(b)).length,
          releasedGlintVAOs: [...glintVAOs].filter(v => vaosDeleted.has(v) && !vaoBefore.has(v)).length,
          survivorPixels: survivorPixels.changedPixels, survivorNormalChangedBytes: difference(survivorBefore, survivorAfter).changedBytes,
          glintGeometryDisposals, glintMaterialDisposals, glintDetached: star.parent === null };
        ch.trigger('squidroll'); ch.update(1 / 60, { form: 'climb' }); actor.reset(); actor._finishFrame(0);
        lifecycle.disposedTerminal = wallMotionSnapshot(ch) === null && movementMotionSnapshot(ch) === null && star.parent === null;
        capture('disposed'); survivor.dispose();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { rows, nativePixels, unsafeOverridePixels, unoccludedSafePixels, oldAffinePixels, lifecycle, disposal, images,
          gpu: { webgl: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
          fixture: { source: 'immutable built site; full production install; native Actor/WeaponRunner/Character/Physics/Level/PaintSystem/Projectiles/IK/indexed meshes',
            driver: 'fixed native input, painted wall, 45 native charge ticks; render-only camera/scale stress; no whole-game update',
            render: 'actual WebGL indexed draws and RGBA readback; GTAOPass.render Normal/Depth/AO; actual GL buffers/deletions/VAOs',
            boundaries: 'diagnostic floor/wall and match boundary; Projectiles created but not advanced; Chromium software GPU; no Switch/iOS/Nintendo pixel parity',
            comparison: 'same posed scene with only readiness glint hidden; native emissive readiness stays fixed in paired images',
            sensitivity: 'frozen corrected beauty billboard viewed from behind with native GTAO front-side material, render wall/native mesh occluders hidden; charged Actor/Physics/indexed cue/scale unchanged; safe and broken drawRange both pixel-tested' } };
      } finally {
        ch.dispose(); projectiles.clear(); paint.dispose(); ao.dispose(); target.dispose();
        floor.geometry.dispose(); wall.geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove();
        gl.bufferData = nativeBufferData; gl.deleteBuffer = nativeDeleteBuffer; gl.deleteVertexArray = nativeDeleteVAO; gl.drawElements = nativeDraw;
      }
    }, { prefix, width: WIDTH, height: HEIGHT });
    result.summary = validateWallRenderResult(result);
    const required = ['patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/wall-motion.mjs',
      'patches/splatoon3/runtime/movement-motion.mjs', 'src/game/actor.js', 'src/game/character.js', 'src/game/weapons.js',
      'vendor/three/build/three.module.js', 'vendor/three/jsm/postprocessing/GTAOPass.js'];
    for (const file of required) if (!loaded.has(prefix.slice(1) + file)) throw Error('Actual Wall/GTAO module not loaded: ' + file);
    if (errors.length) throw Error('Wall browser/shader errors: ' + errors.join('; '));
    for (const entry of result.images) {
      const file = path.join(output, entry.name + '.png');
      fs.writeFileSync(file + '.writing', Buffer.from(entry.image.split(',')[1], 'base64')); fs.renameSync(file + '.writing', file);
    }
    delete result.images;
    // Revalidate after browser work, detecting site or input mutations in flight.
    const after = verifyWallBuild(site, process.argv.includes('--exact-source'));
    if (after.source.sourceSha !== identity.source.sourceSha || after.source.verifierSha256 !== identity.source.verifierSha256)
      throw Error('Wall source/verifier identity changed during verification');
    result.toolchain = { node: process.version, chromium: browser.browser()?.version() || null };
  } catch (error) {
    failure = error;
    try { if (page) result = { ...(result || {}), progress: await page.evaluate(() => globalThis.wallProbeProgress || null) }; } catch {}
    try { await page?.screenshot({ path: path.join(output, 'wall-render-failed.png'), timeout: 10000 }); } catch {}
  } finally {
    try { await browser?.close(); } catch (error) { failure ||= error; }
    try { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } catch (error) { failure ||= error; }
  }
  const receipt = { ...result, status: failure ? 'failed' : 'passed', gate: 'wall-render', finishedAt: new Date().toISOString(),
    contentHash: identity?.manifest.contentHash || null, build: identity?.manifest.build || null, source: identity?.source || null,
    command: process.argv, loaded: [...loaded.values()], errors, ...(failure ? { message: String(failure.message || failure).slice(0, 2500) } : {}) };
  publish(receipt);
  console.log(JSON.stringify({ status: receipt.status, sourceSha: receipt.source?.sourceSha, contentHash: receipt.contentHash,
    summary: receipt.summary, message: receipt.message, evidence: path.join(output, 'wall-render-result.json') }));
  if (failure) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
