#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),out=path.resolve(process.argv[3]||'.browser-evidence/native-lifecycle');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],result={status:'running',errors};
try{
 const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
 await p.goto(address+'/?map=scorch',{waitUntil:'domcontentloaded'});await p.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await p.locator('#boot-error').textContent(),'');
 await p.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;});console.log('lifecycle boot');
 // Preserve all authorities across an actual production quality update.
 result.quality=await p.evaluate(async()=>{
  const G=NG,g=G.game,m=await import(new URL('patches/local-quality/world-quality.mjs',document.baseURI)),config=await import(new URL('src/config.js',document.baseURI));
  const level=G.level,physics=G.physics,nav=G.nav,paint=G.paint,grid=paint.grid,dead=paint.dead,p=level.spawnPads[0].clone();p.y-=.05;paint.splat(p,2,0,{seed:.125,instant:true});
  const before=new Uint8Array(grid),geometry=g.levelMesh.geometry.getAttribute('position').array.slice();
  for(const quality of ['high','low']){g.settings.quality=quality;await m.applyRuntimeWorldQuality(g,g.settings,g.mobile,{G,effectiveQuality:config.effectiveQuality});if(G.level!==level||G.physics!==physics||G.nav!==nav||G.paint!==paint||paint.grid!==grid||paint.dead!==dead)throw Error('Native authority replaced on quality change');for(let i=0;i<grid.length;i++)if(grid[i]!==before[i])throw Error('Quality changed CPU paint');const positions=g.levelMesh.geometry.getAttribute('position').array;if(positions.length!==geometry.length||positions.some((v,i)=>v!==geometry[i]))throw Error('Quality replaced source ink triangles');G.renderer.render(G.scene,G.camera);G.renderer.getContext().finish();}
  return {cpuGridUnchanged:true,trianglePositionsUnchanged:true,authoritiesRetained:true,finalAtlas:paint.size,textureCount:g.nativeWorld.metrics.textureCount};
 });console.log('quality passed');
 // Reject a corrupt asset while retaining the current stage and its resources.
 await p.route('**/_native-reference-assets/hagglefish/vertices.bin',route=>route.fulfill({status:200,body:Buffer.alloc(4),contentType:'application/octet-stream'}));
 result.failureRollback=await p.evaluate(async()=>{
  const G=NG,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI)),level=G.level,paint=G.paint,display=g.nativeWorld.display;let rejected=false;
  try{await g._buildWorld(MAPS.find(m=>m.id==='hagglefish'));}catch(e){rejected=/integrity mismatch/.test(e.message);}
  return {rejected,levelRetained:G.level===level,paintRetained:G.paint===paint,displayRetained:g.nativeWorld.display===display};
 });assert(Object.values(result.failureRollback).every(Boolean));await p.unroute('**/_native-reference-assets/hagglefish/vertices.bin');console.log('rollback passed');
 result.cancellation=await p.evaluate(async()=>{
  const G=NG,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI));
  const first=g._buildWorld(MAPS.find(m=>m.id==='hagglefish'));const second=g._buildWorld(MAPS.find(m=>m.id==='inkblot'));await Promise.all([first,second]);
  return {id:G.level.layout.id,nativeGroups:G.scene.children.filter(x=>x.name==='native-source-display').length};
 });assert.equal(result.cancellation.id,'inkblot');assert.equal(result.cancellation.nativeGroups,1);console.log('cancel passed');
 result.switches=[];
 for(const id of ['tidewater','brinewater','tidewater']){
  const s=await p.evaluate(async id=>{const G=NG,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI));await g._buildWorld(MAPS.find(m=>m.id===id));G.renderer.render(G.scene,G.camera);G.renderer.getContext().finish();return {id:G.level.layout.id,native:!!G.level.native,nativeGroups:G.scene.children.filter(x=>x.name==='native-source-display').length,memory:{...G.renderer.info.memory}};},id);result.switches.push(s);assert.equal(s.id,id);assert.equal(s.nativeGroups,id==='brinewater'?1:0);
 }
 // Explicitly verify mismatched geometry AND runtime fingerprints reject.
 result.fingerprint=await p.evaluate(async()=>{const registry=await import(new URL('patches/native-stages/runtime/registry.mjs',document.baseURI)),value=registry.nativeStageFingerprint('scorch');return {same:registry.nativeStageCompatible({map:'scorch',nativeStage:value}),changed:registry.nativeStageCompatible({map:'scorch',nativeStage:value+'-changed'}),missing:registry.nativeStageCompatible({map:'scorch'})};});assert.deepEqual(result.fingerprint,{same:true,changed:false,missing:false});
 await c.close();
 // Mobile emulation tests a touch viewport, GL rendering and CPU frame costs.
 // SwiftShader is not a real mobile GPU; this must not be reported as device FPS.
 result.mobile=[];
 for(const id of ['scorch','hagglefish','inkblot','mako','brinewater']){
  console.log('mobile '+id);const c=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};});
  await p.goto(address+'/?map='+id,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);await p.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await p.locator('#boot-error').textContent(),'');
  await p.evaluate(async id=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);},id);
  const metrics=await p.evaluate(()=>{
   const G=NG,g=G.game,times=[];for(let i=0;i<180;i++){const start=performance.now();g._frame(1/60);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
   const r=G.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');const draw=[];for(let i=0;i<6;i++){const t=performance.now();r.render(G.scene,G.camera);gl.finish();draw.push(performance.now()-t);}draw.sort((a,b)=>a-b);
   return {id:G.level.layout.id,viewport:[innerWidth,innerHeight],touch:!!g.mobile.touch,actors:G.actors.length,native:true,atlas:G.paint.size,textureCount:g.nativeWorld.metrics.textureCount,cpuFrame:{p50:times[90],p95:times[171],max:times.at(-1)},gpuDrainRenderMs:draw[3],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),local:{grounded:G.local.grounded,spawn:!!G.local.s3.squidSpawn},mobileHardwareMeasured:false};
  });assert.equal(metrics.actors,8);assert.equal(metrics.atlas,2048);result.mobile.push(metrics);await p.screenshot({path:path.join(out,id+'-mobile.png'),timeout:60000});await c.close();
 }
 assert.equal(errors.length,0,JSON.stringify(errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'lifecycle.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
