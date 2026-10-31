#!/usr/bin/env node
// Matched-camera art evidence for MAP3. Run against baseline and candidate
// production sites with different --evidence-dir values. This is a visual review
// companion to check-inkwave-map3-browser.mjs, not a gameplay or device-FPS test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const value = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `${flag} needs a value`);
  return process.argv[i + 1];
};
const site = path.resolve(value('--site', '_site'));
const out = path.resolve(value('--evidence-dir', 'docs/stage-redesign/map3/liveliness-evidence'));
const label = value('--label', 'candidate');
const onlyView = value('--only-view', null);
const viewsFile = value('--views', null);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(site, 'inkwave-build.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.build?.optimization, 'esbuild-minify', 'Use an actual minified production build');
assert.ok(manifest.build.revision && manifest.contentHash, 'Build identity is required');
fs.mkdirSync(out, { recursive: true });

// These coordinates, titles and the viewport are intentionally shared between
// baseline and candidate. Only the normal-play shot uses the actual player rig.
const VIEWS = viewsFile ? JSON.parse(fs.readFileSync(path.resolve(viewsFile), 'utf8')) : {
  tidewater: [
    { id:'play', title:'Tidewater Plaza — central play view', hud:true, actor:[0, .02, -5], yaw:0, pitch:-.30 },
    { id:'market-stall', title:'Tidewater Plaza — upper market stall', position:[-25, 7.6, -8], look:[-33, 6.4, -14.5] },
    { id:'market-waterfront', title:'Tidewater Plaza — waterfront market', position:[-39, 7.5, -1], look:[-49, 4.3, -11] },
    { id:'bridge-context', title:'Tidewater Plaza — bridge and market context', position:[-47, 19, -30], look:[-18, 3, -6] },
  ],
  kelpline: [
    { id:'play', title:'Kelpline Terminal — central play view', hud:true, actor:[7, 3.62, -7], yaw:0, pitch:-.30 },
    { id:'boarding-kiosk', title:'Kelpline Terminal — boarding kiosk', position:[-3, 7.2, -13], look:[-13, 5.3, -21] },
    { id:'terminal-waterfront', title:'Kelpline Terminal — waterfront waiting area', position:[-39, 6, 22], look:[-49, 4.8, 22] },
    { id:'gantry-context', title:'Kelpline Terminal — gantry and terminal context', position:[-43, 21, -51], look:[-10, 4, -14] },
  ],
};
for (const stage of ['tidewater', 'kelpline']) {
  assert.ok(Array.isArray(VIEWS[stage]) && VIEWS[stage].length, `${stage}: camera views required`);
  for (const view of VIEWS[stage]) {
    assert.match(view.id, /^[a-z0-9-]+$/);
    const vectors = view.actor ? [view.actor] : [view.position, view.look];
    assert.ok(vectors.every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)), 'Finite camera vectors required');
  }
}
if (onlyView) assert.ok(Object.values(VIEWS).every(views => views.some(view => view.id === onlyView)), 'Unknown shared --only-view');
const resultPath = path.join(out, 'liveliness-validation.json');
const previous = onlyView && fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null;
if (previous) {
  assert.equal(previous.buildManifestSha256, sha256(manifestBytes), 'Partial recapture must use the same production build');
  assert.equal(previous.label, label, 'Partial recapture must use the same evidence label');
}
const result = previous || {
  schema:1, status:'running', label, viewport:{ width:1440, height:900, deviceScaleFactor:1 },
  buildRevision:manifest.build.revision, contentHash:manifest.contentHash,
  buildManifestSha256:sha256(manifestBytes),
  scope:'Matched day-time views of the minified production site in Chromium/SwiftShader. Controlled actor setup and manual detail cameras are recorded. No physical-device FPS or gameplay-equivalence claim.',
  errors:[], warnings:[], badResponses:[], stages:[], screenshots:[],
};
result.status = 'running'; delete result.error;
result.capturePasses ??= [];
result.capturePasses.push({ viewFilter:onlyView, waitForInitialLanding:true });
const save = () => fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.woff':'font/woff', '.woff2':'font/woff2',
  '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav',
};
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    const file = path.resolve(site, rel);
    assert.ok(file.startsWith(site + path.sep));
    const bytes = fs.readFileSync(file);
    const headers = { 'content-type':mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store', 'accept-ranges':'bytes' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
      assert.ok(start <= end);
      res.writeHead(206, { ...headers, 'content-range':`bytes ${start}-${end}/${bytes.length}`, 'content-length':end - start + 1 });
      res.end(bytes.subarray(start, end + 1));
    } else {
      res.writeHead(200, { ...headers, 'content-length':bytes.length }); res.end(bytes);
    }
  } catch { res.writeHead(404); res.end('Unavailable'); }
});

let browser, page;
async function step(frames) {
  for (let i = 0; i < frames; i += 60) await page.evaluate(n => {
    const game = __G.game, previous = game._skipRender; game._skipRender = true;
    try { for (let j = 0; j < n; j++) game._frame(1 / 60); }
    finally { game._skipRender = previous; }
  }, Math.min(60, frames - i));
}

async function capture(stage, view) {
  if (view.actor) {
    await page.evaluate(view => {
      const G = __G, game = G.game, actor = game.match.local;
      actor.pos.set(...view.actor); actor.vel.set(0, 0, 0); actor.invuln = 0;
      game.rig.yaw = view.yaw; game.rig.pitch = view.pitch;
      G.paint.clear(); game.debug.fire(true);
    }, view);
    await step(60); await page.evaluate(() => __G.game.debug.fire(false)); await step(30);
    await page.evaluate(() => __G.game._frame(1 / 60));
  }
  await page.evaluate(hud => { document.querySelector('#ui-root').style.visibility = hud ? '' : 'hidden'; }, !!view.hud);
  if (view.hud) await page.waitForFunction(() => {
    const h = __G.game.hud, root = document.querySelector('#ui-root');
    return getComputedStyle(root).visibility === 'visible' &&
      [h.el, h.top].every(el => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > .99);
  }, null, { timeout:10000 });
  const stats = await page.evaluate(view => {
    const G = __G, game = G.game;
    if (view.position) { G.camera.position.set(...view.position); G.camera.lookAt(...view.look); G.camera.updateMatrixWorld(); }
    G.renderer.info.reset(); game.R.render();
    const art = game.decor.stageArt;
    let artGeometryBytes = 0;
    const resources = { materials:new Set(), textures:new Set(), geometries:new Set() };
    art.group.traverse(object => {
      if (object.geometry && !resources.geometries.has(object.geometry)) {
        resources.geometries.add(object.geometry);
        for (const attribute of Object.values(object.geometry.attributes)) artGeometryBytes += attribute.array.byteLength;
        artGeometryBytes += object.geometry.index?.array.byteLength || 0;
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        resources.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
      }
    });
    return {
      state:game.match.state, alive:game.match.local.alive, actor:game.match.local.pos.toArray(),
      camera:G.camera.position.toArray(), cameraQuaternion:G.camera.quaternion.toArray(),
      calls:G.renderer.info.render.calls, triangles:G.renderer.info.render.triangles,
      geometries:G.renderer.info.memory.geometries, textures:G.renderer.info.memory.textures,
      art:art.stats, artGeometryBytes, artMaterials:resources.materials.size,
      artTextures:[...resources.textures].map(texture => ({ name:texture.name, width:texture.image?.width ?? null, height:texture.image?.height ?? null })),
      hudObserved:getComputedStyle(document.querySelector('#ui-root')).visibility === 'visible' &&
        [game.hud.el, game.hud.top].every(el => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > .99),
    };
  }, view);
  assert.equal(stats.state, 'playing'); assert.equal(stats.alive, true);
  assert.equal(stats.hudObserved, !!view.hud, `${stage}/${view.id}: HUD must match the real DOM`);
  if (view.actor) assert.ok(Math.hypot(...stats.actor.map((value, index) => value - view.actor[index])) < 3,
    `${stage}/${view.id}: initial spawn or another movement owner replaced the controlled setup (${stats.actor})`);
  const file = `${stage}-${view.id}.jpg`;
  await page.screenshot({ path:path.join(out, file), type:'jpeg', quality:93 });
  result.screenshots = result.screenshots.filter(shot => shot.stage !== stage || shot.id !== view.id);
  result.screenshots.push({ stage, id:view.id, title:view.title, file,
    sha256:sha256(fs.readFileSync(path.join(out, file))), setup:view,
    manualInspectionCamera:!!view.position, ...stats });
  save(); console.log(`${stage}/${view.id}: ${stats.calls} scene draws; ${stats.art.draws} art draws; ${stats.art.triangles} art triangles`);
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = await import(process.env.INKWAVE_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1 });
  // A fresh context and a fixed random seed reduce unrelated variation between
  // captures. This is test setup only; the production code is never patched.
  await page.addInitScript(() => {
    let state = 1985;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') result.errors.push(message.text());
    if (message.type() === 'warning') result.warnings.push(message.text());
  });
  page.on('response', response => { if (response.status() >= 400) result.badResponses.push({ url:response.url(), status:response.status() }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?map=tidewater&debug=1`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__G?.game?.debug || document.querySelector('#boot-error')?.textContent, null, { timeout:240000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  result.baseURI = await page.evaluate(() => document.baseURI);
  assert.ok(result.baseURI.includes(manifest.build.revision), 'Browser must load the immutable built revision');
  for (const stage of ['tidewater', 'kelpline']) {
    await page.evaluate(async stage => {
      const game = __G.game; game.debug.freeze(); game.menus.wipe?.cancel();
      game.api.setSettings({ minimap:true });
      await game.startMatch({ mapId:stage, mode:'turf', time:'day', difficulty:'easy', duration:180 });
      game.debug.freezeBots();
    }, stage);
    await step(600);
    // GO occurs before the native opening flight lands. A teleport during that
    // flight is overwritten by the spawn owner; wait for real supported landing
    // instead of mutating the spawn state or mislabelling a spawn-side photo.
    let opening = null;
    for (let attempt = 0; attempt < 9; attempt++) {
      opening = await page.evaluate(() => {
        const actor = __G.game.match.local;
        return { phase:actor.s3?.squidSpawn?.phase || null, grounded:actor.grounded, supported:!!actor.ground?.hit };
      });
      if (!opening.phase && opening.grounded && opening.supported) break;
      await step(60);
    }
    assert.ok(!opening.phase && opening.grounded && opening.supported, `${stage}: native opening must land before art capture`);
    const state = await page.evaluate(() => {
      const G = __G, game = G.game, art = game.decor.stageArt;
      const waterEdges = game.fxHooks?.edges || [], waterY = G.level.layout.map3.waterY;
      return { stage:G.level.layout.id, state:game.match.state, mode:game.match.mode,
        art:art?.stats, artRecords:art?.group.userData.map3Art.records.length,
        levelBlocks:G.level.blocks.length, paintCells:G.paint.grid.length, turfArea:G.paint.turfArea,
        builtSpace:!!G.level.layout.map3Playable,
        seaSprayCandidates:waterEdges.length,
        coveredSeaSprayCandidates:waterEdges.filter(e => G.level.groundHeight(e.x, e.z) > waterY ||
          G.level.groundHeight(e.x + e.nx * .55, e.z + e.nz * .55) > waterY).length };
    });
    assert.equal(state.stage, stage); assert.equal(state.state, 'playing'); assert.ok(state.art);
    if (state.builtSpace) {
      assert.ok(state.seaSprayCandidates > 0, 'Open-water ambient spray remains active');
      assert.equal(state.coveredSeaSprayCandidates, 0, 'No sea spray may originate beneath dry streets or ramps');
    }
    result.stages = result.stages.filter(item => item.stage !== stage);
    result.stages.push({ ...state, opening }); save();
    for (const view of VIEWS[stage]) if (!onlyView || view.id === onlyView) await capture(stage, view);
  }
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.badResponses.length, 0, JSON.stringify(result.badResponses));
  assert.equal(result.warnings.some(warning => /lightmap.+stale|failed/i.test(warning)), false, 'AO must remain verified');
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = error.stack;
  try { await page?.screenshot({ path:path.join(out, 'failure.png') }); } catch {}
  throw error;
} finally {
  save(); await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
