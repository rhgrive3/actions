#!/usr/bin/env node
// Public-build stage selection, real cross-origin pinned downloads and browser
// conversion. Source pixels/screenshots remain in ignored local evidence.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {nativeStageCatalog} from './lib/inkwave-native-stages.mjs';
const SOURCE_STAGES=nativeStageCatalog().stages;
const site=path.resolve(process.argv[2]||'_site-native-public'),out=path.resolve(process.argv[3]||'.browser-evidence/native-source-public');fs.mkdirSync(out,{recursive:true});
assert(!fs.existsSync(path.join(site,'_native-reference-assets')),'public build must not contain source payload');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const proxyURL=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
const proxy=proxyURL?{server:proxyURL.origin,username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,proxy,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',stages:[],errors:[],downloads:0},context=await browser.newContext({viewport:{width:960,height:640},locale:'ja-JP'}),page=await context.newPage();
const save=()=>fs.writeFileSync(path.join(out,'source-browser.json'),JSON.stringify(result,null,2));
page.on('pageerror',e=>{result.errors.push(e.message);console.log('page-error '+e.message);});
page.on('console',m=>{if(m.type()==='error'){result.errors.push(m.text());console.log('browser-error '+m.text());}});
page.on('request',r=>{if(r.url().includes('media.githubusercontent.com/media/kirakira-dev/KiTrix/')&&r.url().endsWith('.obj'))result.downloads++;});
try{
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=tidewater',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:240000});assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(()=>{NG.game._skipRender=true;NG.game.menus.show('setup');});
 result.menu=await page.locator('.iw-ticket__name').allTextContents();for(const s of SOURCE_STAGES)assert(result.menu.includes(s.name),s.name+' not selectable');console.log(SOURCE_STAGES.length+' source choices visible');save();
 for(const s of SOURCE_STAGES.filter(s=>!process.env.NATIVE_STAGE_IDS||process.env.NATIVE_STAGE_IDS.split(',').includes(s.id))){
  console.log('select '+s.id);await page.evaluate(()=>{NG.game.input.exitLock();NG.game.debug.unfreeze();NG.game._skipRender=true;NG.game.menus.show('setup');});
  await page.waitForFunction(()=>!document.pointerLockElement);
  await page.waitForFunction(name=>{const root=NG.game.menus._scr?.el,ticket=[...root.querySelectorAll('.iw-ticket')].find(e=>e.textContent.includes(name));if(!ticket)return false;let opacity=1;for(let e=ticket;e&&e!==root.parentElement;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);return opacity>.7;},s.name);
  await page.locator('.iw-ticket').filter({hasText:s.name}).click();assert.equal(await page.evaluate(()=>NG.game.menus._setup.mapId),s.id);
  await page.locator('.iw-btn--start').click();
  await page.waitForFunction(id=>NG.level?.native&&NG.level.layout.id===id&&NG.match&&!NG.match.attract&&NG.match.state==='playing',s.id,{timeout:240000});
  const proof=await page.evaluate(()=>{const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);const p=G.level.spawnPads[0],h=G.physics.raycast(p.clone().setY(p.y+2),p.clone().set(0,-1,0),5);if(!h.hit)throw Error('No source spawn support');G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,G.local.team,{seed:.3125,instant:true});G.renderer.render(G.scene,G.camera);return {id:G.level.layout.id,sourceMode:G.level.manifest.sourceMode,sourceSha256:G.level.manifest.sourceSha256,geometry:G.level.manifest.geometry,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,coverage:G.paint.coverage(),spawn:{grounded:G.local.grounded,active:!!G.local.s3.squidSpawn},sourceMetrics:G.level.data.sourceMetrics,gameMetrics:g.nativeWorld.metrics,render:{...G.renderer.info.render},version1130Verified:G.level.manifest.version1130Verified};});
  assert.equal(proof.id,s.id);assert.equal(proof.sourceMode,'browser-direct');assert.equal(proof.sourceSha256,s.sourceSha256);assert.equal(proof.actors,8);assert.equal(proof.bots,7);assert.equal(proof.spawn.active,false);assert.equal(proof.spawn.grounded,true);assert(proof.coverage.some(n=>n>0));
  result.stages.push(proof);save();await page.screenshot({path:path.join(out,s.id+'.png'),timeout:60000});
 }
 if(result.stages.length){
  const last=result.stages.at(-1).id,before=result.downloads;
  await page.evaluate(async()=>{const {MAPS}=await import(new URL('src/config.js',document.baseURI));await NG.game._buildWorld(MAPS.find(m=>m.id==='tidewater'));});
  await page.evaluate(async id=>{const {MAPS}=await import(new URL('src/config.js',document.baseURI));await NG.game._buildWorld(MAPS.find(m=>m.id===id));},last);
  result.cache={id:last,derivedCacheHit:await page.evaluate(()=>NG.level.data.sourceMetrics.cached),objDownloads:result.downloads-before};assert.equal(result.cache.derivedCacheHit,true);assert.equal(result.cache.objDownloads,0);
 }
 if(result.stages.length){
  console.log('source failure rollback');const first=SOURCE_STAGES.find(s=>s.id===result.stages[0].id);
  await page.evaluate(async()=>{for(const key of await caches.keys())if(key.startsWith('inkwave-native-source-'))await caches.delete(key);await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase('inkwave-native-derived-v2');q.onsuccess=resolve;q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Derived cache still open'));});});
  await context.route('**/stages/'+first.internal+'/'+first.internal+'.obj',route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:Buffer.alloc(4)}));
  await page.evaluate(()=>{globalThis.rollbackLevel=NG.level;NG.game.input.exitLock();NG.game.debug.unfreeze();NG.game._skipRender=true;NG.game.menus.show('setup');});
  await page.waitForFunction(()=>!document.pointerLockElement);
  await page.waitForFunction(name=>{const e=[...NG.game.menus._scr.el.querySelectorAll('.iw-ticket')].find(e=>e.textContent.includes(name));return !!e&&Number(getComputedStyle(e).opacity)>.7;},first.name);
  await page.locator('.iw-ticket').filter({hasText:first.name}).click();await page.locator('.iw-btn--start').click();
  await page.waitForFunction(()=>NG.game.menus.current==='setup'&&document.body.textContent.includes('ステージを読み込めませんでした'),null,{timeout:180000});
  result.failureRollback=await page.evaluate(()=>({levelRetained:NG.level===rollbackLevel,menu:NG.game.menus.current,loadingRemoved:!document.getElementById('native-stage-loading')}));
  assert.equal(result.failureRollback.levelRetained,true);assert.equal(result.failureRollback.loadingRemoved,true);
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;result.state=await page.evaluate(()=>({mode:NG?.mode,map:NG?.level?.layout.id,menu:NG?.game?.menus?.current,loading:document.getElementById('native-stage-loading')?.textContent,boot:document.getElementById('boot-error')?.textContent})).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}
finally{save();await browser.close();await new Promise(r=>server.close(r));}
