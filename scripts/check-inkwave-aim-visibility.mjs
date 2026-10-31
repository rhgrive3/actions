// Production app QA. Uses trusted menu entry, the real computeAim/guide path,
// native collision/camera updates and rendered shader uniforms. No guide or
// shader injection. Screenshot metrics validate this build's calibrated UI;
// they are not a claim of pixel-identical Nintendo rendering.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
import { ALTERNATE_WEAPON_KITS } from '../patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';

const site = path.resolve(process.argv[2] || '_site');
const out = path.resolve(process.argv[3] || '.ci-scratch/inkwave-aim-visibility');
const only = (process.argv.find(x => x.startsWith('--viewports=')) || '').split('=')[1];
const selected = only ? new Set(only.split(',')) : null;
const viewports = [
  { name: 'desktop720', width: 1280, height: 720, dpr: 1, touch: false },
  { name: 'desktop1080', width: 1920, height: 1080, dpr: 1, touch: false },
  { name: 'mobile844', width: 844, height: 390, dpr: 2, touch: true },
].filter(x => !selected || selected.has(x.name));
assert(viewports.length, 'Select at least one known viewport');
const bases = ['blaster', 's3-blaster-short', 's3-blaster-long', 's3-blaster-lightshort', 's3-blaster-light', 's3-blaster-lightlong', 's3-blaster-precision'];
const variants = ALTERNATE_WEAPON_KITS.filter(x => bases.includes(x.baseId));
const script = fs.readFileSync(new URL(import.meta.url));
const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
const suppliedSourceSha = process.env.SOURCE_SHA || null;
if (suppliedSourceSha !== null) {
  assert.match(suppliedSourceSha, /^[0-9a-f]{40}$/i, 'SOURCE_SHA must be a full Git commit hash');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' }).trim();
  assert.equal(head, suppliedSourceSha.toLowerCase(), 'SOURCE_SHA must match the checked-out Git HEAD');
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'probe.mjs.txt'), script);
const tempStat = fs.statfsSync(os.tmpdir());
const receipt = {
  status: 'running', basis: 'normal emitted app; actual camera, computeAim and projectile guide; no controlled guide',
  probeScriptSha256: crypto.createHash('sha256').update(script).digest('hex'),
  contentHash: build.contentHash, build: build.contentHash, sourceSha: suppliedSourceSha?.toLowerCase() || null,
  environment: { tempDirectory: os.tmpdir(), tempAvailableBytes: tempStat.bavail * tempStat.bsize, browserIsolation: 'fresh process per viewport' },
  seed: 0x41494d56, errors: [], consoleErrors: [], badResponses: [], scenarios: [],
  limits: ['SwiftShader browser validation; hardware GPU and retail Switch rendering not measured'],
};
const persist = () => fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/favicon.ico' && !fs.existsSync(path.join(site, 'favicon.ico'))) { res.writeHead(204); return res.end(); }
  const file = path.resolve(site, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser, activePage, naturalPose = null;
const close = (actual, expected, tolerance, label) => assert(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' vs ' + expected);
function validateReticle(row, viewport) {
  assert.equal(row.kind, 'blaster', row.weapon + ' must use the Blaster presentation');
  assert(row.guide?.point && row.guide.point.every(Number.isFinite), row.weapon + ' needs its actual world guide');
  assert(row.cameraMark && row.impactMark, 'Both independent reticle groups must exist');
  assert(row.aimGuide?.point && row.aimGuide.point.every(Number.isFinite), row.weapon + ' needs its unobstructed world aim guide');
  close(row.cameraMark.x, row.aimGuide.screen[0], .35, 'Unobstructed aim mark x');
  close(row.cameraMark.y, row.aimGuide.screen[1], .35, 'Unobstructed aim mark y');
  const scale = Math.min(viewport.width / 1280, viewport.height / 720);
  const shortSblast = row.sourceActor === 'WeaponBlasterPrecision' && !row.grounded;
  close(row.cameraMark.radius, (shortSblast ? 23 : 13) * scale, .1, 'Aim ring CSS-pixel radius');
  if (row.impactMark.visible) {
    close(row.impactMark.x, row.guide.screen[0], .35, 'Impact mark x');
    close(row.impactMark.y, row.guide.screen[1], .35, 'Impact mark y');
    close(row.impactMark.radius, 12.5 * scale, .1, 'Impact ring CSS-pixel radius');
  }
  assert(row.material.opacity !== null, 'Fade uniform must exist in the actual rendered materials');
  assert.equal(row.otherPlayers.fadeMaterials, 0, 'Non-local players must not acquire the local fade program');
  assert.deepEqual(row.otherPlayers.changedSources, [], 'Shared material alpha/depth state must stay unchanged');
  assert.deepEqual(row.shaderErrors, [], 'All emitted shader programs must compile/link');
}

try {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browserOptions = { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  for (let viewportIndex = 0; viewportIndex < viewports.length; viewportIndex++) {
    const viewport = viewports[viewportIndex];
    // Dispose the full SwiftShader/GPU process between independent viewport
    // fixtures instead of retaining warmed programs from a prior high/AO run.
    browser = await chromium.launch(browserOptions);
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, hasTouch: viewport.touch, isMobile: viewport.touch });
    const page = activePage = await context.newPage();
    const scenario = { ...viewport, weapons: [], naturalSearch: [], screenshots: [] };
    receipt.scenarios.push(scenario); persist();
    page.on('pageerror', e => receipt.errors.push({ viewport: viewport.name, error: e.message }));
    page.on('console', message => { if (message.type() === 'error') receipt.consoleErrors.push({ viewport: viewport.name, error: message.text() }); });
    page.on('response', response => { if (response.status() >= 400) receipt.badResponses.push({ viewport: viewport.name, status: response.status(), url: response.url() }); });
    await page.addInitScript(() => {
      let seed = 0x41494d56;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', lang: 'en', shadows: false, bloom: false, minimap: false, musicVolume: 0 }));
    });
    console.log(viewport.name, 'entering production menu');
    scenario.entry = await enterRangeFromMenu(page, base, { touch: viewport.touch, timeout: 240000, onProgress: state => console.log(viewport.name, state.route.join('/')) });
    await page.evaluate(async () => {
      const G = window.__G, game = window.__inkwave, actor = G.match.local;
      game.debug.freeze(); game.debug.freezeBots(); game.debug.fire(false);
      G.match.range.movingTargets = false; actor.invuln = 0;
      await actor.character.sourceMotion?.ready;
      const sources = new Map();
      const signature = material => [material.opacity, material.transparent, material.depthWrite, material.side];
      const eachMaterial = (root, callback) => root?.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material?.isMaterial) callback(material, object);
      });
      const otherPlayers = () => {
        let fadeMaterials = 0, meshes = 0;
        const changedSources = [];
        for (const other of G.actors || []) if (other !== actor) eachMaterial(other.character?.root, material => {
          meshes++;
          if (String(material.customProgramCacheKey?.()).includes('iwLocalAimFade') || G.renderer.properties.get(material).uniforms?.uIwLocalAimOpacity) fadeMaterials++;
          const value = signature(material), before = sources.get(material);
          if (before && value.some((v, i) => v !== before[i])) changedSources.push({ uuid: material.uuid, before, after: value });
          if (!before) sources.set(material, value);
        });
        for (const material of Object.values(actor.character.mats || {})) if (material?.isMaterial) {
          const value = signature(material), before = sources.get(material);
          if (String(material.customProgramCacheKey?.()).includes('iwLocalAimFade')) fadeMaterials++;
          if (before && value.some((v, i) => v !== before[i])) changedSources.push({ localSource: true, uuid: material.uuid, before, after: value });
          if (!before) sources.set(material, value);
        }
        return { actors: (G.actors || []).filter(x => x !== actor).length, meshes, fadeMaterials, changedSources };
      };
      const materialState = () => {
        const uniforms = new Set(), materials = new Set();
        eachMaterial(actor.character.root, material => {
          materials.add(material);
          const uniform = G.renderer.properties.get(material).uniforms?.uIwLocalAimOpacity;
          if (uniform) uniforms.add(uniform);
        });
        const values = [...uniforms].map(x => x.value);
        return { opacity: values.length ? Math.min(...values) : null, uniformValues: values, materials: materials.size };
      };
      const mark = (name, radius) => {
        const group = game.hud.ret.querySelector('[data-blaster="' + name + '"]');
        if (!group) return null;
        const matrix = group.getScreenCTM(); if (!matrix) return null;
        const center = new DOMPoint(0, 0).matrixTransform(matrix);
        const edge = new DOMPoint(radius, 0).matrixTransform(matrix);
        return { x: center.x, y: center.y, radius: Math.hypot(edge.x - center.x, edge.y - center.y), visible: getComputedStyle(group).display !== 'none', transform: group.getAttribute('transform') };
      };
      const guide = () => {
        const camera = game.rig.gameCam || G.camera;
        const pair = G.projectiles.s3BlasterReticleGuides?.(actor, actor.weapon, camera, innerWidth, innerHeight);
        if (!pair?.aim || !pair?.impact) return null;
        const project = point => {
          const projected = point.clone().project(camera);
          return { point: point.toArray(), screen: projected.z < 1 ? [(projected.x + 1) * innerWidth / 2, (1 - projected.y) * innerHeight / 2] : [innerWidth / 2, innerHeight / 2], projected: projected.toArray() };
        };
        return { aim: project(pair.aim), impact: project(pair.impact) };
      };
      const snapshot = () => {
        const head = actor.character.getHeadPosition(actor.pos.clone());
        const cameraPosition = G.camera.position;
        const node = game.hud.ret.querySelector('[data-blaster="nw"]');
        const transform = node?.transform.baseVal.consolidate()?.matrix;
        const guides = guide();
        const aimRadius = Number(game.hud.ret.querySelector('[data-blaster="camera-ring"]')?.getAttribute('r') || 13);
        const chest = head.clone(); actor.character.bones?.chest?.getWorldPosition(chest);
        const projectBody = (point, radius) => {
          const projected = point.clone().project(G.camera), depth = -point.clone().applyMatrix4(G.camera.matrixWorldInverse).z;
          return { screen: [(projected.x + 1) * innerWidth / 2, (1 - projected.y) * innerHeight / 2], distance: cameraPosition.distanceTo(point), radiusPixels: radius * Math.abs(G.camera.projectionMatrix.elements[5]) / Math.max(G.camera.near, depth) * innerHeight / 2 };
        };
        const headProjection = projectBody(head, .27), chestProjection = projectBody(chest, .28);
        const distancePixels = (guide, body) => guide ? Math.hypot(guide.screen[0] - body.screen[0], guide.screen[1] - body.screen[1]) : null;
        return {
          weapon: actor.weaponId, sourceActor: actor.weapon.catalogRecord?.sourceActor || actor.weapon.catalogRecord?.sourceMainActor || null,
          family: actor.weapon.behaviorKind || actor.weapon.catalogRecord?.family || actor.weapon.kind,
          kind: game.hud._L.kind, controllerGuide: G.match.controller.shotGuide || null,
          reticleDom: (() => { const rows = []; let node = game.hud.ret.querySelector('[data-blaster="camera"]'); for (; node; node = node.parentElement) { const css = getComputedStyle(node); rows.push({ tag: node.tagName, class: node.getAttribute('class'), style: node.getAttribute('style'), transform: css.transform, scale: css.scale, translate: css.translate, width: css.width, height: css.height, blasterScale: css.getPropertyValue('--iw-blaster-scale'), reticleScale: css.getPropertyValue('--iw-reticle-scale') }); } return { viewport: [innerWidth, innerHeight, devicePixelRatio], rows }; })(),
          position: actor.pos.toArray(), camera: cameraPosition.toArray(), head: head.toArray(), headDistance: cameraPosition.distanceTo(head),
          yaw: game.rig.yaw, pitch: game.rig.pitch, grounded: actor.grounded, spread: actor.weaponRunner.spread,
          overlapGeometry: { head: headProjection, chest: chestProjection, nearDistance: Math.min(headProjection.distance, chestProjection.distance), aimToHeadPixels: distancePixels(guides?.aim, headProjection), impactToHeadPixels: distancePixels(guides?.impact, headProjection), aimToChestPixels: distancePixels(guides?.aim, chestProjection), impactToChestPixels: distancePixels(guides?.impact, chestProjection) },
          inRange: G.match.controller.inRange, onTarget: !!G.match.controller.onTarget,
          guide: guides?.impact || null, aimGuide: guides?.aim || null, cameraMark: mark('camera', aimRadius), impactMark: mark('impact', 12.5),
          halfExtent: transform ? [Math.abs(transform.e), Math.abs(transform.f)] : null,
          material: materialState(), otherPlayers: otherPlayers(),
          shaderErrors: (G.renderer.info.programs || []).filter(p => p.diagnostics?.runnable === false).map(p => p.diagnostics),
        };
      };
      const step = (frames = 45) => {
        game._skipRender = true;
        try { for (let i = 0; i < frames; i++) game._frame(1 / 60); }
        finally { game._skipRender = false; }
        game._frame(0);
      };
      const pose = (data, frames = 50) => {
        game.debug.key('Space', false); game.debug.fire(false);
        actor.form = 'kid'; actor.alive = true; actor.invuln = 0;
        actor.pos.fromArray(data.position); actor.vel.set(0, 0, 0);
        actor.yaw = actor.aimYaw = data.yaw; game.rig.follow(actor, true);
        game.rig.yaw = data.yaw; game.rig.pitch = data.pitch;
        step(frames); return snapshot();
      };
      window.__aimQA = { snapshot, pose, step, materialState, otherPlayers, sources, eachMaterial };
      pose({ position: [-14.6, .04, 0], yaw: 0, pitch: -.4 });
    });
    // Let the real CSS entrance animation finish. Native simulation stepping
    // is synchronous; it must not mistake the normal initial scale(.4) for
    // steady-state artwork. Do not disable or finish animations artificially.
    await page.waitForFunction(() => { const node = window.__inkwave?.hud?.xh; if (!node) return false; const style = getComputedStyle(node); return (style.scale === 'none' || Math.abs(parseFloat(style.scale) - 1) < 1e-6) && parseFloat(style.opacity) > .999; }, null, { timeout: 30000 });
    const shot = async name => {
      const file = viewport.name + '-' + name + '.png';
      await page.screenshot({ path: path.join(out, file) }); scenario.screenshots.push(file);
    };
    for (const id of [...bases, ...(viewportIndex === 0 ? variants.map(x => x.id) : [])]) {
      const row = await page.evaluate(async id => {
        const G = window.__G, game = window.__inkwave;
        G.match.range.setWeapon(id); if (G.match.local.weaponId !== id) throw Error('Weapon selection did not commit: ' + id);
        await G.match.local.character.sourceMotion?.ready;
        return window.__aimQA.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: -.4 }, 35);
      }, id);
      scenario.weapons.push(row); persist(); validateReticle(row, viewport);
      if (bases.includes(id)) await shot(id);
      console.log(viewport.name, id, 'aim/impact separation', Math.hypot(row.guide.screen[0] - row.aimGuide.screen[0], row.guide.screen[1] - row.aimGuide.screen[1]).toFixed(2), 'opacity', row.material.opacity);
    }
    assert(scenario.weapons.some(row => row.impactMark.visible && Math.hypot(row.impactMark.x - row.cameraMark.x, row.impactMark.y - row.cameraMark.y) > 2), 'Terrain contact must visibly separate from the unobstructed aim mark');
    scenario.cache = await page.evaluate(() => {
      const G = window.__G, game = window.__inkwave, actor = G.match.local, ps = G.projectiles;
      const counts = { muzzle: 0, aim: 0, los: 0, sweep: 0 }, undo = [];
      for (const [object, key, count] of [[ps, '_muzzle', 'muzzle'], [ps, '_aimFrom', 'aim'], [G.physics, 'los', 'los'], [G.physics, 'sweepSphere', 'sweep']]) {
        if (typeof object?.[key] !== 'function') continue;
        const original = object[key]; object[key] = function (...args) { counts[count]++; return original.apply(this, args); };
        undo.push(() => { object[key] = original; });
      }
      try {
        const camera = game.rig.gameCam || G.camera;
        const first = ps.s3BlasterReticleGuides(actor, actor.weapon, camera, innerWidth, innerHeight), before = { ...counts };
        const second = ps.s3BlasterReticleGuides(actor, actor.weapon, camera, innerWidth, innerHeight);
        return { weapon: actor.weaponId, samePointObject: first === second && first.aim === second.aim && first.impact === second.impact, aim: second.aim.toArray(), impact: second.impact.toArray(), first: before, secondDelta: Object.fromEntries(Object.keys(counts).map(key => [key, counts[key] - before[key]])) };
      } finally { for (const restore of undo) restore(); }
    });
    assert(scenario.cache.samePointObject); assert(Object.values(scenario.cache.secondDelta).every(x => x === 0), 'Repeated HUD query must not replay muzzle/aim/LOS work');
    scenario.frameCache = await page.evaluate(() => {
      const G = window.__G, game = window.__inkwave, ps = G.projectiles;
      const counts = { muzzle: 0, aim: 0, los: 0, segment: 0, raycast: 0, blocks: 0 }, undo = [], calls = [];
      for (const [object, key, count] of [[ps, '_muzzle', 'muzzle'], [ps, '_aimFrom', 'aim'], [G.physics, 'los', 'los'], [G.physics, 'segment', 'segment'], [G.physics, 'raycast', 'raycast'], [G.physics.level, 'queryBlocks', 'blocks']]) {
        if (typeof object?.[key] !== 'function') continue;
        const original = object[key]; object[key] = function (...args) { counts[count]++; return original.apply(this, args); };
        undo.push(() => { object[key] = original; });
      }
      const pair = ps.s3BlasterReticleGuides;
      ps.s3BlasterReticleGuides = function (...args) {
        const before = { ...counts }, result = pair.apply(this, args);
        calls.push({ weapon: args[0].weaponId, time: G.time, viewport: args.slice(3), delta: Object.fromEntries(Object.keys(counts).map(key => [key, counts[key] - before[key]])), valid: !!(result?.aim && result?.impact) });
        return result;
      };
      try { game._frame(1 / 60); return { calls }; }
      finally { ps.s3BlasterReticleGuides = pair; for (const restore of undo) restore(); }
    });
    assert(scenario.frameCache.calls.length >= 2, 'Actual frame must let self visibility and the HUD consume the shared pair');
    assert(scenario.frameCache.calls.every(row => row.valid), 'Both frame consumers need actual aim and impact endpoints');
    assert(scenario.frameCache.calls.slice(1).every(row => Object.values(row.delta).every(value => value === 0)), 'Later same-frame HUD reads must reuse the self-visibility prediction');
    scenario.jump = await page.evaluate(() => {
      const G = window.__G, game = window.__inkwave, qa = window.__aimQA;
      G.match.range.setWeapon('blaster'); qa.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: -.4 });
      const standing = qa.snapshot(), frames = [];
      game.debug.key('Space', true); game._skipRender = true;
      try { for (let i = 0; i < 22; i++) { game._frame(1 / 60); if (i === 0) game.debug.key('Space', false); if (i % 3 === 0) frames.push(qa.snapshot()); } }
      finally { game._skipRender = false; game.debug.key('Space', false); }
      game._frame(0); return { standing, frames };
    });
    assert(scenario.jump.frames.some(x => !x.grounded), 'Native Space input must produce an actual jump');
    assert(scenario.jump.frames.some(x => x.halfExtent?.[0] > scenario.jump.standing.halfExtent[0] + .25), 'Hot Blaster horizontal reticle envelope must expand in the actual jump');
    assert(scenario.jump.frames.every(x => Math.abs(x.halfExtent[1] - scenario.jump.standing.halfExtent[1]) < .05), 'Jump envelope must retain its vertical half-extent');
    await shot('jump');
    scenario.sblastJump = await page.evaluate(async () => {
      const G = window.__G, game = window.__inkwave, qa = window.__aimQA;
      G.match.range.setWeapon('s3-blaster-precision'); await G.match.local.character.sourceMotion?.ready;
      qa.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: -.4 });
      const standing = qa.snapshot(), frames = [];
      game.debug.key('Space', true); game._skipRender = true;
      try { for (let i = 0; i < 22; i++) { game._frame(1 / 60); if (i === 0) game.debug.key('Space', false); if (i % 3 === 0) frames.push(qa.snapshot()); } }
      finally { game._skipRender = false; game.debug.key('Space', false); }
      game._frame(0); return { standing, frames, final: qa.snapshot() };
    });
    validateReticle(scenario.sblastJump.standing, viewport);
    assert(scenario.sblastJump.frames.some(row => !row.grounded), 'S-BLAST native jump enters the short mode');
    for (const row of scenario.sblastJump.frames.filter(row => !row.grounded)) {
      validateReticle(row, viewport);
      close(row.halfExtent[1], 28.1, .01, 'Airborne S-BLAST short-mode vertical extent');
      close(row.halfExtent[0], 28.1 + 229 * Math.tan(row.spread * Math.PI / 180), .01, 'Airborne S-BLAST uses actual runner spread');
    }
    await shot('sblast-air');
    await page.evaluate(async () => { window.__G.match.range.setWeapon('blaster'); await window.__G.match.local.character.sourceMotion?.ready; });
    const poses = [
      ...(naturalPose ? [naturalPose] : []),
      ...[-.4, -.7, -1, -1.25, -1.45].map(pitch => ({ position: [-14.6, .04, 0], yaw: 0, pitch })),
      ...[-.3, -.7, -1.1].map(pitch => ({ position: [-26.5, .04, 49.35], yaw: Math.PI, pitch })),
      ...[-.3, -.7, -1.1].map(pitch => ({ position: [-35.35, .04, 39], yaw: Math.PI / 2, pitch })),
      ...[-.3, -.7, -1.1].map(pitch => ({ position: [0, 1.02, -19.2], yaw: 0, pitch })),
    ];
    let found = null;
    for (const pose of poses) {
      const row = await page.evaluate(pose => window.__aimQA.pose(pose), pose);
      scenario.naturalSearch.push({ pose, ...row }); persist();
      validateReticle(row, viewport);
      if (row.material.opacity < .75) { found = { pose, row }; if (row.material.opacity < .25) break; }
    }
    assert(found, 'Actual aim and camera collision must reproduce a visible local fade; no controlled guide fallback is permitted');
    naturalPose ||= found.pose;
    scenario.naturalFade = await page.evaluate(pose => window.__aimQA.pose(pose, 60), found.pose);
    await shot('actual-down-fade');
    scenario.fadedWeaponSwitch = await page.evaluate(() => {
      const G = window.__G; G.match.range.setWeapon('s3-blaster-lightlong-01');
      window.__aimQA.step(40); return window.__aimQA.snapshot();
    });
    validateReticle(scenario.fadedWeaponSwitch, viewport);
    scenario.restored = await page.evaluate(() => window.__aimQA.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: .3 }, 90));
    assert.equal(scenario.restored.material.opacity, 1, 'Clear view restores full opacity after a weapon change');
    await shot('restored');
    if (viewportIndex === 0 && !viewport.touch) {
      scenario.gtao = await page.evaluate(pose => {
        const G = window.__G, game = window.__inkwave, qa = window.__aimQA;
        G.match.range.setWeapon('blaster'); game.settings.quality = 'high'; game.settings.shadows = false; game.settings.bloom = false; game.R.applySettings(game.settings);
        qa.pose(pose, 60); const ao = G.post.gtao; if (!ao) throw Error('High quality must provide the actual GTAOPass');
        let normalCalls = 0, hiddenCalls = 0;
        const original = ao._renderOverride;
        ao._renderOverride = function (renderer, material) {
          const render = renderer.render;
          if (material === ao.normalMaterial) normalCalls++;
          renderer.render = function () { if (material === ao.normalMaterial && !G.match.local.character.root.visible) hiddenCalls++; return render.apply(this, arguments); };
          try { return original.apply(this, arguments); } finally { renderer.render = render; }
        };
        try {
          game.R.render(); const faded = { normalCalls, hiddenCalls, visible: G.match.local.character.root.visible, snapshot: qa.snapshot() };
          qa.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: .3 }, 90); normalCalls = hiddenCalls = 0;
          game.R.render(); const restored = { normalCalls, hiddenCalls, visible: G.match.local.character.root.visible, snapshot: qa.snapshot() };
          return { faded, restored };
        } finally { ao._renderOverride = original; }
      }, found.pose);
      assert(scenario.gtao.faded.normalCalls > 0 && scenario.gtao.faded.hiddenCalls > 0, 'Actual GTAO normal pass excludes the faded local model');
      assert(scenario.gtao.faded.visible && scenario.gtao.restored.visible, 'GTAO must restore root visibility');
      assert.equal(scenario.gtao.restored.hiddenCalls, 0); assert.equal(scenario.gtao.restored.snapshot.material.opacity, 1);
      await shot('gtao-restored');
      await page.evaluate(pose => window.__aimQA.pose(pose, 60), found.pose); await shot('gtao-fade');
    }
    if (viewport.touch) {
      scenario.gtao = await page.evaluate(pose => {
        const G = window.__G, game = window.__inkwave, qa = window.__aimQA;
        game.settings.quality = 'high'; game.settings.shadows = false; game.settings.bloom = false; game.R.applySettings(game.settings);
        const policy = { touch: !!game.R.mobile.touch, hasPass: !!G.post.gtao, renderedPixelRatio: G.renderer.getPixelRatio() };
        const faded = qa.pose(pose, 60);
        return { status: 'not-applicable', reason: 'Native Renderer disables GTAO on touch devices', policy, faded };
      }, found.pose);
      assert(scenario.gtao.policy.touch, 'Touch context must use the native mobile renderer policy');
      assert.equal(scenario.gtao.policy.hasPass, false, 'Native touch policy intentionally omits GTAO');
      validateReticle(scenario.gtao.faded, viewport);
      assert(scenario.gtao.faded.material.opacity < .75, 'Touch high quality still fades the real overlap');
      await shot('touch-high-fade');
      scenario.gtao.restored = await page.evaluate(() => window.__aimQA.pose({ position: [-14.6, .04, 0], yaw: 0, pitch: .3 }, 90));
      assert.equal(scenario.gtao.restored.material.opacity, 1, 'Touch high quality restores local opacity');
    }
    scenario.final = await page.evaluate(() => window.__aimQA.snapshot());
    validateReticle(scenario.final, viewport); scenario.status = 'passed'; persist();
    await context.close(); activePage = null;
    await browser.close(); browser = null;
  }
  assert.deepEqual(receipt.errors, [], 'No page errors');
  assert.deepEqual(receipt.consoleErrors, [], 'No console errors');
  assert.deepEqual(receipt.badResponses, [], 'No failed resource responses');
  receipt.status = 'passed';
  console.log('INKWAVE aim visibility QA passed', JSON.stringify({ build: receipt.build, viewports: receipt.scenarios.map(x => x.name), out }));
} catch (error) {
  receipt.status = 'failed'; receipt.failure = String(error); process.exitCode = 1;
  console.error(receipt.failure);
  if (activePage) {
    await activePage.screenshot({ path: path.join(out, 'failure.png'), timeout: 15000 }).catch(() => {});
    receipt.diagnostic = await activePage.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 2200), menu: window.__inkwave?.menus?.current, boot: document.getElementById('boot-error')?.textContent })).catch(String);
  }
} finally {
  persist(); await browser?.close(); await new Promise(resolve => server.close(resolve));
}
