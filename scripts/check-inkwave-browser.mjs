#!/usr/bin/env node
import { runQualityBrowserProbe } from '../patches/local-quality/quality-probe.mjs';
import { runPaintMipmapBrowserProbe } from '../patches/local-quality/paint-mipmap-probe.mjs';
import { checkHudAuthority, checkUiVisualProbes } from './check-inkwave-hud-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const option = name => { const i=process.argv.indexOf(name); if(i<0 || !process.argv[i+1]) throw new Error('Required '+name); return path.resolve(process.argv[i+1]); };
const site=option('--site'), evidence=option('--evidence-dir'), profile=option('--profile-dir');
const uiProbesOnly = process.argv.includes('--ui-probes-only');
const ROOT = fileURLToPath(new URL('../',import.meta.url));
const physicalLocation = name => fs.existsSync(name) ? fs.realpathSync(name) : path.join(physicalLocation(path.dirname(name)),path.basename(name));
for(const directory of [evidence,profile]) {
  const resolved=physicalLocation(directory);
  if(['/tmp','/var/tmp','/dev/shm'].some(root=>resolved===root||resolved.startsWith(root+'/'))) throw new Error('Use workspace-owned persistent storage: '+resolved);
  fs.mkdirSync(directory,{recursive:true});
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash) throw new Error('Build identity mismatch');
for(const [file,expected] of Object.entries(manifest.artifacts)) if(hash(fs.readFileSync(path.join(site,file)))!==expected) throw new Error('Artifact mismatch: '+file);
const sourceSha=process.argv.includes('--exact-source') ? execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim() : null;
// Bind every build input to the actual checkout commit when --exact-source is used.
if(process.argv.includes('--exact-source')) {
  const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{ const [meta,file]=row.split('\t'); return [file,meta.split(' ')[2]]; }));
  const files=Object.keys(manifest.files).map(key=>{
    if(key.startsWith('upstream/')) return 'inkwave-public/'+key.slice(9);
    if(key.startsWith('patch/')) return 'patches/splatoon3/'+key.slice(6);
    if(key.startsWith('touch-layout/')) return 'patches/touch-layout/'+key.slice(13);
    if(key.startsWith('reliability/')) return 'patches/reliability/'+key.slice(12);
    if(key.startsWith('local-quality/')) return 'patches/local-quality/'+key.slice(14);
    if(key.startsWith('network-replication/')) return 'patches/network-replication/'+key.slice(20);
    if(key.startsWith('loading-cache/')) return 'patches/loading-cache/'+key.slice(14);
    if(key.startsWith('practice-range/')) return 'patches/practice-range/'+key.slice(15);
    throw new Error('Unknown build input namespace: '+key);
  });
  Object.entries(manifest.files).forEach(([key,expected],i)=>{if(hash(fs.readFileSync(path.join(ROOT,files[i])))!==expected)throw new Error('Build input differs from manifest: '+key);});
  if(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs')))!==manifest.build.script)throw new Error('Build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs');
  const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  files.forEach((file,i)=>{if(blobs[i]!==tree.get(file))throw new Error('Build input differs from commit: '+file);});
}
// Identity-negative fixtures intentionally stop before loading browser helpers.
const { probeTurfLead } = await import('./lib/inkwave-turf-lead-probe.mjs');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer((request,response)=>{
  try { const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname); const file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile()) throw new Error('Missing');
    response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(response);
  }catch{response.writeHead(404);response.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address='http://127.0.0.1:'+server.address().port+'/';
let browser;
try {
 browser=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1280,height:800},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage(), errors = [], failures = [], consoleErrors = [], receipts = [];
// Fulfill with the exact bytes returned by the local server after verification.
// API responses retain preload bodies that Chrome's DevTools may discard.
await page.route(address+'**', async route => {
  try {
    const response=await route.fetch(), body=await response.body();
    const key=decodeURIComponent(new URL(response.url()).pathname).replace(/^\//,'') || 'index.html';
    if(manifest.artifacts[key] && hash(body)!==manifest.artifacts[key]) throw new Error('Loaded artifact mismatch: '+key);
    receipts.push(key.replace(/^_versions\/[a-f0-9]+\//,'')); await route.fulfill({response,body});
  }catch(error){ errors.push(error.message); await route.abort(); }
});
await page.bringToFront();
await page.addInitScript(() => { localStorage.setItem('inkwave.settings', JSON.stringify({quality:'low', shadows:false, bloom:false, minimap:false})); });
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 1500)); });
let result;
try {
  await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => { globalThis.s3ProbeG = (await import(new URL('src/core/ctx.js',document.baseURI).href)).G; });
  await page.waitForFunction(() => (!!globalThis.s3ProbeG?.game?.menus && globalThis.s3ProbeG.s3?.installed && globalThis.s3ProbeG.mode !== 'boot') || !!document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  if (await page.locator('#boot-error').textContent()) throw new Error('Game boot error');
  result = await page.evaluate(async () => {
    const { G } = await import(new URL('src/core/ctx.js',document.baseURI).href);
    const build = await fetch(new URL('inkwave-build.json',location.href)).then(r => r.json());
    if (!document.baseURI.includes(build.build.revision)) throw new Error('Active asset revision mismatch');
    return { baseURI:document.baseURI, mode: G.mode, patch: G.s3, contentHash: build.contentHash, clockTicks: G.game.s3Clock?.ticks, sourceEntry: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')) };
  });
  if (uiProbesOnly) {
    // Same native offline bootstrap, intro dismissal and frozen match as full acceptance.
    await page.evaluate(async () => { const G=globalThis.s3ProbeG; G.game.debug.freeze(); G.game.menus.wipe.cancel(); await G.game.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'}); });
    await page.waitForFunction(() => globalThis.s3ProbeG.game.hud?._visible && !document.querySelector('.iw-lineup'), null, {timeout:15000});
    await page.evaluate(() => { const g=globalThis.s3ProbeG.game; g.debug.freezeBots(); g._skipRender=true; try {for(let i=0;i<270;i++)g._frame(1/60);} finally {g._skipRender=false;} });
    result.hudAuthority = await checkUiVisualProbes({page,evidence,sourceSha,contentHash:manifest.contentHash});
  } else {
  // Exercise the native menu interval that previously pinned an unused LobbySet.
  await page.waitForFunction(() => !!globalThis.s3ProbeG?.game?.timer, null, { timeout:30000 });
  await page.waitForTimeout(2800);
  result.idleLobby = await page.evaluate(() => ({ mode:globalThis.s3ProbeG.mode, allocated:!!globalThis.s3ProbeG.game.showcase.lob }));
  if (result.idleLobby.mode !== 'menu' || result.idleLobby.allocated) throw new Error('Idle menu allocated unused Online LobbySet');
  await page.evaluate(async () => { const { G } = await import(new URL('src/core/ctx.js',document.baseURI).href); G.game.debug.freeze(); G.game.menus.wipe.cancel(); G.game.menus.show('loadout', {wipe:false,light:false}); for(let i=0;i<90;i++)G.game.menus.update(1/60); });
  await page.waitForSelector('.s3-gear');
  result.gearSelects = await page.locator('.s3-gear select').count();
  if (result.gearSelects !== 12) throw new Error('Gear slots did not render');
  await page.locator('.s3-gear summary').click();
  await page.locator('.s3-gear select').first().focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
  await page.locator('.s3-gear select').first().selectOption('runSpeed');
  result.savedGear = await page.evaluate(() => JSON.parse(localStorage.getItem('inkwave.splatoon3.gear.v1')));
  await page.screenshot({ path: path.join(evidence, 'loadout-desktop.png'), animations:'disabled', timeout:90000 });
  await page.setViewportSize({width:375,height:812});
  result.smallViewport = await page.locator('.s3-gear').evaluate(el => {const r=el.getBoundingClientRect(); return {x:r.x,right:r.right,width:r.width,viewport:innerWidth};});
  if(result.smallViewport.x<0 || result.smallViewport.right>375) throw new Error('Gear panel overflows small viewport');
  await page.screenshot({path:path.join(evidence,'loadout-small-viewport.png'),animations:'disabled',timeout:90000});
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(async () => { const { G } = await import(new URL('src/core/ctx.js',document.baseURI).href); await G.game.startMatch({mapId:'tidewater', difficulty:'easy', duration:180, mode:'turf'}); });
  // The frozen fixture advances simulation explicitly below. Let the native
  // wall-clock intro reveal run while this same Match is still in intro;
  // fast-forwarding first makes its legitimate intro-only timer a no-op.
  await page.waitForFunction(() => {
    const g = globalThis.s3ProbeG?.game, h = g?.hud;
    if (!g?.frozen || g.match?.state !== 'intro' || !h?._visible) return false;
    const style = getComputedStyle(h.el);
    return style.visibility === 'visible' && Number(style.opacity) >= .99;
  }, null, {timeout:15000});
  result.introHudAdmission = await page.evaluate(() => ({state:s3ProbeG.game.match.state,frozen:s3ProbeG.game.frozen,visible:s3ProbeG.game.hud._visible,nativeIntroReveal:true}));
  result.hiddenMinimap = await page.evaluate(() => {
    const m=globalThis.s3ProbeG.game.minimap;
    return { built:m._built, logical:[m.w,m.h], canvas:[m.canvas.width,m.canvas.height],
      imageBytes:(m.inkImg?.data.byteLength||0)+(m.flashImg?.data.byteLength||0),
      rasterBytes:['hgt','topBlock','nrm','pixCell','pixFx','pixFy','pixSx','pixSy','owner'].reduce((n,key)=>n+(m[key]?.byteLength||0),0) };
  });
  if (result.hiddenMinimap.built || result.hiddenMinimap.imageBytes || result.hiddenMinimap.rasterBytes || result.hiddenMinimap.canvas.some(n=>n>1)) throw new Error('Minimap OFF allocated render buffers at native match start');
  await page.evaluate(() => { const G=globalThis.s3ProbeG; G.game.api.setSettings({minimap:true}); G.game.minimap.update(1/60,true); });
  result.visibleMinimap = await page.evaluate(() => {
    const m=globalThis.s3ProbeG.game.minimap;
    return { built:m._built, canvas:[m.canvas.width,m.canvas.height], logical:[m.w,m.h], imageBytes:m.inkImg.data.byteLength+m.flashImg.data.byteLength };
  });
  if (!result.visibleMinimap.built || result.visibleMinimap.canvas.some((n,i)=>n!==result.visibleMinimap.logical[i]) || result.visibleMinimap.imageBytes!==8*result.visibleMinimap.logical[0]*result.visibleMinimap.logical[1]) throw new Error('Reenabled Minimap did not initialize native layers');
  // The clock is frozen: let the real intro UI timers reveal HUD/remove lineup
  // before fast-forwarding simulation, otherwise screenshots only show intro.
  await page.waitForFunction(() => globalThis.s3ProbeG.game.hud?._visible && !document.querySelector('.iw-lineup'), null, {timeout:15000});
  // Let native intro UI reveal HUD before authority screenshots/probes.
  await page.waitForFunction(() => globalThis.s3ProbeG.game.hud?._visible && !document.querySelector('.iw-lineup'), null, {timeout:15000});
  result.gameplay = await page.evaluate(() => {
    const G = globalThis.s3ProbeG, g = G.game; g.debug.freezeBots(); g._skipRender = true;
    for (let i=0;i<270;i++) g._frame(1/60);
    const initial = g.match.time;
    for (let i=0;i<60;i++) g._frame(1/20);
    const actor = g.match.local; const before = actor.pos.clone();
    // Movement is the contract, not one spawn-facing direction. Correct spawn
    // orientation/barriers can legitimately block W on a given map, so probe
    // all four keyboard directions and retain the maximum real displacement.
    let movement = 0;
    for (const key of ['KeyW','KeyD','KeyS','KeyA']) {
      const start = actor.pos.clone();
      g.debug.key(key,true); for(let i=0;i<30;i++)g._frame(1/60); g.debug.key(key,false);
      movement = Math.max(movement, actor.pos.distanceTo(start), actor.pos.distanceTo(before));
      if (movement > 1e-6) break;
    }
    let paintedFloorArea=0;
    for(const face of G.paint.paintFaces) {
      if(!face.turf)continue;
      const cell=G.paint.dead.slice(face.grid,face.grid+face.nu*face.nv).findIndex(value=>!value);
      if(cell<0)continue;
      const point=face.origin.clone().addScaledVector(face.u,(cell%face.nu+.5)*face.cu).addScaledVector(face.v,(Math.floor(cell/face.nu)+.5)*face.cv).addScaledVector(face.n,.02);
      paintedFloorArea=G.paint.splat(point,.7,0,{seed:1}); if(paintedFloorArea>0)break;
    }
    g._skipRender = false;
    return {state:g.match.state, elapsedAt20Hz:initial-g.match.time-.5, movement, hp:actor.hp, gear:actor.s3.loadout, velocityFinite:[actor.vel.x,actor.vel.y,actor.vel.z].every(Number.isFinite), clockTicks:g.s3Clock.ticks, paintedFloorArea, coverage:G.paint.coverage()};
  });
  if (Math.abs(result.gameplay.elapsedAt20Hz-3)>1e-8 || !result.gameplay.velocityFinite || result.gameplay.movement<=0 || result.gameplay.paintedFloorArea<=0 || result.gameplay.coverage[0]<=0 || result.gameplay.coverage[0]>1) throw new Error('Actual browser gameplay regression');
  result.turfLead = await probeTurfLead(page, evidence);
  // Native keyboard events traverse the loaded match's complete input/action
  // pipeline. Only ground collision is pinned for this admission-only proof;
  // the gameplay check above still uses the actual world Physics.
  await page.bringToFront();
  await page.evaluate(() => {
    const G = globalThis.s3ProbeG, g = G.game, a = g.match.local;
    const canvas = g.R?.renderer?.domElement || document.querySelector('canvas');
    if (!canvas) throw Error('Game canvas unavailable for physical keyboard proof');
    const oldTabIndex = canvas.getAttribute('tabindex');
    canvas.tabIndex = -1; canvas.focus({ preventScroll: true });
    if (document.activeElement !== canvas) throw Error('Game canvas did not own keyboard focus');
    const wasFrozen = g.frozen;
    g.debug.freeze();
    g.debug.fire(false);
    a.setWeapon('dualies'); a.ink = 100; a.form = 'kid'; a.grounded = true;
    a.climbing = false; a.superJumpState = a.specialActive = null;
    a.jumpBuffer = a.fireBuffer = 0; a.intent.jump = false; a._prevIntent.jump = false;
    g.input.keys.clear(); g.input.pressed.clear(); g.input.locked = true;
    // The preceding live match can leave fractional elapsed time queued. This
    // boundary trial starts at a known tick phase before testing two half frames.
    g.s3Clock.reset();
    const integrate = a._integrate, trigger = a.character.trigger;
    const proof = window.actionProof = { dodges: 0, jumps: 0, wasFrozen, canvas, oldTabIndex };
    a._integrate = () => { a.grounded = true; };
    a.character.trigger = function (name, ...args) {
      if (name === 'dodge') proof.dodges++; if (name === 'jump') proof.jumps++;
      return trigger.call(this, name, ...args);
    };
    proof.restore = () => { a._integrate = integrate; a.character.trigger = trigger; };
    // Freeze only the live rAF-driven simulation during this admission proof.
    // Physical browser keyboard events still reach Input, but cannot be consumed
    // by an unrelated live frame before the explicit fixed-tick calls below.
  });
  try {
    // Space is the physical browser edge under test. Fire and move direction are
    // independent dodge-admission preconditions, so pin them deterministically
    // after the keyboard event instead of letting focus/lifecycle behavior of
    // an unrelated direction key decide whether the trial is legal.
    await page.keyboard.down('Space');
    await page.evaluate(() => {
      const g = s3ProbeG.game;
      g.debug.key('KeyD', true); g.debug.fire(true);
      if (document.activeElement !== actionProof.canvas) throw Error('Canvas lost keyboard focus before first fixed tick');
      if (!g.input.keys.has('Space') || !g.input.pressed.has('Space')) throw Error('Physical Space edge did not reach Input before first fixed tick');
      if (!g.input.keys.has('KeyD') || !g.input.mouse.left) throw Error('First dodge preconditions were not established');
      g._skipRender = true; for (let i = 0; i < 31; i++) g._frame(1 / 60);
    });
    await page.keyboard.up('Space');
    await page.evaluate(() => { const g = s3ProbeG.game; g.debug.key('KeyD', false); });
    await page.keyboard.down('Space');
    result.actionReliability = await page.evaluate(() => {
      const g = s3ProbeG.game;
      // The lifecycle boundary attached to the physical second press may clear
      // unrelated held controls. Establish the independent direction/fire
      // preconditions only after the Space edge has reached Input.
      g.debug.key('KeyA', true); g.debug.fire(true);
      if (document.activeElement !== actionProof.canvas) throw Error('Canvas lost keyboard focus before second fixed tick');
      if (!g.input.keys.has('Space') || !g.input.pressed.has('Space')) throw Error('Physical Space edge did not reach Input before second fixed tick');
      if (!g.input.keys.has('KeyA') || !g.input.mouse.left) throw Error('Second dodge preconditions were not established');
      const before = actionProof.dodges;
      g._frame(1 / 120); const renderOnly = actionProof.dodges;
      g._frame(1 / 120); const after = actionProof.dodges;
      for (let i = 0; i < 90; i++) g._frame(1 / 60);
      return { before, renderOnly, after, held: actionProof.dodges, jumps: actionProof.jumps,
        physicalKeyboardEvents: true, groundCollisionPinned: true };
    });
    const r = result.actionReliability;
    if (r.before !== 1 || r.renderOnly !== 1 || r.after !== 2 || r.held !== 2 || r.jumps !== 0) throw Error('Native keyboard action edge did not reach Character exactly once: ' + JSON.stringify(r));
    await page.keyboard.up('Space');
    await page.evaluate(() => { const g=s3ProbeG.game; g.debug.key('KeyA', false); g.debug.fire(false); g._frame(1 / 60); });
  } finally {
    await page.evaluate(() => {
      const g = s3ProbeG.game, wasFrozen = actionProof.wasFrozen;
      actionProof.restore(); g.debug.fire(false); g.debug.key('KeyD', false); g.debug.key('KeyA', false); g._skipRender = false; g.input.keys.clear();
      const canvas = actionProof.canvas;
      if (canvas) {
        if (actionProof.oldTabIndex === null) canvas.removeAttribute('tabindex');
        else canvas.setAttribute('tabindex', actionProof.oldTabIndex);
      }
      if (!wasFrozen) g.debug.unfreeze();
    });
  }
  result.weaponMotion = await page.evaluate(async () => {
    const G=globalThis.s3ProbeG,a=G.game.match.local,ch=a.character,dt=1/60;
    const {flowMotionSnapshot}=await import(new URL('patches/splatoon3/runtime/flow-motion.mjs',document.baseURI).href);
    // The already loaded match's real runner and Actor frame drive the actual
    // rig. Position is held for these pose/timing checks; slide collision and
    // travel are covered separately by the actual-Physics regressions.
    const tick=(input={})=>{
      a.ink=100;a.intent.fire=!!input.fire;a.intent.sub=!!input.sub;
      G.time+=dt;a.weaponRunner.update(dt,input);a._finishFrame(dt);ch.root.updateMatrixWorld(true);
      if(!Array.from(ch.P).every(Number.isFinite))throw Error('Non-finite compiled weapon pose');
    };
    const prepare=kind=>{
      a.setWeapon(kind);a.form='kid';a.grounded=true;a.climbing=false;a.submerged=false;
      a.vel.set(0,0,0);a.intent.move.set(0,0,0);a.intent.fire=false;a.intent.sub=false;
      for(let i=0;i<90;i++)tick();
    };
    prepare('dualies');a.intent.fire=true;a.intent.move.set(1,0,0);
    if(!a.weaponRunner.tryDodge(a.intent.move))throw Error('Actual compiled dualies could not slide');
    a.intent.move.set(0,0,0);
    for(let i=0;i<120;i++)tick({fire:true});
    const dualies={turret:a.weaponRunner.s3Turret,lockTime:a.weaponRunner.lockT,poseWeight:ch.lockW,hipY:ch.bones.hips.position.y};
    if(!dualies.turret||dualies.lockTime!==0||dualies.poseWeight<.99)throw Error('Compiled stationary turret pose expired before the runner state');
    for(let i=0;i<60;i++)tick();
    dualies.releasedPoseWeight=ch.lockW;
    if(a.weaponRunner.s3Turret||ch.lockW>.002)throw Error('Compiled turret pose survived firing release');
    prepare('slosher');tick({fire:true});
    const windup=[];
    for(let i=0;i<36;i++){windup.push({frame:i+1,runnerTime:a.weaponRunner.slosh,weaponWorld:ch.weapon.off.matrixWorld.elements.slice()});tick();}
    if(!windup.some(s=>s.runnerTime>=0)||!windup.some(s=>s.runnerTime<0))throw Error('Compiled bucket never completed its actual windup');
    const firstWindupFrames=windup.findIndex(row=>row.runnerTime<0);
    if(firstWindupFrames!==12)throw Error('Compiled bucket release did not wait 12 elapsed frames');
    a.weaponRunner.reset();
    const releaseFrames=[],projectiles=G.projectiles,fireSlosh=projectiles.fireSlosh;
    let frame=0;
    try {
      projectiles.fireSlosh=function(...args){if(args[0]===a)releaseFrames.push(frame);return fireSlosh.apply(this,args);};
      for(frame=0;frame<120;frame++)tick({fire:true});
    } finally {projectiles.fireSlosh=fireSlosh;}
    if(releaseFrames.join(',')!=='12,41,70,99')throw Error('Compiled bucket did not repeat every 29 frames');
    a.weaponRunner.reset();tick();
    const reset={lastShot:ch.lastShot,chargeFlash:ch.chargeFlash};
    if(ch.lastShot<1||ch.chargeFlash!==0)throw Error('Compiled reset left weapon motion clocks active');
    prepare('shooter');a.special=0;a.s3.flow.active=true;a.s3.flow.remaining=10;tick();
    const glow=()=>{const c=ch.u.uGlow.value;return Math.hypot(c.r,c.g,c.b);};
    const flow={activeGlow:glow(),specialGlow:ch.wGlow};
    for(let i=0;i<60;i++)tick();flow.activePresentation=flowMotionSnapshot(ch);
    a.s3.flow.active=false;a.s3.flow.remaining=0;tick();flow.expiryPresentation=flowMotionSnapshot(ch);
    for(let i=0;i<30;i++)tick();flow.inactiveGlow=glow();flow.inactivePresentation=flowMotionSnapshot(ch);
    if(!Number.isFinite(flow.activeGlow)||flow.activeGlow<=0||flow.specialGlow>.001||flow.inactiveGlow>=.001)throw Error('Compiled Flow material did not follow actual actor state');
    if(!flow.activePresentation.visible||flow.activePresentation.aliveParticles<1||flow.inactivePresentation.visible||flow.inactivePresentation.phase!=='off')throw Error('Compiled Flow exterior did not follow actual actor state');
    prepare('charger');
    const cr=a.weaponRunner; a.kidT=1; a.intent.fire=true;
    for(let i=0;i<36;i++)cr.update(1/60,{fire:true});
    const suspendedCharge=cr.charge; a.special=a.specialCost(); const beforeSpecial=a.stats.specials;
    a._startSpecial();
    const specialCharge={suspendedCharge,active:!!a.specialActive,specials:a.stats.specials-beforeSpecial,
      charging:cr.charging,charge:cr.charge,chargeT:cr.chargeT,stored:cr.s3Stored??null};
    if(suspendedCharge<.5||!specialCharge.active||specialCharge.specials!==1||cr.charging||cr.charge!==0||cr.chargeT!==0||specialCharge.stored!==null)
      throw Error('Compiled successful special did not cancel suspended Charger charge');
    a.specialActive=null; a.intent.fire=false;
    return {fixture:'loaded match Actor/WeaponRunner -> complete Character; fixed pose position; Chromium WebGL',dualies,slosher:{windup,firstWindupFrames,releaseFrames},reset,flow,specialCharge};
  });
  result.subHud = await page.evaluate(async () => {
    const G=globalThis.s3ProbeG,g=G.game,a=g.match.local,hud=g.hud,mobile=g.input.mobile;
    const {subInkSpec}=await import(new URL('patches/splatoon3/runtime/sub-ready.mjs',document.baseURI).href);
    const {SUB,PLAYER}=await import(new URL('src/config.js',document.baseURI).href);
    g.debug.freeze();
    // Desktop Chromium has no touch-capability media flag. Install the actual
    // mobile control DOM once, then drive its real public setHud via Game.
    if(!mobile.els)mobile._install();
    const key='inkwave.splatoon3.gear.v1',saved=localStorage.getItem(key),wid=a.weaponId,rows=[];
    const update=hud.update,draw=hud._drawTank;let frame,mark;
    hud.update=function(dt,f){frame=f;return update.call(this,dt,f);};
    hud._drawTank=function(dt,sub,...rest){mark=sub;return draw.call(this,dt,sub,...rest);};
    try {
      for(const ap of [0,35,57]) {
        let loadout;
        for(let m=0;m<=3;m++){const n=(ap-10*m)/3;if(Number.isInteger(n)&&n>=0&&n<=9){loadout=Array.from({length:3},(_,i)=>({main:i<m?'inkSaverSub':'none',subs:Array.from({length:3},(_,j)=>i*3+j<n?'inkSaverSub':'none')}));break;}}
        localStorage.setItem(key,JSON.stringify(loadout));a.setWeapon('shooter');a.alive=true;a.form='kid';a.grounded=true;a.specialActive=null;a.superJumpState=null;a.intent.sub=true;
        a.ink=100;for(let i=0;i<6;i++)a.weaponRunner.update(1/60,{sub:true});
        const cost=subInkSpec(a,SUB.bomb).inkCost;
        for(const delta of [-.001,0,.001]) {
          a.ink=cost+delta;g._updateHud(1/60);
          const row={ap,delta,cost,mark,label:hud.subChip.querySelector('b').textContent,short:hud.subChip.classList.contains('is-short'),tank:hud.tank.classList.contains('is-nosub'),mobile:mobile.els.sub.classList.contains('is-dim'),ready:frame.subReady};
          if(Math.abs(mark-cost/PLAYER.inkMax)>1e-9||row.label!==Math.round(cost)+'%'||row.ready!==(delta>=0)||[row.short,row.tank,row.mobile].some(x=>x!==(delta<0)))throw Error('Compiled equipped sub HUD mismatch: '+JSON.stringify(row));
          rows.push(row);
        }
      }
    } finally {
      hud.update=update;hud._drawTank=draw;
      if(saved==null)localStorage.removeItem(key);else localStorage.setItem(key,saved);
      a.intent.sub=false;a.setWeapon(wid);a.ink=100;
    }
    return {fixture:'actual compiled Game/HUD Canvas2D and MobileInput DOM in Chromium',rows};
  });
  result.hudAuthority = await checkHudAuthority({ page, evidence, sourceSha, contentHash: manifest.contentHash });
  }
  if (!uiProbesOnly) result.runtimeQuality = await runQualityBrowserProbe(page);
  result.paintMipmaps = await runPaintMipmapBrowserProbe(page);
  result.status = 'passed';
} catch (error) {
  result = { ...(result || {}), status: 'failed', error: error.message };
  result.bootState = await page.evaluate(() => ({ hidden: document.hidden, visibility: document.visibilityState, mode: globalThis.s3ProbeG?.mode, game: !!globalThis.s3ProbeG?.game, renderer: !!globalThis.s3ProbeG?.renderer, menus: globalThis.s3ProbeG?.menus?.current, patch: globalThis.s3ProbeG?.s3, bootError: document.getElementById('boot-error')?.textContent, fonts: document.fonts.status, text: document.body.innerText.slice(0,1200), programs: globalThis.s3ProbeG?.renderer?.info.programs?.length, resources: performance.getEntriesByType('resource').slice(-8).map(r => r.name) })).catch(() => null);
  await page.screenshot({ path:path.join(evidence,'browser-failure.png') }).catch(() => {});
} finally {

  result.scope = uiProbesOnly ? 'ui-probes-only' : 'full-active'; result.fullAcceptance = !uiProbesOnly;
  result.sourceSha = sourceSha; result.verifiedResponses = receipts.length;
  result.verifiedRuntimeFiles = [...new Set(receipts)].sort();
  for (const required of ['patches/splatoon3/bootstrap.mjs','patches/splatoon3/profile.json','patches/splatoon3/runtime/install.mjs','patches/splatoon3/runtime/weapons.mjs','patches/splatoon3/runtime/movement.mjs','patches/splatoon3/runtime/walk.mjs','patches/splatoon3/runtime/roller.mjs','patches/splatoon3/runtime/movement-motion.mjs','patches/splatoon3/runtime/weapon-motion.mjs','patches/splatoon3/runtime/bomb-motion.mjs','patches/splatoon3/runtime/flow-motion.mjs','patches/splatoon3/runtime/weapon-detail-motion.mjs','src/main.js','src/game/actor.js','src/game/character.js','src/game/weapons.js']) if(!receipts.includes(required)) errors.push('Required runtime was not verified: '+required);
  if(errors.length || consoleErrors.length || failures.length) result.status = 'failed';
  result.errors = errors; result.consoleErrors = consoleErrors; result.requestFailures = failures;
  fs.writeFileSync(evidence + '/browser-result.json.writing', JSON.stringify(result, null, 2));
  fs.renameSync(evidence + '/browser-result.json.writing', evidence + '/browser-result.json');
  console.log(JSON.stringify({status:result.status,error:result.error,sourceSha,contentHash:result.contentHash,gearSelects:result.gearSelects,gameplay:result.gameplay,actionReliability:result.actionReliability,verifiedResponses:receipts.length,errors})); await browser.close();
}
if (result.status !== 'passed' || errors.length) process.exitCode = 1;

} finally { await browser?.close().catch(()=>{}); await new Promise(resolve=>server.close(resolve)); }
