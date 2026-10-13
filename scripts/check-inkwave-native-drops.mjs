#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-drops');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'bluefin').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('console',m=>{if(m.text().startsWith('native-drop '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async id=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},id);
  const report=await page.evaluate(async()=>{
   const G=NG,N=G.nav,L=G.level,V=G.local.pos.constructor,vec=p=>new V(...p),cases=[];
   if(!L.manifest.sourceNavigation?.highDrops)throw Error('Source drop navigation is not opted in');
   const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI));
   const digest=async()=>{const h=await crypto.subtle.digest('SHA-256',L.data.triangles.buffer);return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');},before=await digest();
   for(const actor of G.actors){actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;}
   const desired=L.layout.id==='bluefin'?[[25,8.9237,-21.5],[-25,8.9237,21.5]]:L.layout.id==='humpback'?[[6.2,6,42.6],[-13.8,3,46.6]]:[[-2,11,40.89720153808594],[-18,11.0094,-17.1028],[18,11.0094,17.8972]],random=Math.random;Math.random=()=>.5;
   try{for(const start of desired){
    const upper=N.nodes.reduce((a,n)=>Math.hypot(n.x-start[0],n.y-start[1],n.z-start[2])<Math.hypot(a.x-start[0],a.y-start[1],a.z-start[2])?n:a,N.nodes[0]),edge=upper.nb.find(e=>e.drop&&Math.abs(e.drop.landing[1]-(L.layout.id==='manta'?8:L.layout.id==='humpback'&&start[0]<0?0:3))<.15&&(L.layout.id!=='humpback'||Math.abs(e.drop.direction[0])<.01&&e.drop.direction[2]<-.99));
    if(!edge)throw Error('Known genuine source drop is absent');const team=start[2]<0?0:1,actor=G.actors.find(a=>a.team===team&&a.bot),goal=vec(edge.drop.landing),support=G.physics.raycast(vec(edge.drop.upper).add(new V(0,.1,0)),new V(0,-1,0),.3);
    if(!support.hit||support.triangle<0||Math.abs(support.point.y-upper.y)>.15)throw Error('Upper setup lacks genuine source support '+JSON.stringify({node:upper.id,setup:edge.drop.upper,hit:support.hit,point:support.point.toArray(),triangle:support.triangle,face:support.face,normal:support.normal.toArray()}));
    const humanFits=G.physics.bodyFits(vec(edge.drop.upper),PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003),squidFits=G.physics.bodyFits(vec(edge.drop.upper),PLAYER.s3SwimTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003);
    if(!humanFits)throw Error('Human setup intersects source geometry');if(L.layout.id==='bluefin'&&squidFits)throw Error('Source railing swim-negative was lost');
    actor.setWeapon('shooter');
    for(const bot of [false,true])for(const hz of [30,60,120]){
     G.projectiles.clear();G.paint.clear();actor.spawnAt(vec(edge.drop.upper),Math.atan2(edge.drop.direction[0],edge.drop.direction[2]));actor.invuln=0;actor.bot=new BotBrain(actor,'normal');const brain=actor.bot;
     actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;
     if(bot){if(!brain._pathTo(goal,.6))throw Error('Existing BotBrain rejects source drop goal');brain.goalTimer=brain.repath=brain.bombCd=1000;}
     else actor.intent.move.fromArray(edge.drop.direction);
     const serial=actor.s3JumpSerial||0,times=[];let airborne=false,seconds=0,firstSourceLanding=null;
     for(let i=0;i<hz*6;i++){const t=performance.now();G.time+=1/hz;if(bot){brain.update(1/hz);if(brain._nativeSurge||brain._nativeClimb)throw Error('Isolated drop proof entered another native transition');}actor.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);times.push(performance.now()-t);airborne ||=!actor.grounded;seconds=(i+1)/hz;if(airborne&&actor.grounded&&actor.pos.y<upper.y-1.25){firstSourceLanding ||=G.physics.raycast(actor.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3).triangle;if(actor.pos.distanceTo(goal)<.4)break;}}
     const floor=G.physics.raycast(actor.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
     if(!(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<.9&&floor.hit&&floor.face>=0&&(actor.s3JumpSerial||0)===serial))throw Error('Actual source drop failed '+JSON.stringify({team,bot,hz,seconds,pos:actor.pos.toArray(),goal:goal.toArray(),alive:actor.alive,grounded:actor.grounded,form:actor.form}));
     times.sort((a,b)=>a-b);cases.push({team,bot,hz,seconds,upper:edge.drop.upper,landing:actor.pos.toArray(),sourceUpperTriangle:support.triangle,sourceLandingTriangle:floor.triangle,firstSourceLandingTriangle:firstSourceLanding,humanFits,squidFits,screenedSwimShape:edge.drop.squidClearance,form:actor.form,alive:true,grounded:true,jumpAdmitted:false,gearAP:Object.keys(actor.s3.abilityPoints),cpuStep:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}});
     console.log('native-drop '+JSON.stringify(cases.at(-1)));
    }
    actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.bot.update=()=>{};actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;
   }}finally{Math.random=random;}
   if(await digest()!==before)throw Error('Source collision buffer was mutated');
   G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);
   return {id:L.layout.id,sourceSha256:L.manifest.sourceSha256,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,weapon:'shooter / Shooter_Normal_00',version1130Verified:false,cases,collisionSha256:before,sourceBuffersUnchanged:true,conditions:'Actual Chromium Actor/BotBrain/ordinary movement/gravity; eight actors and seven bots retained; source-supported initial stances; zero AP; friendly ink initially empty; 0.5 RNG before Actor construction; production Character muzzle and ordinary Actor/BotBrain; SwiftShader'};
  });
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.bots,7);report.errors=errors;reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,id+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
