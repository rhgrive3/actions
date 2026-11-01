#!/usr/bin/env node
// Full production-site acceptance for the two ordinary MAP3 stages.
// Uses real Game/Actor/Paint/RankedWorld; setup teleports are explicitly logged.
// Chromium software rendering is not a physical-device FPS or balance test.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const value = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const site = path.resolve(value('--site', '_site'));
const out = path.resolve(value('--evidence-dir', 'docs/stage-redesign/map3/runtime-evidence'));
const manifestBytes = fs.readFileSync(path.join(site, 'inkwave-build.json'));
const manifest = JSON.parse(manifestBytes);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert(manifest.build?.revision && manifest.contentHash, 'Use an actual production build');
fs.mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.INKWAVE_PLAYWRIGHT_MODULE || 'playwright');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ogg':'audio/ogg', '.mp3':'audio/mpeg' };
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    const file = path.resolve(site, rel);
    assert(file.startsWith(site + path.sep));
    const bytes = fs.readFileSync(file), range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const headers = { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store', 'accept-ranges':'bytes' };
    if (range) {
      const start = Number(range[1]), end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
      assert(start <= end);
      res.writeHead(206, { ...headers, 'content-range':`bytes ${start}-${end}/${bytes.length}`, 'content-length':end - start + 1 }); res.end(bytes.subarray(start, end + 1));
    } else { res.writeHead(200, { ...headers, 'content-length':bytes.length }); res.end(bytes); }
  } catch { res.writeHead(404); res.end('Unavailable'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width:1440, height:900 }, deviceScaleFactor:1 });
const result = { status:'running', buildRevision:manifest.build.revision, contentHash:manifest.contentHash,
  buildManifestSha256:sha256(manifestBytes), scope:'minified production site in Chromium/SwiftShader; setup teleports are controlled test inputs; no physical-device FPS claim',
  errors:[], warnings:[], badResponses:[], stages:[], ruleModes:[], lifecycle:[], screenshots:[] };
const save = () => fs.writeFileSync(path.join(out, 'browser-validation.json'), JSON.stringify(result, null, 2) + '\n');
page.on('pageerror', error => result.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') result.errors.push(message.text());
  if (message.type() === 'warning') result.warnings.push(message.text());
});
page.on('response', response => { if (response.status() >= 400) result.badResponses.push({ url:response.url(), status:response.status() }); });

async function step(frames) {
  // Short turns let actual UI/lifecycle promises settle; the native sim clock
  // is advanced through Game._frame, without forcing match or respawn states.
  for (let i = 0; i < frames; i += 60) await page.evaluate(n => {
    const game = __G.game, prior = game._skipRender; game._skipRender = true;
    try { for (let j = 0; j < n; j++) game._frame(1 / 60); } finally { game._skipRender = prior; }
  }, Math.min(60, frames - i));
}

async function start(stage, mode, time = 'day') {
  await page.evaluate(async ({ stage, mode, time }) => {
    const game = __G.game; game.debug.freeze(); game.menus.wipe?.cancel();
    game.api.setSettings({ minimap:true });
    for (const { object, listener } of globalThis.map3RetiringArt?.listeners || []) object.removeEventListener('dispose', listener);
    const old = game.decor?.stageArt;
    const retiring = globalThis.map3RetiringArt = old ? { old, geometryDisposals:0, materialDisposals:0, listeners:[] } : null;
    old?.group.traverse(object => {
      for (const [resource, counter] of [[object.geometry, 'geometryDisposals'], [object.material, 'materialDisposals']]) if (resource) {
        const listener = () => retiring[counter]++;
        retiring.listeners.push({ object:resource, listener }); resource.addEventListener('dispose', listener);
      }
    });
    await game.startMatch({ mapId:stage, mode, time, difficulty:'easy', duration:180 });
    game.debug.freezeBots();
  }, { stage, mode, time });
  await step(600);
  await page.evaluate(() => __G.game.debug.fire(true)); await step(90);
  await page.evaluate(() => __G.game.debug.fire(false)); await step(30);
  const state = await page.evaluate(() => {
    const G = __G, game = G.game, retiring = globalThis.map3RetiringArt;
    let artGroups = 0; G.scene.traverse(o => { if (o.name.startsWith('map3-art:')) artGroups++; });
    return { stage:G.level.layout.id, mode:game.match.mode, state:game.match.state, alive:game.match.local.alive,
      actor:game.match.local.pos.toArray(), artGroups, art:game.decor.stageArt?.stats,
      sameArt:retiring?.old === game.decor.stageArt, retiredDetached:!retiring?.old?.group.parent,
      geometryDisposals:retiring?.geometryDisposals, materialDisposals:retiring?.materialDisposals,
      levelBlocks:G.level.blocks.length, paintCells:G.paint.grid.length, turfArea:G.paint.turfArea,
      navNodes:G.nav.nodes?.length, geometries:G.renderer.info.memory.geometries, textures:G.renderer.info.memory.textures };
  });
  assert.equal(state.stage, stage); assert.equal(state.mode, mode); assert.equal(state.state, 'playing'); assert.equal(state.alive, true);
  assert.equal(state.artGroups, 1);
  if (!state.sameArt) { assert.equal(state.retiredDetached, true); assert.ok(state.geometryDisposals > 0); assert.ok(state.materialDisposals > 0); }
  result.lifecycle.push(state); save(); return state;
}

async function screenshot(name, camera = null, hud = false) {
  // visibility preserves the HUD's completed entrance animation. display:none
  // restarted its CSS animation when returning from a clean overview shot.
  await page.evaluate(hud => { document.querySelector('#ui-root').style.visibility = hud ? '' : 'hidden'; }, hud);
  if (hud) await page.waitForFunction(() => {
    const h = __G.game.hud, root = document.querySelector('#ui-root');
    return getComputedStyle(root).visibility === 'visible' &&
      [h.el, h.top].every(el => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > .99);
  }, null, { timeout:10000 });
  const stats = await page.evaluate(({ camera, hud }) => {
    const G = __G, game = G.game;
    if (camera) {
      G.camera.position.set(...camera.position); G.camera.lookAt(...camera.look); G.camera.updateMatrixWorld();
    }
    G.renderer.info.reset(); game.R.render();
    return { calls:G.renderer.info.render.calls, triangles:G.renderer.info.render.triangles, geometries:G.renderer.info.memory.geometries,
      textures:G.renderer.info.memory.textures, camera:G.camera.position.toArray(), state:game.match.state, layer:game.minimap.map3Layer,
      hudObserved:getComputedStyle(document.querySelector('#ui-root')).visibility === 'visible' &&
        [game.hud.el, game.hud.top].every(el => getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > .99) };
  }, { camera, hud });
  assert.equal(stats.hudObserved, hud, name + ' HUD evidence must match actual visible DOM');
  const file = name + '.jpg'; await page.screenshot({ path:path.join(out, file), type:'jpeg', quality:90 });
  result.screenshots.push({ file, sha256:sha256(fs.readFileSync(path.join(out, file))), hud, manualInspectionCamera:!!camera, ...stats }); save();
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?map=tidewater&debug=1`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__G?.game?.debug || document.querySelector('#boot-error')?.textContent, null, { timeout:240000 });
  assert.equal(await page.locator('#boot-error').textContent(), '');
  result.baseURI = await page.evaluate(() => document.baseURI);
  assert.ok(result.baseURI.includes(manifest.build.revision), 'browser must use the immutable built revision');
  console.log('MAP3 production browser booted');
  for (const id of ['tidewater', 'kelpline']) {
    const state = await start(id, 'turf');
    // Native player control and camera in a documented supported location.
    const firing = await page.evaluate(id => {
      const G = __G, game = G.game, actor = game.match.local;
      const setup = id === 'tidewater' ? [0, .02, -5] : [7, 3.62, -7];
      actor.pos.set(...setup); actor.vel.set(0,0,0); actor.invuln = 0;
      game.rig.yaw = 0; game.rig.pitch = -.42;
      G.paint.clear(); game.debug.fire(true);
      return { setupTeleport:setup, before:G.paint.counts.slice() };
    }, id);
    await step(90); await page.evaluate(() => __G.game.debug.fire(false)); await step(30);
    firing.after = await page.evaluate(() => __G.paint.counts.slice());
    assert.ok(firing.after[0] > firing.before[0], id + ' actual shooting must paint the real floor');
    await page.evaluate(() => __G.game._frame(1/60));
    await screenshot(id + '-play', null, true);
    const overview = id === 'tidewater' ? { position:[83,85,-103], look:[0,1,0] } : { position:[88,88,-103], look:[0,2,0] };
    await screenshot(id + '-overview', overview);
    const feature = id === 'tidewater' ? { position:[-47,19,-30], look:[-18,3,-6] } : { position:[-43,21,-51], look:[-10,4,-14] };
    await screenshot(id + '-bridge', feature);
    const lower = id === 'tidewater' ? [-26,.02,-14] : [7,.02,-8];
    await page.evaluate(p => { const G=__G;G.game.match.local.pos.set(...p);G.game.match.local.vel.set(0,0,0);G.game.rig.yaw=0;G.game.rig.pitch=-.1; }, lower);
    await step(45); await page.evaluate(() => __G.game._frame(1/60));
    const layer = await page.evaluate(() => __G.game.minimap.map3Layer);
    assert.equal(layer, 'lower', id + ' actual actor under bridge chooses lower minimap');
    await screenshot(id + '-underpass', null, true);
    result.stages.push({ ...state, firing, underpassSetupTeleport:lower, minimapLayer:layer }); save();
    for (const mode of ['zones','tower','rainmaker','clams']) {
      await start(id, mode);
      const proof = await page.evaluate(() => {
        const game=__G.game, m=game.match, world=m.rankedWorld, stage=m.ranked.stage;
        return { stage:__G.level.layout.id, mode:m.mode, state:m.state, ranked:!!m.ranked,
          zones:stage.zones.map(z=>({center:z.center,size:z.size,heightTolerance:z.heightTolerance})),
          towerCollider:world.towerBlock?.tag || null, towerPosition:world.towerBlock?.center.toArray() || null,
          rainmakerGoals:stage.rainmaker.goals, clamGoals:stage.clams.goals,
          objectiveChildren:{zones:world.zoneGroup.children.length,tower:world.towerGroup.children.length,rainmaker:world.rainmakerGroup.children.length,clams:world.clamsGroup.children.length} };
      });
      assert.equal(proof.ranked, true);
      assert.equal(!!proof.towerCollider, mode === 'tower');
      result.ruleModes.push(proof); save(); console.log(id, mode, 'playing');
    }
  }
  // Two extra A/B swaps exercise actual disposal of art after ranked teardown.
  await start('tidewater','turf','dusk');
  await screenshot('tidewater-dusk', { position:[-47,19,-30], look:[-18,3,-6] });
  await start('kelpline','turf','dusk');
  await screenshot('kelpline-dusk', { position:[-43,21,-51], look:[-10,4,-14] });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.badResponses.length, 0, JSON.stringify(result.badResponses));
  assert.equal(result.warnings.some(w=>/lightmap.+stale|failed/i.test(w)), false, 'final art must use its verified AO bake');
  result.status='passed';
} catch (error) {
  result.status='failed'; result.error=error.stack;
  try { await page.screenshot({ path:path.join(out,'failure.png') }); } catch {}
  throw error;
} finally {
  save(); await browser.close(); await new Promise(resolve=>server.close(resolve));
}
