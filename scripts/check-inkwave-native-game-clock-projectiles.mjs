#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {selectNativeProjectileWall} from './lib/native-projectile-probe.mjs';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-game-clock-projectiles');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async id=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},id);
  await page.evaluate('globalThis.selectNativeProjectileWall='+selectNativeProjectileWall.toString());
  const report=await page.evaluate(async()=>{
   const G=NG,a=G.local,g=G.game,probe=selectNativeProjectileWall(G),cases=[];a.setWeapon('shooter');
   const world=G.projectiles.inkFlight.world,splat=G.paint.splat,trace=[],naturalPaint=[];G.projectiles.inkFlight.world=function(...args){const h=world.apply(this,args);if(h.hit)trace.push({face:h.face,triangle:h.triangle,distanceToTarget:h.point.distanceTo(probe.target),object:h.triangle>=0?G.level.triangleWorld.objectIds[h.triangle]:-1});return h;};
   G.paint.splat=function(...args){if(args[0].distanceTo(probe.target)<2)naturalPaint.push({face:args[3]?.face,kind:args[3]?.kind});return splat.apply(this,args);};
   const random=Math.random,controller=G.match.controller,controllerUpdate=controller.update,computeAim=controller.computeAim,actorUpdate=a.update,projectileUpdate=G.projectiles.update,configure=G.projectiles.inkFlight.configure;
   let fire=false,admitted=0,aimYaw=0,aimPitch=0;const actorDt=[],projectileDt=[];
   controller.update=function(){a.intent.move.set(0,0,0);a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=fire;a.aimYaw=a.intent.aimYaw=aimYaw;a.aimPitch=a.intent.aimPitch=aimPitch;a.aimPoint.copy(probe.target);};controller.computeAim=()=>{};
   a.update=function(dt){actorDt.push(dt);return actorUpdate.call(this,dt);};G.projectiles.update=function(dt){projectileDt.push(dt);return projectileUpdate.call(this,dt);};
   G.projectiles.inkFlight.configure=function(...args){const ok=configure.apply(this,args);if(ok&&args[0].owner===a)admitted++;return ok;};Math.random=()=>.5;
   try{for(const hz of [30,60,120]){
    G.projectiles.clear();G.paint.clear();trace.length=naturalPaint.length=actorDt.length=projectileDt.length=0;admitted=0;g.s3Clock.reset();const ticksBefore=g.s3Clock.ticks;
    const aim=probe.target.clone().sub(probe.stance.clone().add({x:0,y:1.05,z:0})),yaw=Math.atan2(aim.x,aim.z);a.spawnAt(probe.stance,yaw);a.aimPoint.copy(probe.target);a.aimYaw=a.intent.aimYaw=yaw;a.aimPitch=a.intent.aimPitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z));
    a.intent.move.set(0,0,0);a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=true;
    aimYaw=yaw;aimPitch=a.aimPitch;fire=true;
    for(let i=0;i<hz&&!admitted;i++)g._frame(1/hz);fire=false;
    if(!admitted)throw Error('No admitted ordinary shot '+JSON.stringify({hz,alive:a.alive,spawn:a.s3?.squidSpawn,mode:G.match.state,fire:a.intent.fire,weapon:a.weaponId}));
    const times=[];for(let i=0;i<hz;i++){const t=performance.now();g._frame(1/hz);times.push(performance.now()-t);}
    const clockTicks=g.s3Clock.ticks-ticksBefore;if(!actorDt.length||actorDt.some(dt=>Math.abs(dt-1/60)>1e-12)||projectileDt.some(dt=>Math.abs(dt-1/60)>1e-12)||actorDt.length!==clockTicks||projectileDt.length!==clockTicks)throw Error('Installed simulation clock mismatch');
    times.sort((a,b)=>a-b);const owned=G.paint.sample(probe.face,probe.u,probe.v),hit=trace.some(h=>h.triangle>=0&&h.object===G.level.triangleWorld.objectIds[probe.triangle]&&h.distanceToTarget<2);
    if(!owned||!hit||!naturalPaint.length)throw Error('Source wall not painted by actual admitted shot '+JSON.stringify({hz,owned,hit,face:probe.face,trace,naturalPaint}));
    if(!a.alive||!a.grounded)throw Error('Source-supported shooter lost ground');
    cases.push({renderHz:hz,simulationStep:1/60,clockTicks,actorTicks:actorDt.length,projectileTicks:projectileDt.length,admitted,owned,sourceSweepHit:hit,sourceContacts:trace.map(h=>({...h})),naturalWallSplats:naturalPaint.length,alive:a.alive,grounded:a.grounded,controlledGameFrameCpu:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}});
   }}finally{Math.random=random;controller.update=controllerUpdate;controller.computeAim=computeAim;a.update=actorUpdate;G.projectiles.update=projectileUpdate;G.projectiles.inkFlight.configure=configure;G.projectiles.inkFlight.world=world;G.paint.splat=splat;}
   G.paint.flush(1/60);g._skipRender=false;G.renderer.render(G.scene,G.camera);
   return {id:G.level.layout.id,sourceSha256:G.level.manifest.sourceSha256,version1130Verified:G.level.manifest.version1130Verified,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,weapon:a.weaponId,sourceWeapon:a.weapon.sourceMainActor,gear:a.s3?.loadout,cases,sourceObject:probe.sourceObject,face:probe.face,triangle:probe.triangle,conditions:'controlled source-supported spawnAt stance and controller-input/aim injection; actual Game._frame/Match/Actor/production Character/WeaponRunner/Projectiles fixed STEP1/60; render30/60/120; bots frozen; one ordinary admission per case; 0.5 RNG; SwiftShader; frame timings include presentation, not isolated projectile speed or retail controller proof'};
  });
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.bots,7);report.errors=errors;reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,id+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
