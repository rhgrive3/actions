#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site-native-manta-final'),out=path.resolve(process.argv[3]||'.browser-evidence/manta-banks');
fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={status:'running',id:'manta',build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),banks:[],errors:[],conditions:'real Chromium SwiftShader; installed Game._frame at render30/60/120 and observed production Actor/BotBrain STEP1/60; fresh normal eight-actor/seven-bot Match per trial; other actors start on independently supported positions near original own-team pads with frozen input; controlled bot starts on the original pad; empty initial ink and ordinary BotBrain/Actor/weapon/projectiles/paint clock; no later pose or ink assignment; every live capsule sweep and final static source-foot support verified; timed render frames include the independent sweep; 0.5 RNG before source Match Actor/Brain construction; not console or mobile hardware'};
const save=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));
let page;
try{
 const context=await browser.newContext({viewport:{width:960,height:640}});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,800));});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;globalThis.MantaBrain=(await import(new URL('src/game/bots.js',document.baseURI))).BotBrain;globalThis.MantaPlayer=(await import(new URL('src/config.js',document.baseURI))).PLAYER;const engine=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));globalThis.MantaClearance=engine.nativeDropClearance;globalThis.MantaFootSupported=engine.nativeSourceFootSupported;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(()=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();globalThis.mantaRandom=Math.random;Math.random=()=>.5;});
 for(const team of [0,1])for(const hz of [30,60,120]){
  await page.evaluate(async hz=>{const g=NG.game;await g.startMatch({mapId:'manta',mode:'turf',difficulty:'normal'});g._skipRender=true;g.debug.freezeBots();for(let i=0;i<Math.ceil(hz*5.5);i++)g._frame(1/hz);g.input.mouse.left=true;for(let i=0;i<Math.ceil(hz*.05);i++)g._frame(1/hz);g.input.mouse.left=false;for(let i=0;i<hz*2;i++)g._frame(1/hz);g.menus.show(null);for(const a of NG.actors){a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;}},hz);
  const topology=await page.evaluate(team=>{
   const G=NG,N=G.nav,V=G.local.pos.constructor,sign=team?-1:1,id=N.nearest(new V(12*sign,8,team?-30.102798461914062:30.897201538085938),1.2),n=N.nodes[id];
   if(!n||Math.abs(n.y-8)>.1||Math.abs(n.z)<29||Math.sign(n.z)!==sign)throw Error('Opposing upper-bank source goal was substituted');
   const goal=new V(n.x,n.y,n.z),h=G.physics.raycast(goal.clone().add(new V(0,.3,0)),new V(0,-1,0),.6),route=N.path(N.nativeSpawnNodeIds[team],id,team,Math.max(6000,N.nodes.length*4));
   if(!h.hit||h.normal.y<.68||h.point.distanceTo(goal)>.01||!route)throw Error('No supported original upper-pad to opposing-bank source route');
   const edges=route.slice(1).map((to,i)=>N.nodes[route[i]].nb.find(e=>e.to===to)),climbs=edges.filter(e=>e.type==='climb'),drops=edges.filter(e=>e.type==='drop');
   if(!climbs.length||!drops.length)throw Error('Opposing-bank route does not prove whole original foredeck access through a genuine NP-rim Surge');
   globalThis.mantaProbe={team,id,goal,node:n};
   return{team,start:G.level.spawnPads[team].toArray(),goal:goal.toArray(),sourceGoalTriangle:h.triangle,sourceGoalObject:G.level.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]].name,waypoints:route.length,sourceClimbs:climbs.length,sourceDrops:drops.length};
  },team);
   const row=await page.evaluate(hz=>{
    const G=NG,g=G.game,a=G.actors.find(a=>a.team===mantaProbe.team&&a.bot),goal=mantaProbe.goal,V=a.pos.constructor;G.paint.clear();G.projectiles.clear();
    for(const other of G.actors){if(other===a)continue;const pad=G.level.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;pad.x+=Math.cos(angle)*.7;pad.z+=Math.sin(angle)*.7;const h=G.physics.raycast(pad.clone().add(new V(0,.3,0)),new V(0,-1,0),.6);if(!h.hit||h.normal.y<.68||h.point.distanceTo(pad)>.15)throw Error('Other actor setup lacks original supported pad');other.spawnAt(pad,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;if(other.bot)other.bot.update=()=>{};}
    a.setWeapon('shooter');a.spawnAt(G.level.spawnPads[a.team],a.team?Math.PI:0);a.invuln=0;a.bot=new MantaBrain(a,'normal');const b=a.bot;
    if(!a.s3?.abilityPoints||Object.keys(a.s3.abilityPoints).length)throw Error('Source bank proof requires zero AP gear');
    if(!b._pathTo(goal,.6))throw Error('Existing bot rejected genuine opposing-bank goal');b.goalTimer=b.repath=b.bombCd=1000;
    let fire=false,climbed=false,surged=false,seconds=0,replans=0,transientPathMisses=0,minimumY=a.pos.y,capsuleSamples=0,actorTicks=0;const times=[],clearance=MantaClearance(G.level),PLAYER=MantaPlayer,actorIntervals=new Set(),brainIntervals=new Set(),tickStart=g.s3Clock.ticks,actorUpdate=a.update,brainUpdate=b.update;
    b.update=function(dt){brainIntervals.add(dt);return brainUpdate.call(this,dt);};
    a.update=function(dt){
     actorIntervals.add(dt);actorTicks++;if(Math.abs(dt-1/60)>1e-12)throw Error('Actor differs from installed fixed STEP');
     fire ||=this.intent.fire;const previous=this.pos.clone();actorUpdate.call(this,dt);
     const squid=a.form==='squid',raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw,radius=Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
     if(!clearance.clear(previous,a.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid))throw Error('Continuous actual source bank capsule '+JSON.stringify({team:a.team,renderHz:hz,actorTick:actorTicks,from:previous.toArray(),to:a.pos.toArray(),form:a.form}));capsuleSamples++;
     climbed ||=a.climbing;surged ||=a.s3.surge?.phase==='burst';minimumY=Math.min(minimumY,a.pos.y);
    };
    try{for(let i=0;i<hz*120;i++){
     if(b.mode==='paint'&&(!b.path||b.goal!==mantaProbe.id)){if(!b._pathTo(goal,.6))transientPathMisses++;b.goalTimer=b.repath=1000;replans++;}
     const t=performance.now();g._frame(1/hz);times.push(performance.now()-t);seconds=(g.s3Clock.ticks-tickStart)/60;
     if(!a.alive||a.grounded&&a.pos.distanceTo(goal)<1.5&&MantaFootSupported(G,a,mantaProbe.node))break;
    }}finally{a.update=actorUpdate;b.update=brainUpdate;}
    if(actorIntervals.size!==1||!actorIntervals.has(1/60)||brainIntervals.size!==1||!brainIntervals.has(1/60)||actorTicks!==g.s3Clock.ticks-tickStart)throw Error('Actual Match did not own every fixed Actor/BotBrain tick');
    if(!(a.alive&&a.grounded&&a.pos.distanceTo(goal)<1.5&&MantaFootSupported(G,a,mantaProbe.node)&&climbed&&surged&&fire))throw Error('Existing bot failed genuine opposing source bank '+JSON.stringify({team:a.team,hz,seconds,pos:a.pos.toArray(),goal:goal.toArray(),distance:a.pos.distanceTo(goal),alive:a.alive,grounded:a.grounded,climbed,surged,fire,form:a.form,ink:a.ink,mode:b.mode,pi:b.pi,path:b.path?.slice(b.pi,b.pi+2),phase:b._nativeClimb?.phase,replans}));
    times.sort((a,b)=>a-b);const result={team:a.team,renderHz:hz,physicsHz:60,actorIntervals:[...actorIntervals],brainIntervals:[...brainIntervals],actorTicks,seconds,replans,transientPathMisses,minimumY,end:a.pos.toArray(),distanceToGoal:a.pos.distanceTo(goal),alive:true,grounded:true,sourceFootSupported:true,continuousActualCapsuleSamples:capsuleSamples,continuousActualCapsuleFailures:0,climbed,surged,fire,weapon:a.weaponId,sourceWeapon:a.weapon.sourceMainActor,gear:a.s3.loadout,gearAP:0,verifiedRenderFrameMilliseconds:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}};
    a.spawnAt(G.level.spawnPads[a.team],a.team?Math.PI:0);a.bot.update=()=>{};a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;return result;
   },hz);
   report.banks.push({...topology,...row});save();console.log(JSON.stringify({bank:report.banks.at(-1)}));
 }
 const identity=await page.evaluate(()=>{const G=NG;Math.random=mantaRandom;G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);return{sourceSha256:G.level.manifest.sourceSha256,version1130Verified:G.level.manifest.version1130Verified,actors:G.actors.length,aliveActors:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>a.bot).length,candidateNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length};});
 assert.equal(identity.sourceSha256,'8b7a26e0f71ed69c055e42ead154bd34bc08532ba89a95bea3a813766716ac1a');assert.equal(identity.version1130Verified,false);assert.equal(identity.actors,8);assert.equal(identity.aliveActors,8);assert.equal(identity.bots,7);assert.equal(report.errors.length,0,JSON.stringify(report.errors));Object.assign(report,identity,{status:'passed'});save();await page.screenshot({path:path.join(out,'manta.png'),timeout:60000});
}catch(error){report.status='failed';report.error=error.stack;save();if(page)await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
