#!/usr/bin/env node
// Practice Range browser check (built site). Boots the real build in Chromium and WebKit at desktop, phone and tablet
// sizes and drives the range through its own UI and debug hooks:
//   stage + every asset loads (no 404, lightmap applied) · targets / pads / signage present · the HUD roster is replaced
//   by the range read-outs, and none of them covers a touch control · a target hit lands in the read-outs with the
//   real distance · the paint-test read-out counts real ink and RESET PAINT clears it · a weapon pad switches weapon
//   · the range pause screen opens and its travel button moves you to the zone's stand.
// Isolation (Chromium desktop): leaving the range and starting a Turf War leaves no range session, target, signage or
// HUD class behind, the match has its 8 kids and its intro, and no stage list contains the range.
//
//   node scripts/check-inkwave-range.mjs --site <built site> --evidence-dir <dir> --profile-dir <dir> [--quick]
//   (RANGE_BROWSERS=chromium limits the browsers for a local run; CI runs all of them)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const option = (name) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error('Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = option('--site'), evidence = option('--evidence-dir'), profile = option('--profile-dir');
const quick = process.argv.includes('--quick');
const signageOnly = process.argv.includes('--signage-only');
const physical = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p)));
for (const d of [evidence, profile]) {
  const r = physical(d);
  if (['/tmp', '/var/tmp', '/dev/shm'].some((root) => r === root || r.startsWith(root + '/'))) throw new Error('Use workspace-owned persistent storage: ' + r);
  fs.mkdirSync(d, { recursive: true });
}
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw new Error('Build identity mismatch');
if (!Object.keys(manifest.files).some((k) => k.startsWith('practice-range/'))) throw new Error('Build does not include the practice range layer');

const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  try {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.resolve(site, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(site + path.sep) || !fs.statSync(f).isFile()) throw 0;
    r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  } catch { r.writeHead(404); r.end('Not found'); }
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${server.address().port}/`;

const RUNS = [
  { name: 'chromium-desktop', browser: 'chromium', viewport: { width: 1280, height: 720 }, touch: false, isolation: true },
  { name: 'chromium-phone', browser: 'chromium', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'webkit-tablet', browser: 'webkit', viewport: { width: 1024, height: 768 }, touch: true },
].filter((r, i) => (!quick || i === 0) && (!process.env.RANGE_BROWSERS || process.env.RANGE_BROWSERS.split(',').includes(r.browser)));

const ARGS = { chromium: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], webkit: [] };
const results = [];
let failed = false;
for (const run of RUNS) {
  const out = { name: run.name, checks: {}, errors: [], missing: [] };
  results.push(out);
  let ctx;
  try {
    const type = pw[run.browser];
    const exe = run.browser === 'chromium' && process.env.RANGE_CHROMIUM ? { executablePath: process.env.RANGE_CHROMIUM } : {};
    ctx = await type.launchPersistentContext(path.join(profile, run.name), { headless: true, viewport: run.viewport, hasTouch: run.touch, isMobile: run.touch && run.browser === 'chromium', args: ARGS[run.browser], ...exe });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(String(e.message).slice(0, 400)));
    page.on('response', (r) => { if (r.status() >= 400) out.missing.push(r.status() + ' ' + r.url()); });
    await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', lang: 'en' })));
    await page.goto(base + '?range&skipTitle', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (window.__G?.match?.range && window.__G.match.state === 'playing') || document.getElementById('boot-error')?.textContent, null, { timeout: 420000 });
    const bootError = await page.evaluate(() => document.getElementById('boot-error')?.textContent || '');
    if (bootError) throw new Error('boot error: ' + bootError);
    await page.waitForTimeout(1500);
    out.checks.stage = await page.evaluate(() => {
      const G = window.__G, g = window.__inkwave, s = G.match.range;
      const hidden = (sel) => { const e = document.querySelector(sel); return !e || getComputedStyle(e).display === 'none'; };
      return {
        layout: G.level.layout.id, lightmap: !!g.stageLightmap, signage: !!g.rangeSignage?.mesh?.geometry?.attributes?.position?.count,
        targets: s.targets.length, pads: s.pads.defs.length, bots: G.actors.filter((a) => a.bot).length,
        rosterHidden: hidden('.iw-hud__top'), telemetry: !!document.querySelector('.iwr-tel'),
        drawCalls: g.perf?.calls, triangles: g.perf?.tris,
      };
    });
    const st = out.checks.stage;
    if (st.layout !== 'range' || !st.lightmap || !st.signage || st.targets !== 11 || st.pads !== 14 || st.bots !== 0 || !st.rosterHidden || !st.telemetry) throw new Error('stage check ' + JSON.stringify(st));
    // #589: inspect the real constrained atlas and a separate desktop-HIGH instance.
    const signageEvidence=await page.evaluate(async desktop=>{
      const G=window.__G,g=window.__inkwave;
      await document.fonts.ready;
      const capture=(sign,size)=>{
        const cells=[...sign.cells.values()];
        if(sign.canvas.width!==size||sign.canvas.height!==size||sign.tex.image!==sign.canvas||sign.mat.map!==sign.mat.emissiveMap)throw Error('Range signage backing budget regression');
        if(cells.some(c=>c.x<0||c.y<0||c.x+c.pw>2048||c.y+c.ph>2048))throw Error('Range signage packing overflow');
        return {width:size,height:size,cells:cells.length,positionCount:sign.mesh.geometry.attributes.position.count,png:sign.canvas.toDataURL('image/png')};
      };
      const active=capture(g.rangeSignage,1024),result={active};
      if(desktop){
        const {RangeSignage}=await import(new URL('patches/practice-range/runtime/signage.mjs',document.baseURI).href);
        const scene=new G.scene.constructor(),high=new RangeSignage(scene,{quality:'high'},{touch:false});
        try {result.high=capture(high,2048);let disposed=0;for(const x of [high.tex,high.mat,high.mesh.geometry])x.addEventListener('dispose',()=>disposed++);high.dispose();if(disposed!==3||scene.children.length)throw Error('Range signage HIGH disposal regression');result.high.disposed=disposed;}
        finally {if(!high.disposed)high.dispose();}
      }
      return result;
    },!run.touch);
    for(const [kind,row]of Object.entries(signageEvidence)){
      fs.writeFileSync(path.join(evidence,`${run.name}-signage-${kind}.png`),Buffer.from(row.png.split(',')[1],'base64'));delete row.png;
    }
    out.checks.signageBudget=signageEvidence;
    if (run.touch) {
      out.checks.touchOverlap = await page.evaluate(() => {
        const R = (e) => e.getBoundingClientRect(), hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const ctl = [...document.querySelectorAll('#iw-mobile-controls button, #iw-mobile-controls [class*="stick"]')].filter((e) => R(e).width > 0);
        const mine = [...document.querySelectorAll('.iwr-tel, .iwr-card.is-on, .iwr-prompt.is-on')].filter((e) => R(e).width > 0);
        return { controls: ctl.length, overlaps: mine.flatMap((m) => ctl.filter((c) => hit(R(m), R(c))).map((c) => (m.className + ' × ' + c.className).slice(0, 120))) };
      });
      if (out.checks.touchOverlap.overlaps.length) throw new Error('range HUD covers touch controls ' + JSON.stringify(out.checks.touchOverlap));
    }
    await page.screenshot({ path: path.join(evidence, run.name + '-spawn.png'), timeout: 240000 });
    // Atlas pixels alone cannot prove in-world readability: preserve natural
    // gallery/wall camera views at each real viewport for visual acceptance.
    out.checks.signageViews=[];
    for(const zone of ['gallery','wall']){
      await page.evaluate(zone=>window.__G.match.range.travel(zone),zone);
      await page.waitForTimeout(2500);
      const view=await page.evaluate(zone=>{
        const G=window.__G,g=window.__inkwave,c=g.rig.camera;
        const tiles=[...g.rangeSignage.cells.values()].filter(x=>x.art.kind==='gauge'||x.art.kind==='dist');
        return {zone,canvasWidth:g.rangeSignage.canvas.width,viewport:{width:innerWidth,height:innerHeight},camera:{position:c.position.toArray(),quaternion:c.quaternion.toArray(),fov:c.fov},actor:G.local.pos.toArray(),labels:tiles.map(x=>({art:x.art,logicalWidth:x.pw,logicalHeight:x.ph})),visualReviewRequired:true};
      },zone);
      await page.screenshot({path:path.join(evidence,`${run.name}-signage-world-${zone}.png`),timeout:240000});
      out.checks.signageViews.push(view);
    }
    if (!signageOnly) {
    // a hit on the 10 m gallery target from its stand mark
    out.checks.hit = await page.evaluate(async () => {
      const G = window.__G, g = window.__inkwave, s = G.match.range, a = G.local;
      // Admit through native travel, then use the 10 m column's firing mark.
      // The gallery travel point is x=-6.8 (the 20 m column); aiming diagonally
      // from there makes this shot sqrt(10^2 + 5.2^2) = 11.2712 m.
      s.travel('gallery');
      const target = s.targets.find((x) => x.rangeTarget?.dist === 10);
      if (!target) throw new Error('Missing actual 10 m gallery target');
      // Native spawn/reset also resets fixed-clock interpolation before firing.
      a.spawnAt(a.pos.clone().set(target.pos.x, 0.05, target.pos.z - target.rangeTarget.dist), 0);
      a.intent.move.set(0, 0, 0);
      a.character.root.position.copy(a.pos);
      a.netTp = (a.netTp || 0) + 1;
      g.rig.follow(a, true);
      await new Promise((r) => setTimeout(r, 2500));
      const standDistance = Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      if (Math.abs(standDistance - 10) > 0.05) throw new Error('10 m firing mark displaced: ' + JSON.stringify({ actor:a.pos.toArray(), target:target.pos.toArray(), standDistance }));
      // Aim through the controller, preserving real spread and ballistics.
      const yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      g.rig.yaw = yaw; g.rig.pitch = -0.02;
      a.yaw = a.aimYaw = yaw;
      // PlayerController reads its *rig* each frame (player.js), not a
      // `controller.yaw` field. Aim through that real input owner.
      if (s.m.controller?.rig) { s.m.controller.rig.yaw = yaw; s.m.controller.rig.pitch = -0.02; }
      const births = [];
      const push = G.projectiles?._push;
      if (push) G.projectiles._push = function (p) {
        if (births.length < 12) births.push({
          type: p.type, ghost: !!p.ghost, ownerLocal: !!p.owner?.isLocal,
          pos: p.pos?.toArray?.(), vel: p.vel?.toArray?.(), life: p.life, straight: p.straight,
          damage: p.damage, team: p.team,
        });
        return push.call(this, p);
      };
      const hpBefore = target?.hp;
      s.last = null;
      let hit = null;
      try {
        g.debug.fire(true); const t0 = performance.now();
        while (performance.now() - t0 < 30000) {
          if (s.last?.target === target && s.last.amount > 0) { hit = s.last; break; }
          await new Promise((r) => setTimeout(r, 250));
        }
        g.debug.fire(false);
      } finally {
        if (push) G.projectiles._push = push;
        g.debug.fire(false);
      }
      if (hit) return { target: hit.target.name, amount: hit.amount, dist: hit.dist, card: document.querySelector('.iwr-card')?.classList.contains('is-on') };
      return {
        miss: true,
        actor: {
          pos: a.pos.toArray(), vel: a.vel.toArray(), yaw: a.yaw, aimYaw: a.aimYaw, aimPitch: a.aimPitch,
          weaponId: a.weaponId, alive: a.alive, ink: a.ink, remote: !!a.remote, isLocal: !!a.isLocal,
          intent: { fire: !!a.intent?.fire, move: a.intent?.move?.toArray?.() },
        },
        target: target && {
          pos: target.pos.toArray(), hpBefore, hpAfter: target.hp, alive: target.alive, team: target.team,
          remote: !!target.remote, isLocal: !!target.isLocal, isBot: !!target.isBot,
        },
        net: { manager: !!G.netm, netState: G.net?.state ?? null },
        births,
        liveProjectiles: (G.projectiles?.list || []).slice(0, 12).map((p) => ({
          type: p.type, ghost: !!p.ghost, pos: p.pos?.toArray?.(), vel: p.vel?.toArray?.(), age: p.age, life: p.life,
        })),
      };
    });
    if (!out.checks.hit || !(out.checks.hit.amount > 0) || Math.abs(out.checks.hit.dist - 10) > 0.6) throw new Error('target hit ' + JSON.stringify(out.checks.hit));
    await page.screenshot({ path: path.join(evidence, run.name + '-hit.png'), timeout: 240000 });
    // paint read-out + reset paint pad + a weapon pad
    out.checks.paint = await page.evaluate(async () => {
      const G = window.__G, g = window.__inkwave, s = G.match.range, a = G.local, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      s.travel('paint'); g.rig.pitch = -0.4; await wait(1500);
      g.debug.fire(true); const t0 = performance.now();
      while (!(s.paintStats()?.own > 0) && performance.now() - t0 < 30000) await wait(250);
      g.debug.fire(false);
      const painted = s.paintStats(), shown = document.querySelector('.iwr-tel__paint')?.textContent || '';
      const pad = (k) => s.pads.defs.find(k);
      const until = async (fn, ms = 30000) => { const t = performance.now(); while (!fn() && performance.now() - t < ms) await wait(150); return fn(); };
      const stand = async (p) => { a.pos.set(0, 0.05, -5); await until(() => s.padOn === null); a.pos.set(p.x, 0.05, p.z); a.vel.set(0, 0, 0); return until(() => s.padOn === p && s.padFired); };
      const reset = await stand(pad((p) => p.kind === 'resetPaint'));
      const after = s.paintStats().own;
      const weaponBefore = a.weaponId;
      const target = s.pads.defs.find((p) => p.kind === 'weapon' && p.weapon !== weaponBefore);
      const switched = await stand(target);
      return { area: painted.area, own: painted.own, shown, reset, after, weaponBefore, weaponAfter: a.weaponId, switched };
    });
    const p = out.checks.paint;
    if (Math.abs(p.area - 400) > 1e-6 || !(p.own > 0) || !p.reset || p.after !== 0 || !p.switched || p.weaponAfter === p.weaponBefore) throw new Error('paint/pads ' + JSON.stringify(p));
    // the range pause screen + travel
    await page.evaluate(() => window.__inkwave.pause());
    await page.waitForSelector('.iwr-pausescr [data-id="z-bomb"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(evidence, run.name + '-pause.png'), timeout: 240000 });
    await page.locator('.iwr-pausescr [data-id="z-bomb"]').click();
    await page.waitForTimeout(1500);
    out.checks.travel = await page.evaluate(() => ({ screen: window.__G.menus.current, paused: window.__G.match.paused, pos: window.__G.local.pos.toArray(), zone: window.__G.match.range.telemetry().zone }));
    if (out.checks.travel.screen || out.checks.travel.paused || out.checks.travel.zone !== 'bomb') throw new Error('travel ' + JSON.stringify(out.checks.travel));
    if (run.isolation) {
      out.checks.isolation = await page.evaluate(async () => {
        const G = window.__G, g = window.__inkwave;
        await g.api.startMatch({ mapId: 'tidewater', difficulty: 'easy', duration: 180, mode: 'turf' });
        const t0 = performance.now();
        while (G.match?.state === 'init' && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200));
        return {
          layout: G.level.layout.id, range: !!G.match.range, rangeOpt: !!G.match.opts.range, state: G.match.state, actors: G.actors.length,
          targets: G.actors.filter((a) => a.rangeTarget).length, signage: !!g.rangeSignage, hudClass: G.hud.el.classList.contains('iw-hud--range'),
          rangeDom: !!document.querySelector('.iwr-hud'), maps: g.api.maps.map((m) => m.id), scenePads: !!G.scene.getObjectByName('range:pads'),
        };
      });
      const iso = out.checks.isolation;
      if (iso.layout !== 'tidewater' || iso.range || iso.rangeOpt || iso.actors !== 8 || iso.targets || iso.signage || iso.hudClass || iso.rangeDom || iso.maps.includes('range') || iso.scenePads || !['intro', 'playing'].includes(iso.state)) throw new Error('isolation ' + JSON.stringify(iso));
    }
    }
    if (out.errors.length) throw new Error('page errors: ' + out.errors.join(' | '));
    if (out.missing.length) throw new Error('missing assets: ' + out.missing.join(' | '));
    out.status = 'passed';
  } catch (e) {
    out.status = 'failed'; out.failure = String(e.message || e).slice(0, 2000); failed = true;
  } finally { await ctx?.close().catch(() => {}); }
  console.log(run.name, out.status, out.failure || '');
}
server.close();
const result = { scope: signageOnly ? 'signage-only' : 'full-range', fullAcceptance: !signageOnly, status: failed ? 'failed' : 'passed', contentHash: manifest.contentHash, runs: results };
fs.writeFileSync(path.join(evidence, 'range-result.json'), JSON.stringify(result, null, 2) + '\n');
if (failed) process.exitCode = 1;
