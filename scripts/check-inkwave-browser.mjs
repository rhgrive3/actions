#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const option = name => { const i=process.argv.indexOf(name); if(i<0 || !process.argv[i+1]) throw new Error('Required '+name); return path.resolve(process.argv[i+1]); };
const site=option('--site'), evidence=option('--evidence-dir'), profile=option('--profile-dir');
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
  const files=Object.keys(manifest.files).map(key=>key.startsWith('upstream/')?'inkwave-public/'+key.slice(9):'patches/splatoon3/'+key.slice(6));
  Object.entries(manifest.files).forEach(([key,expected],i)=>{if(hash(fs.readFileSync(path.join(ROOT,files[i])))!==expected)throw new Error('Build input differs from manifest: '+key);});
  if(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs')))!==manifest.build.script)throw new Error('Build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs');
  const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  files.forEach((file,i)=>{if(blobs[i]!==tree.get(file))throw new Error('Build input differs from commit: '+file);});
}
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
await page.addInitScript(() => { localStorage.setItem('inkwave.settings', JSON.stringify({quality:'low', shadows:false, bloom:false})); });
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
  result.gameplay = await page.evaluate(() => {
    const G = globalThis.s3ProbeG, g = G.game; g.debug.freezeBots(); g._skipRender = true;
    for (let i=0;i<270;i++) g._frame(1/60);
    const initial = g.match.time;
    for (let i=0;i<60;i++) g._frame(1/20);
    const actor = g.match.local; const before = actor.pos.clone();
    g.debug.key('KeyW',true); for(let i=0;i<30;i++)g._frame(1/60);g.debug.key('KeyW',false);
    let paintedFloorArea=0;
    for(const face of G.paint.paintFaces) {
      if(!face.turf)continue;
      const cell=G.paint.dead.slice(face.grid,face.grid+face.nu*face.nv).findIndex(value=>!value);
      if(cell<0)continue;
      const point=face.origin.clone().addScaledVector(face.u,(cell%face.nu+.5)*face.cu).addScaledVector(face.v,(Math.floor(cell/face.nu)+.5)*face.cv).addScaledVector(face.n,.02);
      paintedFloorArea=G.paint.splat(point,.7,0,{seed:1}); if(paintedFloorArea>0)break;
    }
    g._skipRender = false;
    return {state:g.match.state, elapsedAt20Hz:initial-g.match.time-.5, movement:actor.pos.distanceTo(before), hp:actor.hp, gear:actor.s3.loadout, velocityFinite:[actor.vel.x,actor.vel.y,actor.vel.z].every(Number.isFinite), clockTicks:g.s3Clock.ticks, paintedFloorArea, coverage:G.paint.coverage()};
  });
  if (Math.abs(result.gameplay.elapsedAt20Hz-3)>1e-8 || !result.gameplay.velocityFinite || result.gameplay.movement<=0 || result.gameplay.paintedFloorArea<=0 || result.gameplay.coverage[0]<=0 || result.gameplay.coverage[0]>1) throw new Error('Actual browser gameplay regression');
  result.status = 'passed';
} catch (error) {
  result = { ...(result || {}), status: 'failed', error: error.message };
  result.bootState = await page.evaluate(() => ({ hidden: document.hidden, visibility: document.visibilityState, mode: globalThis.s3ProbeG?.mode, game: !!globalThis.s3ProbeG?.game, renderer: !!globalThis.s3ProbeG?.renderer, menus: globalThis.s3ProbeG?.menus?.current, patch: globalThis.s3ProbeG?.s3, bootError: document.getElementById('boot-error')?.textContent, fonts: document.fonts.status, text: document.body.innerText.slice(0,1200), programs: globalThis.s3ProbeG?.renderer?.info.programs?.length, resources: performance.getEntriesByType('resource').slice(-8).map(r => r.name) })).catch(() => null);
  await page.screenshot({ path:path.join(evidence,'browser-failure.png') }).catch(() => {});
} finally {
  
  result.sourceSha = sourceSha; result.verifiedResponses = receipts.length;
  for (const required of ['patches/splatoon3/bootstrap.mjs','patches/splatoon3/profile.json','patches/splatoon3/runtime/install.mjs','src/main.js','src/game/actor.js','src/game/weapons.js']) if(!receipts.includes(required)) errors.push('Required runtime was not verified: '+required);
  if(errors.length || consoleErrors.length || failures.length) result.status = 'failed';
  result.errors = errors; result.consoleErrors = consoleErrors; result.requestFailures = failures;
  fs.writeFileSync(evidence + '/browser-result.json.writing', JSON.stringify(result, null, 2));
  fs.renameSync(evidence + '/browser-result.json.writing', evidence + '/browser-result.json');
  console.log(JSON.stringify({status:result.status,sourceSha,contentHash:result.contentHash,gearSelects:result.gearSelects,gameplay:result.gameplay,verifiedResponses:receipts.length,errors})); await browser.close();
}
if (result.status !== 'passed' || errors.length) process.exitCode = 1;

} finally { await browser?.close().catch(()=>{}); await new Promise(resolve=>server.close(resolve)); }
