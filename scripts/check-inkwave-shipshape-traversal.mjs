#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-climbs');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'shipshape').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('console',m=>{if(m.text().startsWith('native-climb '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async id=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},id);
  const report=await page.evaluate(async()=>{
   const G=NG,N=G.nav,L=G.level,V=G.local.pos.constructor,vec=(p)=>new V(...p),cases=[],banks=[],drops=[];
   if(!L.manifest.sourceNavigation?.wallClimb)throw Error('Source wall navigation is not opted in');
   const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI));
   const {nativeRankedStage,nativeDropTransition}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),sourceStage=nativeRankedStage(G);
   const reachable=L.spawnPads.map((pad,team)=>{const seen=new Uint8Array(N.nodes.length),queue=[N.nativeSpawnNodeIds[team]];seen[queue[0]]=1;for(let i=0;i<queue.length;i++)for(const e of N.nodes[queue[i]].nb)if(N.valid[e.to]&&!seen[e.to]){seen[e.to]=1;queue.push(e.to);}return seen;});
   const {PLAYER}=await import(new URL('src/config.js',document.baseURI));
   const setupOthers=actor=>{for(const other of G.actors){if(other===actor)continue;const point=L.spawnPads[other.team].clone().add(new V((other.slot-1.5)*1.3,0,other.team?-1.5:1.5)),h=G.physics.raycast(point.clone().setY(point.y+.1),new V(0,-1,0),.3);if(!h.hit||h.face<0||!G.physics.bodyFits(point,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003))throw Error('Other real actor setup lacks source support');other.spawnAt(point,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;if(other.bot)other.bot.update=()=>{other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;};}};
   const bankGoals=[-1,1].map(sign=>{const pad=L.spawnPads[sign<0?0:1],ids=N.validIds.filter(id=>{const n=N.nodes[id];return reachable.every(r=>r[id])&&n.nativePaintable&&n.zone<0&&n.z*sign>54&&G.physics.bodyFits(new V(n.x,n.y,n.z),PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003);});if(ids.length<5)return null;return ids.reduce((a,b)=>{const x=N.nodes[a],y=N.nodes[b];return Math.hypot(x.x-pad.x,x.z-pad.z)>Math.hypot(y.x-pad.x,y.z-pad.z)?a:b;});});
   for(const actor of G.actors){actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;}
   const random=Math.random;Math.random=()=>.5;
   try{for(let team=0;team<2;team++){
    const actor=G.actors.find(a=>a.team===team&&a.bot),center=N.nearest(vec(sourceStage.zones[0].center),1.2),route=N.path(N.nearest(L.spawnPads[team],1.2),center,team,50000);
    if(!route)throw Error('No opposing pad to central source route');
    const at=route.slice(1).findIndex((to,i)=>N.edgeType(route[i],to)==='climb'),edge=N.nodes[route[at]].nb.find(e=>e.to===route[at+1]),climb=edge.climb;
    actor.setWeapon('shooter');
    const sign=team?1:-1,upperId=N.nearest(new V(-sign*4.5,9,sign*40),.3),lowerId=N.nearest(new V(-sign*4.5,6,sign*41),.3),drop=nativeDropTransition(N,N.nodes[upperId],N.nodes[lowerId]);
    if(!drop)throw Error('Original source drop was not screened');
    for(const bot of [false,true])for(const hz of [30,60,120]){
     G.projectiles.clear();G.paint.clear();setupOthers(actor);actor.spawnAt(vec(drop.drop.upper),Math.atan2(drop.drop.direction[0],drop.drop.direction[2]));actor.invuln=0;const goal=vec(drop.drop.landing);let brain;
     if(bot){brain=actor.bot=new BotBrain(actor,'normal');if(!brain._pathTo(goal,.6))throw Error('No ordinary bot source drop path');brain.goalTimer=brain.repath=brain.bombCd=1000;}
     else{actor.bot.update=()=>{};actor.intent.move.fromArray(drop.drop.direction);actor.intent.fire=actor.intent.squid=actor.intent.jump=false;}
     let airborne=false,firstTouchdown=null,seconds=0,completedDrop=false;
     for(let i=0;i<hz*6;i++){const activeDrop=brain?._nativeDrop;G.game._frame(1/hz);completedDrop ||=!!activeDrop&&!brain._nativeDrop;airborne ||=!actor.grounded;seconds=(i+1)/hz;if(airborne&&actor.grounded&&actor.pos.y<drop.drop.upper[1]-1.25&&!firstTouchdown)firstTouchdown={seconds,position:actor.pos.toArray()};if(firstTouchdown&&actor.grounded&&actor.pos.distanceTo(goal)<.45&&Math.abs(actor.pos.y-goal.y)<.16&&(!bot||completedDrop))break;}
     const hit=G.physics.raycast(actor.pos.clone().setY(actor.pos.y+.1),new V(0,-1,0),.3),face=L.faces[hit.face],cell=face?face.grid+Math.max(0,Math.min(face.nv-1,Math.floor(hit.v/face.cv)))*face.nu+Math.max(0,Math.min(face.nu-1,Math.floor(hit.u/face.cu))):null;
     if(!(firstTouchdown&&actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<.45&&Math.abs(actor.pos.y-goal.y)<.16&&hit.hit&&face?.turf&&L.mask[cell]&&(!bot||completedDrop)))throw Error('Original source drop final support failed '+JSON.stringify({team,bot,hz,end:actor.pos.toArray(),goal:goal.toArray(),pi:brain?.pi,phase:brain?._nativeDrop?.phase,grounded:actor.grounded,mode:brain?.mode,actualGoal:brain?.goal,path:brain?.path,target:brain?.target?{team:brain.target.team,pos:brain.target.pos.toArray()}:null,actors:G.actors.map(a=>({team:a.team,slot:a.slot,pos:a.pos.toArray(),alive:a.alive})),squidSpawn:!!actor.s3.squidSpawn,superJump:!!actor.superJumpState}));
     drops.push({team,bot,hz,seconds,firstTouchdown,end:actor.pos.toArray(),finalNode:goal.toArray(),verticalError:Math.abs(actor.pos.y-goal.y),sourceTriangle:hit.triangle,sourceObject:L.manifest.objects[L.triangleWorld.objectIds[hit.triangle]].name,sourceMask:1,alive:true,grounded:true,handlerCompleted:bot?true:null});console.log('native-climb '+JSON.stringify(drops.at(-1)));
    }
    for(const hz of [30,60,120]){
     G.projectiles.clear();G.paint.clear();setupOthers(actor);actor.spawnAt(vec(climb.lower),team?Math.PI:0);actor.invuln=0;actor.bot=new BotBrain(actor,'normal');const brain=actor.bot;
     if(!brain._pathTo(vec(climb.upper),.6))throw Error('Existing BotBrain rejected source upper support');brain.goalTimer=1000;brain.repath=1000;brain.bombCd=1000;
     let climbed=false,fire=false,swim=false,seconds=0;
     const times=[];for(let i=0;i<hz*8;i++){const t=performance.now();G.game._frame(1/hz);fire ||=actor.intent.fire;swim ||=actor.intent.squid;times.push(performance.now()-t);climbed ||=actor.climbing;seconds=(i+1)/hz;if(climbed&&actor.grounded&&Math.abs(actor.pos.y-climb.upper[1])<.15)break;}
     const owned=climb.samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===team+1).length;
     if(!(fire&&swim&&climbed&&actor.grounded&&Math.abs(actor.pos.y-climb.upper[1])<.15&&owned===climb.samples.length))throw Error('Source bot climb failed '+JSON.stringify({team,hz,fire,swim,climbed,grounded:actor.grounded,position:actor.pos.toArray(),owned,samples:climb.samples.length}));
     times.sort((a,b)=>a-b);cases.push({team,hz,seconds,fire,swim,climbed,grounded:true,ownedWallSamples:owned,sourceWallSamples:climb.samples.length,end:actor.pos.toArray(),cpuStep:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}});console.log('native-climb '+JSON.stringify(cases.at(-1)));
    }
    for(const hz of [30,60,120]){
     G.projectiles.clear();G.paint.clear();setupOthers(actor);actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.invuln=0;actor.bot=new BotBrain(actor,'normal');const brain=actor.bot,to=bankGoals[1-team];if(to===null)throw Error('Whole opposing source bank remains unreachable');const node=N.nodes[to],goal=new V(node.x,node.y,node.z);
     if(!brain._pathTo(goal,.6))throw Error('No existing bot opposing-bank route');const waypoints=brain.path.length,climbs=brain.path.slice(1).filter((id,i)=>N.edgeType(brain.path[i],id)==='climb').length;brain.goalTimer=brain.repath=brain.bombCd=1000;
     let climbed=false,fire=false,seconds=0,replans=0;
     for(let i=0;i<hz*90;i++){if(brain.mode==='paint'&&(!brain.path||brain.goal!==to)){brain._pathTo(goal,.6);brain.goalTimer=brain.repath=1000;replans++;}G.game._frame(1/hz);fire ||=actor.intent.fire;climbed ||=actor.climbing;seconds=(i+1)/hz;if(actor.grounded&&actor.pos.distanceTo(goal)<1.5)break;}
     if(!(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<1.5&&climbed&&fire&&climbs>=1))throw Error('Source bot bank route failed '+JSON.stringify({team,hz,seconds,position:actor.pos.toArray(),distance:actor.pos.distanceTo(goal),climbed,fire,climbs,replans,phase:brain._nativeClimb?.phase,climbSeconds:brain._nativeClimb?.seconds,climbStall:brain._nativeClimb?.stalled,form:actor.form,ink:actor.ink,intent:{squid:actor.intent.squid,fire:actor.intent.fire,move:actor.intent.move.toArray()},wallHit:{face:actor.wallHit.face,point:actor.wallHit.point.toArray(),owned:actor.wallHit.face>=0?G.paint.sample(actor.wallHit.face,actor.wallHit.u,actor.wallHit.v):-1},capHit:{face:actor._ledgeHit.face,point:actor._ledgeHit.point.toArray(),owned:actor._ledgeHit.face>=0?G.paint.sample(actor._ledgeHit.face,actor._ledgeHit.u,actor._ledgeHit.v):-1},edge:brain._nativeClimb?.edge.climb,mode:brain.mode,specialActive:actor.specialActive?{id:actor.specialActive.id,phase:actor.specialActive.phase}:null}));
     banks.push({team,hz,seconds,replans,waypoints,sourceClimbs:climbs,target:goal.toArray(),end:actor.pos.toArray(),distanceToGoal:actor.pos.distanceTo(goal),alive:true,grounded:true,climbed,fire});console.log('native-climb '+JSON.stringify(banks.at(-1)));
    }
    // Restore the tested bot to its actual own-bank setup before the other
    // team trial, so a prior opposing-bank endpoint cannot become a combat
    // target or body obstacle in the next isolated navigation trace.
    actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.bot.update=()=>{};actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;
   }}finally{Math.random=random;}
   G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);
   return {id:L.layout.id,sourceSha256:L.manifest.sourceSha256,version1130Verified:L.manifest.version1130Verified,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,weapon:'shooter / Shooter_Normal_00',gearAP:Object.keys(G.actors.find(a=>a.bot).s3.abilityPoints),drops,cases,banks,conditions:'production Chromium Game._frame/Match/Actor/BotBrain/WeaponRunner/Projectiles; installed fixed STEP independent of 30/60/120 render cadence; eight actors retained; other bots frozen; source-supported setup poses; source-ranked common-component targets; actual opposing-bank targets beyond z ±54 selected away from frozen opponent spawners; initial ownership cleared; goal reacquired after ordinary refill/recovery; 0.5 RNG; SwiftShader'};
  });
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.bots,7);report.errors=errors;reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,id+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
