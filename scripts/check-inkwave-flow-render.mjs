#!/usr/bin/env node
// Focused production Flow/GTAOPass regression. Read back actual Chromium WebGL
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
export function flowPixelDifference(a, b) {
  if (!a.length || a.length !== b.length || a.length % 4) throw Error('Flow pixel denominator');
  let changedPixels = 0, changedBytes = 0, totalDifference = 0;
  for (let i = 0; i < a.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      if (!Number.isFinite(d)) throw Error('Non-finite Flow pixel');
      changedBytes += d !== 0; totalDifference += d; changed ||= d !== 0;
    }
    changedPixels += changed;
  }
  return { pixels: a.length / 4, changedPixels, changedBytes, totalDifference };
}
export function validateFlowRenderResult(result) {
  const names = ['kid-entry', 'kid-active', 'extension', 'squid-entry', 'squid-active',
    'kid-return', 'expiry', 'off', 'reset', 'death', 'hidden'];
  if (result.rows?.length !== names.length || names.some((name, i) => result.rows[i]?.name !== name))
    throw Error('Flow render scenario denominator');
  for (const row of result.rows) {
    for (const pass of ['beauty', 'normal', 'depth', 'ao']) {
      const d = row.pixels?.[pass];
      if (d?.pixels !== WIDTH * HEIGHT || !Number.isInteger(d.changedBytes)
          || d.changedBytes < 0 || !Number.isFinite(d.totalDifference)) throw Error('Flow render pixels: ' + row.name);
      if (pass !== 'beauty' && d.changedBytes !== 0) throw Error('Flow changed GTAO ' + pass + ': ' + row.name);
    }
    const active = !['off', 'reset', 'death', 'hidden'].includes(row.name);
    if (active && (row.pixels.beauty.changedPixels < 1 || row.overrideMeshes < 1 || row.flowGpuBeautyDraws < 1))
      throw Error('Flow was not drawn/exercised: ' + row.name);
    if (!active && (row.flowBeautyCalls !== 0 || row.visibleMeshes !== 0)) throw Error('Flow survived interruption: ' + row.name);
    if (row.sourceGeometryChanged !== false || row.overrideNonzero !== 0 || row.beautyZero !== 0 || row.flowGpuOverrideDraws !== 0)
      throw Error('Flow geometry gate regression: ' + row.name);
    if (!row.nativeIK?.length || row.nativeIK.some(v => !Number.isFinite(v))) throw Error('Flow native IK');
  }
  for (const pass of ['normal', 'depth', 'ao'])
    if (!(result.nativePixels?.[pass]?.changedPixels > 10)) throw Error('Native rig missing from GTAO ' + pass);
  for (const component of ['shell', 'glint', 'ribbon'])
    if (!(result.componentPixels?.[component]?.changedPixels > 0)) throw Error('Flow component not rendered: ' + component);
  for (const pass of ['normal', 'depth', 'ao'])
    if (!(result.unsafeOverridePixels?.[pass]?.changedPixels > 10)) throw Error('Flow AO regression sensitivity missing: ' + pass);
  for (const key of ['uploadedNativeBuffers', 'disposedViews', 'deletedOwnedBuffers', 'releasedViewVAOs', 'survivorPixels'])
    if (!(result.disposal?.[key] > 0)) throw Error('Flow disposal evidence missing: ' + key);
  if (result.disposal.deletedNativeBuffers !== 0 || result.disposal.nativeBuffersAlive !== result.disposal.uploadedNativeBuffers
      || result.disposal.survivorNormalChangedBytes !== 0 || result.disposal.detachedViews !== result.disposal.disposedViews
      || result.disposal.nativeAttributes !== result.disposal.uploadedNativeAttributes)
    throw Error('Flow disposal damaged shared native GPU buffers');
  if (result.lifecycle.activationCount !== 1 || result.lifecycle.extensionCount !== 1
      || result.lifecycle.expiryCount !== 1 || result.lifecycle.expiryTicks < 1 || !result.lifecycle.resetImmediate
      || !result.lifecycle.deathImmediate || !result.lifecycle.zeroDtFrozen || !result.lifecycle.disposed)
    throw Error('Flow native lifecycle regression');
  return { scenarios: names.length, overridePixelEquality: true, nativeBuffers: result.disposal.uploadedNativeBuffers,
    disposedViews: result.disposal.disposedViews, components: Object.keys(result.componentPixels) };
}

// Always bind inputs to this checkout. --exact-source additionally binds all
// inputs and this verifier to committed blobs, following check-inkwave-browser.
export function verifyFlowBuild(site, exactSource = false) {
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  if (manifest.schema !== 1 || hash(JSON.stringify(manifest.files)) !== manifest.inputHash
      || hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash || !/^[a-f0-9]{64}$/.test(manifest.build.revision))
    throw Error('Flow build identity mismatch');
  const inside = (root, file) => file.startsWith(root + path.sep);
  for (const [file, digest] of Object.entries(manifest.artifacts)) {
    const physical = fs.realpathSync(path.resolve(site, file));
    if (!inside(site, physical) || hash(fs.readFileSync(physical)) !== digest) throw Error('Flow artifact mismatch: ' + file);
  }
  const files = Object.entries(manifest.files).map(([key, digest]) => {
    const file = key.startsWith('upstream/') ? 'inkwave-public/' + key.slice(9)
      : key.startsWith('patch/') ? 'patches/splatoon3/' + key.slice(6)
        : key.startsWith('touch-layout/') ? 'patches/touch-layout/' + key.slice(13)
          : key.startsWith('reliability/') ? 'patches/reliability/' + key.slice(12)
            : key.startsWith('local-quality/') ? 'patches/local-quality/' + key.slice(14)
              : key.startsWith('network-replication/') ? 'patches/network-replication/' + key.slice(20) : null;
    if (!file || !inside(ROOT.replace(/\/$/, ''), fs.realpathSync(path.resolve(ROOT, file)))
        || hash(fs.readFileSync(path.join(ROOT, file))) !== digest) throw Error('Flow build input differs from source: ' + key);
    return file;
  });
  if (hash(fs.readFileSync(path.join(ROOT, 'scripts/build-inkwave.mjs'))) !== manifest.build.script)
    throw Error('Flow build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs', 'scripts/check-inkwave-flow-render.mjs');
  let sourceSha = null;
  if (exactSource) {
    sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const tree = new Map(execFileSync('git', ['ls-tree', '-r', '-z', sourceSha], { cwd: ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean).map(row => { const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]]; }));
    const blobs = execFileSync('git', ['hash-object', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    files.forEach((file, i) => { if (blobs[i] !== tree.get(file)) throw Error('Flow source differs from commit: ' + file); });
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
    const file = path.join(output, 'flow-render-result.json');
    fs.writeFileSync(file + '.writing', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.writing', file);
  };
  const errors = [], loaded = new Map(); let browser, server, page, identity, result, failure;
  const recordError = error => { if (errors.length < 20) errors.push(String(error).slice(0, 1800)); };
  publish({ status: 'running', gate: 'flow-render', startedAt: new Date().toISOString() });
  try {
    identity = verifyFlowBuild(site, process.argv.includes('--exact-source'));
    const { manifest } = identity, prefix = '/_versions/' + manifest.build.revision + '/';
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
    server = http.createServer((req, res) => {
      if (req.url === '/flow-render') {
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
        if (key !== 'flow-render') {
          if (!manifest.artifacts[key] || hash(body) !== manifest.artifacts[key]) throw Error('Flow loaded artifact mismatch: ' + key);
          loaded.set(key, { path: key, sha256: hash(body), bytes: body.length });
        }
        await route.fulfill({ response, body });
      } catch (error) { recordError(error.message); await route.abort(); }
    });
    await page.goto(address + '/flow-render');
    await page.addScriptTag({ content: 'globalThis.flowPixelDifference = ' + flowPixelDifference.toString() + ';' });
    result = await page.evaluate(async ({ prefix, width, height }) => {
      const THREE = await import('three');
      const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
      const { Level } = await import(prefix + 'src/world/level.js');
      const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
      const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
      const { flowMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/flow-motion.mjs');
      const { Actor, Character, G, Physics, PaintSystem, Projectiles } = install(profile);
      const assert = (condition, message) => { if (!condition) throw Error(message); };
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe7e9');
      const camera = new THREE.PerspectiveCamera(40, width / height, .05, 30);
      camera.position.set(2.5, 1.8, 3.8); camera.lookAt(0, .68, 0); camera.updateMatrixWorld(true);
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.setSize(width, height); renderer.setPixelRatio(1); document.body.appendChild(renderer.domElement);
      const gl = renderer.getContext(), uploads = new Map(), deleted = new Set(), vaosDeleted = new Set();
      const nativeBufferData = gl.bufferData, nativeDeleteBuffer = gl.deleteBuffer, nativeDeleteVAO = gl.deleteVertexArray;
      const nativeDrawElements = gl.drawElements, nativeDrawInstanced = gl.drawElementsInstanced;
      let currentFlowDraw = null;
      // All native GL calls still execute. Map actual attribute array uploads
      // to actual WebGLBuffer objects, then observe isBuffer/deleteBuffer.
      gl.bufferData = function (target, data, ...rest) {
        const result = nativeBufferData.call(this, target, data, ...rest);
        if (ArrayBuffer.isView(data)) uploads.set(data, this.getParameter(target === this.ARRAY_BUFFER
          ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING));
        return result;
      };
      gl.deleteBuffer = function (buffer) { deleted.add(buffer); return nativeDeleteBuffer.call(this, buffer); };
      gl.deleteVertexArray = function (vao) { vaosDeleted.add(vao); return nativeDeleteVAO.call(this, vao); };
      gl.drawElements = function (...args) {
        if (currentFlowDraw && args[1] > 0) currentFlowDraw[scene.overrideMaterial ? 'gpuOverride' : 'gpuBeauty']++;
        return nativeDrawElements.apply(this, args);
      };
      gl.drawElementsInstanced = function (...args) {
        if (currentFlowDraw && args[1] > 0 && args[4] > 0) currentFlowDraw[scene.overrideMaterial ? 'gpuOverride' : 'gpuBeauty']++;
        return nativeDrawInstanced.apply(this, args);
      };
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667477, 2.2));
      const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(3, 5, 4); scene.add(light);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(24, .5, 24), new THREE.MeshStandardMaterial({ color: 0xbfcbd0 }));
      floor.position.y = -.25; scene.add(floor);
      const level = new Level({ bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, spawnPads: [[-8, 0, 0], [8, 0, 0]],
        spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-12, -.5, -12], max: [12, 0, 12] }] });
      Object.assign(G, { scene, camera, renderer, settings: { quality: 'high', shadows: false }, mode: 'match', actors: [], time: 0,
        level, physics: new Physics(level), teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
        match: { playing: () => true, canRespawn: () => false } });
      const paint = G.paint = new PaintSystem(renderer, level, { atlasSize: 512, maxDensity: 8 });
      const projectiles = G.projectiles = new Projectiles(scene);
      const actor = new Actor({ team: 0, name: 'flow-render', CharacterClass: Character, weapon: 'dualies',
        style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      const victim = new Actor({ team: 1, name: 'flow-award-victim', CharacterClass: Character });
      const ch = actor.character; ch.actor = actor; victim.character.actor = victim;
      scene.add(ch.root); G.actors.push(actor, victim); actor.spawnAt(new THREE.Vector3(), 0);
      victim.pos.set(8, 0, 8); ch.setLod('game');
      const ao = new GTAOPass(scene, camera, width, height), target = new THREE.WebGLRenderTarget(width, height);
      const sources = new Map(), observed = new Map(), viewDisposals = [], images = [], rows = [];
      const flowMeshes = () => ch.root.getObjectsByProperty('isMesh', true).filter(mesh => mesh.name.startsWith('s3-flow-'));
      const shellMesh = mesh => mesh.name.startsWith('s3-flow-edge:') || mesh.name === 's3-flow-squid-edge';
      const drawable = mesh => { for (let node = mesh; node; node = node.parent) if (!node.visible) return false; return true; };
      const sourceFor = shell => shell.name === 's3-flow-squid-edge' ? ch.squid.body
        : shell.parent.children.find(mesh => mesh !== shell && !mesh.name.startsWith('s3-flow-') && mesh.geometry?.index === shell.geometry.index);
      const immutable = () => {
        for (const [source, record] of sources) {
          const geometry = source.geometry;
          assert(geometry === record.geometry && geometry.index === record.index && geometry.drawRange === record.range
            && geometry.drawRange.start === record.start && geometry.drawRange.count === record.count, 'Native index/drawRange mutated');
          assert(Object.keys(geometry.attributes).length === record.attributes.length, 'Native attribute set mutated');
          for (const [key, attribute, bytes] of record.attributes)
            assert(geometry.attributes[key] === attribute && attribute.array.length === bytes.length
              && attribute.array.every((value, i) => Object.is(value, bytes[i])), 'Native vertex attribute mutated: ' + key);
          assert(record.index.array.every((value, i) => value === record.indexBytes[i]), 'Native index bytes mutated');
        }
      };
      const observe = () => {
        for (const mesh of flowMeshes()) {
          if (observed.has(mesh)) continue;
          const log = { beauty: 0, override: 0, beautyZero: 0, overrideNonzero: 0, gpuBeauty: 0, gpuOverride: 0, vaos: new Set() };
          observed.set(mesh, log);
          const before = mesh.onBeforeRender, after = mesh.onAfterRender;
          mesh.onBeforeRender = function (...args) {
            before.apply(this, args);
            currentFlowDraw = log;
            const override = !!args[1].overrideMaterial;
            log[override ? 'override' : 'beauty']++;
            if (override && args[3].drawRange.count !== 0) log.overrideNonzero++;
            if (!override && !(args[3].drawRange.count > 0)) log.beautyZero++;
          };
          mesh.onAfterRender = function (...args) {
            after.apply(this, args);
            if (!args[1].overrideMaterial) log.vaos.add(gl.getParameter(gl.VERTEX_ARRAY_BINDING));
            currentFlowDraw = null;
          };
          if (shellMesh(mesh)) {
            const source = sourceFor(mesh); assert(source, 'Missing actual shell source');
            const g = source.geometry, view = mesh.geometry;
            assert(view !== g && view.drawRange !== g.drawRange && view.index === g.index, 'Shell geometry view identity');
            assert(view.attributes !== g.attributes && Object.keys(g.attributes).every(k => view.attributes[k] === g.attributes[k]), 'Shell borrowed attribute identity');
            if (mesh.isSkinnedMesh) {
              assert(mesh.skeleton === source.skeleton, 'Shell skeleton changed');
              const i = view.index.getX(0), native = new THREE.Vector3(), edge = new THREE.Vector3();
              ch.skeleton.update(); source.getVertexPosition(i, native); mesh.getVertexPosition(i, edge);
              assert(native.distanceTo(edge) < 1e-8, 'Native indexed skin output differs');
            }
            if (!sources.has(source)) sources.set(source, { geometry: g, index: g.index, indexBytes: Array.from(g.index.array),
              range: g.drawRange, start: g.drawRange.start, count: g.drawRange.count,
              attributes: Object.entries(g.attributes).map(([key, a]) => [key, a, Array.from(a.array)]) });
            view.addEventListener('dispose', () => viewDisposals.push({ view, detached: view.index === null
              && Object.keys(view.attributes).length === 0 && Object.keys(view.morphAttributes).length === 0 }));
          }
        }
      };
      const step = (dt = 1 / 60) => {
        G.time += dt; actor.anim.time = G.time; actor.update(dt); ch.root.updateMatrixWorld(true); observe();
        assert(Array.from(ch.P).every(Number.isFinite) && Array.from(ch.ikErr).every(Number.isFinite), 'Non-finite native pose/IK');
      };
      const gameplayState = () => JSON.stringify({ position: actor.pos.toArray(), velocity: actor.vel.toArray(),
        root: ch.root.position.toArray(), yaw: actor.yaw, rootRotation: ch.root.rotation.toArray(), input: actor.intent,
        time: G.time, poseTime: ch.t, ink: actor.ink, hp: actor.hp, flow: actor.s3.flow,
        weapon: actor.weaponId, special: actor.special, fuses: projectiles.bombs?.map(bomb => bomb.fuse) || [],
        runner: Object.fromEntries(['cooldown', 'chargeT', 'charge', 'slosh', 'lockT', 'streaming', 'aimingSub']
          .map(key => [key, actor.weaponRunner[key]])) });
      const render = pass => {
        const before = gameplayState();
        if (pass === 'beauty') {
          renderer.setRenderTarget(null);
          // Let native renderer matrix/skeleton/material bookkeeping settle
          // without advancing Character, Actor, gameplay or animation clocks.
          renderer.render(scene, camera); renderer.render(scene, camera);
        }
        else { ao.output = GTAOPass.OUTPUT[pass === 'ao' ? 'AO' : pass === 'depth' ? 'Depth' : 'Normal']; ao.render(renderer, target, target); }
        const pixels = new Uint8Array(width * height * 4);
        if (pass === 'beauty') gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        else renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        assert(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), 'Actual WebGL error: ' + pass);
        assert(gameplayState() === before, 'Render changed authoritative gameplay/clocks/root: ' + pass);
        immutable(); return pixels;
      };
      const hidden = action => {
        const saved = flowMeshes().map(mesh => [mesh, mesh.visible]);
        for (const [mesh] of saved) mesh.visible = false;
        try { return action(); } finally { for (const [mesh, visible] of saved) mesh.visible = visible; }
      };
      const pair = pass => {
        const visible = render(pass);
        return hidden(() => {
          const first = render(pass);
          if (pass !== 'beauty') return globalThis.flowPixelDifference(visible, first);
          const second = render(pass), third = render(pass);
          return { ...globalThis.flowPixelDifference(visible, first),
            repeatedHidden: [globalThis.flowPixelDifference(first, second), globalThis.flowPixelDifference(second, third)] };
        });
      };
      const capture = name => {
        const activeMeshes = flowMeshes().filter(drawable), pixels = {};
        const callsBefore = [...observed.values()].reduce((n, log) => n + log.beauty, 0);
        const drawsBefore = [...observed.values()].reduce((n, log) => n + log.gpuBeauty, 0);
        for (const pass of ['beauty', 'normal', 'depth', 'ao']) pixels[pass] = pair(pass);
        render('beauty');
        if (['kid-entry', 'squid-entry', 'off'].includes(name)) images.push({ name, image: renderer.domElement.toDataURL('image/png') });
        const logs = [...observed.values()];
        rows.push({ name, pixels, snapshot: flowMotionSnapshot(ch), visibleMeshes: activeMeshes.length,
          flowBeautyCalls: [...observed.values()].reduce((n, log) => n + log.beauty, 0) - callsBefore,
          flowGpuBeautyDraws: [...observed.values()].reduce((n, log) => n + log.gpuBeauty, 0) - drawsBefore,
          flowGpuOverrideDraws: logs.reduce((n, log) => n + log.gpuOverride, 0),
          overrideMeshes: activeMeshes.filter(mesh => observed.get(mesh).override > 0).length,
          overrideNonzero: logs.reduce((n, log) => n + log.overrideNonzero, 0), beautyZero: logs.reduce((n, log) => n + log.beautyZero, 0),
          sourceGeometryChanged: false, nativeIK: Array.from(ch.ikErr) });
        globalThis.flowProbeProgress = { name, rows: rows.length };
      };
      const prepare = () => {
        // Real native paint/turf and native splat event; no assigned active flag.
        paint.clear();
        actor.addTurf(paint.splat(new THREE.Vector3(0, .05, 0), 20, 0, { seed: .5, instant: true }));
        for (let i = 0; i < 4 && !actor.s3.flow.active; i++) {
          if (!victim.alive) victim.reset(); victim.splat(actor);
        }
        assert(actor.s3.flow.active && actor.s3.flow.remaining === profile.flow.duration, 'Native Flow activation failed');
      };
      try {
        for (let i = 0; i < 36; i++) step();
        prepare(); for (let i = 0; i < 6; i++) step(); capture('kid-entry');
        const componentPixels = {};
        for (const component of ['shell', 'glint', 'ribbon']) {
          const before = render('beauty'), saved = flowMeshes().filter(mesh => component === 'shell' ? shellMesh(mesh)
            : component === 'glint' ? mesh.name === 's3-flow-glints' : mesh.name.startsWith('s3-flow-entry-spiral')).map(mesh => [mesh, mesh.visible]);
          for (const [mesh] of saved) mesh.visible = false;
          componentPixels[component] = globalThis.flowPixelDifference(before, render('beauty'));
          for (const [mesh, visible] of saved) mesh.visible = visible;
        }
        // Actual GPU counterexample: bypass only these meshes' override gates,
        // recreating the original opaque-occluder bug in the same posed scene.
        // Keep the immutable loaded module and every native callback intact.
        const unsafeOverridePixels = {}, safeCallbacks = flowMeshes().map(mesh => [mesh, mesh.onBeforeRender, mesh.geometry.drawRange.count]);
        try {
          for (const [mesh, callback, count] of safeCallbacks) mesh.onBeforeRender = function (...args) {
            if (args[1].overrideMaterial) args[3].drawRange.count = count;
            else callback.apply(this, args);
          };
          for (const pass of ['normal', 'depth', 'ao']) unsafeOverridePixels[pass] = pair(pass);
        } finally {
          for (const [mesh, callback, count] of safeCallbacks) { mesh.onBeforeRender = callback; mesh.geometry.drawRange.count = count; }
        }
        for (let i = 0; i < 42; i++) step(); capture('kid-active');
        const nativePixels = {};
        for (const pass of ['normal', 'depth', 'ao']) {
          const before = render(pass); ch.root.visible = false;
          nativePixels[pass] = globalThis.flowPixelDifference(before, render(pass)); ch.root.visible = true;
        }
        const frozen = JSON.stringify(flowMotionSnapshot(ch)); step(0);
        const zeroDtFrozen = frozen === JSON.stringify(flowMotionSnapshot(ch));
        const remaining = actor.s3.flow.remaining; victim.reset(); victim.splat(actor);
        assert(actor.s3.flow.remaining === Math.min(profile.flow.maxDuration, remaining + profile.flow.extension), 'Native extension failed');
        for (let i = 0; i < 6; i++) step(); capture('extension');
        actor.intent.squid = true; for (let i = 0; i < 8; i++) step(); capture('squid-entry');
        for (let i = 0; i < 40; i++) step(); capture('squid-active');
        actor.intent.squid = false; for (let i = 0; i < 30; i++) step(); capture('kid-return');
        // Full native duration, fixed input: no timer shortening or fake expiry.
        let expiryTicks = 0;
        while (actor.s3.flow.active && expiryTicks < Math.ceil(profile.flow.maxDuration * 60) + 2) { step(); expiryTicks++; }
        assert(!actor.s3.flow.active && flowMotionSnapshot(ch).phase === 'expiry', 'Native expiry not reached'); capture('expiry');
        for (let i = 0; i < 20; i++) step(); capture('off');
        const lifecycle = { activationCount: flowMotionSnapshot(ch).activationCount, extensionCount: flowMotionSnapshot(ch).extensionCount,
          expiryCount: flowMotionSnapshot(ch).expiryCount, expiryTicks, zeroDtFrozen };
        prepare(); for (let i = 0; i < 6; i++) step(); actor.reset();
        lifecycle.resetImmediate = flowMotionSnapshot(ch).phase === 'off' && flowMeshes().every(mesh => !drawable(mesh)); capture('reset');
        prepare(); for (let i = 0; i < 6; i++) step(); actor.splat(null);
        lifecycle.deathImmediate = flowMotionSnapshot(ch).phase === 'off' && flowMeshes().every(mesh => !drawable(mesh)); capture('death');
        actor.reset(); ch.setVisible(true); prepare(); for (let i = 0; i < 6; i++) step(); ch.setVisible(false); capture('hidden');
        ch.setVisible(true); step(); render('beauty');
        // A surviving native Character uses the same cached indexed geometry.
        // Measure exact pixels and GL buffer identity across Flow owner disposal.
        const survivor = new Character({ color: actor.color, weapon: 'dualies', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
        survivor.setLod('game'); survivor.update(1 / 60, { ...actor.anim, time: G.time, form: 'kid' });
        scene.add(survivor.root); ch.root.visible = false; const survivorBefore = render('beauty');
        const survivorNormalBefore = render('normal');
        const survivorNative = globalThis.flowPixelDifference(survivorBefore, (() => { survivor.root.visible = false; const p = render('beauty'); survivor.root.visible = true; return p; })());
        const borrowedArrays = new Set([...sources.values()].flatMap(r => [r.index.array, ...r.attributes.map(([, a]) => a.array)]));
        const buffers = new Set([...borrowedArrays].map(a => uploads.get(a)).filter(Boolean));
        assert([...borrowedArrays].every(a => uploads.has(a) && gl.isBuffer(uploads.get(a)))
          && buffers.size > 0 && [...sources.keys()].some(source => survivor.root.getObjectsByProperty('isMesh', true)
          .some(mesh => mesh.geometry?.index === source.geometry.index)), 'No native shared geometry/GPU buffers');
        const ownedBuffers = new Set(flowMeshes().filter(mesh => !shellMesh(mesh)).flatMap(mesh =>
          [mesh.geometry.index, ...Object.values(mesh.geometry.attributes), mesh.instanceMatrix].filter(Boolean).map(a => uploads.get(a.array))).filter(Boolean));
        const vaos = new Set([...observed].filter(([mesh]) => shellMesh(mesh)).flatMap(([, log]) => [...log.vaos]).filter(Boolean));
        const deletedBefore = new Set(deleted), vaoBefore = new Set(vaosDeleted);
        ch.dispose(); ch.dispose(); immutable();
        const survivorAfter = render('beauty'), survivorNormalAfter = render('normal');
        const disposal = { uploadedNativeBuffers: buffers.size,
          nativeAttributes: borrowedArrays.size, uploadedNativeAttributes: [...borrowedArrays].filter(a => uploads.has(a)).length,
          deletedNativeBuffers: [...buffers].filter(b => deleted.has(b) && !deletedBefore.has(b)).length,
          nativeBuffersAlive: [...buffers].filter(b => gl.isBuffer(b)).length,
          deletedOwnedBuffers: [...ownedBuffers].filter(b => deleted.has(b) && !deletedBefore.has(b)).length,
          releasedViewVAOs: [...vaos].filter(vao => vaosDeleted.has(vao) && !vaoBefore.has(vao)).length,
          disposedViews: viewDisposals.length, detachedViews: viewDisposals.filter(r => r.detached).length,
          survivorPixels: survivorNative.changedPixels,
          survivorNormalChangedBytes: globalThis.flowPixelDifference(survivorNormalBefore, survivorNormalAfter).changedBytes,
          survivorChangedBytes: globalThis.flowPixelDifference(survivorBefore, survivorAfter).changedBytes };
        lifecycle.disposed = flowMotionSnapshot(ch).disposed; survivor.dispose();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { rows, nativePixels, componentPixels, unsafeOverridePixels, lifecycle, disposal, images,
          gpu: { webgl: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
          fixture: { source: 'immutable site; production install once; native Actor.update/Runner/full Character/native IK/Physics/Level/PaintSystem/Projectiles',
            driver: 'fixed inputs; native turf and splat awards; full native Flow duration; no whole-game update',
            render: 'actual WebGL beauty and GTAOPass.render normal/depth/AO pixel readback; real GL buffer/VAO instrumentation',
            boundaries: 'flat diagnostic box and match playing/canRespawn boundary; projectiles created but not advanced; Chromium software WebGL, not Switch/iOS or Nintendo image parity',
            beautyRepeat: 'raw beauty differences and hidden/hidden controls retained; inactive Flow requires zero visible meshes and zero actual renderer callbacks; survivor uses exact normal pixels plus actual native GL buffer survival' } };
      } finally {
        ch.dispose(); victim.character.dispose(); projectiles.clear(); paint.dispose(); ao.dispose(); target.dispose();
        floor.geometry.dispose(); floor.material.dispose(); renderer.dispose(); renderer.domElement.remove();
        gl.bufferData = nativeBufferData; gl.deleteBuffer = nativeDeleteBuffer; gl.deleteVertexArray = nativeDeleteVAO;
        gl.drawElements = nativeDrawElements; gl.drawElementsInstanced = nativeDrawInstanced;
      }
    }, { prefix, width: WIDTH, height: HEIGHT });
    result.summary = validateFlowRenderResult(result);
    const required = ['patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/flow-motion.mjs',
      'patches/splatoon3/runtime/flow.mjs', 'src/game/actor.js', 'src/game/character.js', 'src/game/weapons.js',
      'vendor/three/build/three.module.js', 'vendor/three/jsm/postprocessing/GTAOPass.js'];
    for (const file of required) if (!loaded.has(prefix.slice(1) + file)) throw Error('Actual Flow/GTAO module not loaded: ' + file);
    if (errors.length) throw Error('Flow browser/shader errors: ' + errors.join('; '));
    for (const entry of result.images) {
      const file = path.join(output, entry.name + '.png');
      fs.writeFileSync(file + '.writing', Buffer.from(entry.image.split(',')[1], 'base64')); fs.renameSync(file + '.writing', file);
    }
    delete result.images;
    // Revalidate after browser work, detecting site or input mutations in flight.
    const after = verifyFlowBuild(site, process.argv.includes('--exact-source'));
    if (after.source.sourceSha !== identity.source.sourceSha || after.source.verifierSha256 !== identity.source.verifierSha256)
      throw Error('Flow source/verifier identity changed during verification');
    result.toolchain = { node: process.version, chromium: browser.browser()?.version() || null };
  } catch (error) {
    failure = error;
    try { if (page) result = { ...(result || {}), progress: await page.evaluate(() => globalThis.flowProbeProgress || null) }; } catch {}
    try { await page?.screenshot({ path: path.join(output, 'flow-render-failed.png'), timeout: 10000 }); } catch {}
  } finally {
    try { await browser?.close(); } catch (error) { failure ||= error; }
    try { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } catch (error) { failure ||= error; }
  }
  const receipt = { ...result, status: failure ? 'failed' : 'passed', gate: 'flow-render', finishedAt: new Date().toISOString(),
    contentHash: identity?.manifest.contentHash || null, build: identity?.manifest.build || null, source: identity?.source || null,
    command: process.argv, loaded: [...loaded.values()], errors, ...(failure ? { message: String(failure.message || failure).slice(0, 2500) } : {}) };
  publish(receipt);
  console.log(JSON.stringify({ status: receipt.status, sourceSha: receipt.source?.sourceSha, contentHash: receipt.contentHash,
    summary: receipt.summary, message: receipt.message, evidence: path.join(output, 'flow-render-result.json') }));
  if (failure) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
