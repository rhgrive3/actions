#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-bluefin-final'),out=path.resolve(process.argv[3]||'.browser-evidence/bluefin-human');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={status:'running',id:'bluefin',buildContentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,cases:[],errors:[],conditions:'real Chromium PlayerController keyboard W/Shift/Space; 30/60/120 Hz frame/input cadence with the production fixed 60 Hz simulation; source-supported initial poses; positive bank starts with empty ownership and controlled real Actor/WeaponRunner/Projectiles aim/fire/refill paints wall/runway at 30/60/120 Hz; negative wall initially friendly-painted; real keyboard movement; positive approach holds existing full Surge charge at feet>=7.2, releases Space until an actual fixed STEP enters burst, then pops to kid/+X before the crest; every live production STEP capsule on both wall ascents and entire subsequent source walkways is continuously source-screened; source walkway via keyboard W and camera yaw; eight actors/seven bots retained; bots frozen; no later Actor pose, velocity or ink assignment; positive natural projectile paint recorded separately from production fixed-clock keyboard movement; negative initial manual wall ownership is not weapon paint proof; SwiftShader, not hardware measurement'},save=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));let page;
try{
 const context=await browser.newContext({viewport:{width:960,height:640}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,800));});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'bluefin',mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();g.menus.show(null);for(const a of NG.actors){a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;}});
 for(const team of [0,1])for(const hz of [30,60,120]){
  const setup=await page.evaluate(async({team,hz})=>{
   const G=NG,a=G.local,V=a.pos.constructor,positive=team===0,start=positive?new V(20,3,18.5):new V(-27,3,-17.5),direction=positive?1:-1,z=start.z,origin=positive?26:-26;
   G.paint.clear();G.projectiles.clear();const support=G.physics.raycast(start.clone().add(new V(0,.3,0)),new V(0,-1,0),.6);if(!support.hit||support.normal.y<.68||support.point.distanceTo(start)>.01)throw Error('Human initial stance lacks exact source support');
   const walls=[],floors=[];for(let y=3.25;y<9.2;y+=.15){const h=G.physics.raycast(new V(origin,y,z),new V(direction,0,0),5);if(h.hit&&h.face>=0)walls.push(h);}let wallSamples=walls.length;
   if(wallSamples<30)throw Error('Human friendly source wall chain incomplete');
   if(!positive)for(const h of walls)G.paint.splat(h.point.clone().addScaledVector(h.normal,.005),1.8,team,{instant:true,seed:.375});
   if(positive)for(let x=20.5;x<=24.5;x+=.5){const h=G.physics.raycast(new V(x,5,18.5),new V(0,-1,0),3);if(h.hit&&h.face>=0)floors.push(h);}
   a.team=team;a.setWeapon('shooter');a.spawnAt(start,Math.atan2(direction,0));
   if(!a.s3?.abilityPoints||Object.keys(a.s3.abilityPoints).length)throw Error('Source human proof requires zero AP gear');
   let naturalPaint=null;if(positive){const oldRandom=Math.random;Math.random=()=>.5;let fireFrames=0,paintSeconds=0,refillSeconds=0;
   const tick=()=>{G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);};
   try{for(const target of [...floors,...walls]){
    if(a.ink<25){a.intent.fire=false;a.intent.squid=true;for(let i=0;i<hz*4&&a.ink<95;i++){tick();refillSeconds+=1/hz;}a.intent.squid=false;}
    a.intent.move.set(0,0,0);a.intent.squid=false;a.intent.fire=true;const d=target.point.clone().sub(a.pos);d.y-=1.1;a.aimYaw=Math.atan2(d.x,d.z);a.aimPitch=Math.max(-1.1,Math.min(1,Math.atan2(d.y,Math.hypot(d.x,d.z))));a.aimPoint.copy(target.point);
    for(let i=0;i<hz*2&&G.paint.sample(target.face,target.u,target.v)!==team+1;i++){tick();fireFrames++;paintSeconds+=1/hz;}
   }
   a.intent.fire=false;a.intent.squid=true;for(let i=0;i<hz*4&&a.ink<95;i++){tick();refillSeconds+=1/hz;}}finally{Math.random=oldRandom;}
   naturalPaint={fireFrames,paintSeconds,refillSeconds,wallOwned:walls.filter(h=>G.paint.sample(h.face,h.u,h.v)===team+1).length,floorOwned:floors.filter(h=>G.paint.sample(h.face,h.u,h.v)===team+1).length,floorTargets:floors.length,unownedFloor:floors.filter(h=>G.paint.sample(h.face,h.u,h.v)!==team+1).map(h=>({point:h.point.toArray(),face:h.face,triangle:h.triangle}))};
   if(naturalPaint.wallOwned!==walls.length||naturalPaint.floorOwned<7||fireFrames===0)throw Error('Natural projectile paint phase incomplete '+JSON.stringify(naturalPaint));
   }a.intent.squid=false;a.aimYaw=Math.atan2(direction,0);G.game.rig.yaw=a.aimYaw;G.game.rig.pitch=0;const {PLAYER}=await import(new URL('src/config.js',document.baseURI)),{nativeDropClearance}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
   globalThis.bluefinHuman={team,hz,positive,start:start.toArray(),sourceStartTriangle:support.triangle,wallSamples,frames:0,climbed:false,surge:false,startTicks:G.game.s3Clock.ticks,screenCapsules:true,capsuleSamples:0};
   if(!globalThis.bluefinHumanOriginalUpdate){
    globalThis.bluefinHumanOriginalUpdate=a.update;const clearance=nativeDropClearance(G.level);
    a.update=function(dt){const previous=this.pos.clone(),result=bluefinHumanOriginalUpdate.call(this,dt),p=bluefinHuman;
     if(p.screenCapsules){const sq=this.form==='squid',radius=(sq?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
      if(!clearance.clear(previous,this.pos,radius,sq?PLAYER.squidBodyLift:PLAYER.stepUp,sq?PLAYER.squidHeight:PLAYER.height,sq))throw Error('Human live STEP source capsule failed '+JSON.stringify({team:p.team,hz:p.hz,from:previous.toArray(),to:this.pos.toArray(),form:this.form,surge:this.s3.surge?.phase}));p.capsuleSamples++;}
     return result;};
   }
   return{team,hz,frameInputHz:hz,start:start.toArray(),sourceStartTriangle:support.triangle,wallSamples,naturalPaint};
  },{team,hz});
  await page.keyboard.down('w');await page.keyboard.down('Shift');
  if(team===0){
   const approach=await page.evaluate(()=>{const G=NG,a=G.local,p=bluefinHuman;for(let i=0;i<p.hz*2&&a.pos.x<=23.7;i++){G.game._frame(1/p.hz);p.frames++;if(!a.alive)break;}return{alive:a.alive,position:a.pos.toArray()};});assert(approach.alive&&approach.position[0]>23.7,'actual friendly source runway reaches takeoff');
   await page.keyboard.down('Space');const attached=await page.evaluate(()=>{const G=NG,a=G.local,p=bluefinHuman;for(let i=0;i<p.hz*3&&!a.climbing;i++){G.game._frame(1/p.hz);p.frames++;p.surge ||=a.s3.surge?.phase==='burst';if(!a.alive)break;}p.climbed ||=a.climbing;return{alive:a.alive,climbing:a.climbing,position:a.pos.toArray()};});assert(attached.alive&&attached.climbing,'actual keyboard running jump attaches to source wall');
   const chargeHeight=await page.evaluate(()=>{const G=NG,a=G.local,p=bluefinHuman;for(let i=0;i<p.hz*6&&a.pos.y<7.2;i++){G.game._frame(1/p.hz);p.frames++;if(!a.alive)break;}return{alive:a.alive,y:a.pos.y};});assert(chargeHeight.alive&&chargeHeight.y>=7.2,'ordinary held SQ/jump reaches safe charge height');
   await page.keyboard.up('w');
   const charged=await page.evaluate(()=>{const G=NG,a=G.local,p=bluefinHuman;for(let i=0;i<p.hz*4&&(a.s3.surge?.charge||0)<1;i++){G.game._frame(1/p.hz);p.frames++;if(!a.alive)break;}return{alive:a.alive,charge:a.s3.surge?.charge||0,position:a.pos.toArray()};});assert(charged.alive&&charged.charge>=1,'existing controller reaches full Surge charge without state writes');
   await page.keyboard.up('Space');
   const released=await page.evaluate(()=>{const G=NG,p=bluefinHuman,startTick=G.game.s3Clock.ticks;for(let i=0;i<4&&G.game.s3Clock.ticks===startTick;i++){G.game._frame(1/p.hz);p.frames++;}p.releaseSimulationTicks=G.game.s3Clock.ticks-startTick;p.surge ||=G.local.s3.surge?.phase==='burst';return{simulationTicks:p.releaseSimulationTicks,phase:G.local.s3.surge?.phase,position:G.local.pos.toArray()};});assert(released.simulationTicks>0&&released.phase==='burst','Space release must reach an actual squid STEP before human pop '+JSON.stringify(released));
   await page.keyboard.up('Shift');await page.keyboard.down('w');
   await page.evaluate(()=>{bluefinHuman.fullChargeHumanPop=true;});
  }
  const ascent=await page.evaluate(()=>{const G=NG,a=G.local,p=bluefinHuman;for(let i=0;i<p.hz*8;i++){G.game._frame(1/p.hz);p.frames++;p.climbed ||=a.climbing;p.surge ||=a.s3.surge?.phase==='burst';if(p.climbed&&a.grounded&&a.pos.y>8.9||!a.alive)break;}return{alive:a.alive,grounded:a.grounded,climbed:p.climbed,existingSurgeBurst:p.surge,fullChargeHumanPop:!!p.fullChargeHumanPop,releaseSimulationTicks:p.releaseSimulationTicks||0,continuousActualCapsuleSamples:p.capsuleSamples,continuousActualCapsuleFailures:0,seconds:p.frames/p.hz,capEnd:a.pos.toArray()};});await page.keyboard.up('Shift');await page.keyboard.up('w');assert(ascent.alive&&ascent.grounded&&ascent.climbed&&ascent.capEnd[1]>8.9,'actual keyboard reaches upper source cap '+JSON.stringify({setup,ascent}));
  await page.keyboard.down('w');
  const walkway=await page.evaluate(()=>{
   const G=NG,a=G.local,p=bluefinHuman,N=G.nav,V=a.pos.constructor,sign=p.team?-1:1,id=N.nearest(new V(20*sign,9,40*sign),1.2),goalNode=N.nodes[id],goal=new V(goalNode.x,goalNode.y,goalNode.z),route=p.positive?null:N.path(N.nearest(a.pos,1.2),id,p.team,50000);if(!p.positive&&!route)throw Error('Human upper cap lacks a source-supported own-bank walkway');let frames=0;
   // The positive human follows the same individually supported 23-point
   // walkway as its CPU proof; generic bot routing remains a separate gate.
   const literal=[[29,19.5],[30,20.5],[31,20.5],[31,21.5],[31,22.5],[31,23.5],[31,24.5],[31,25.5],[31,26.5],[30,27.5],[29,28.5],[28,29.5],[27,30.5],[27,31.5],[26,32.5],[25,33.5],[24,34.5],[23,35.5],[22,36.5],[21,37.5],[21,38.5],[20,39.5],[20,40.5]],targets=p.positive?literal.map(([x,z])=>({x,y:9,z})):route.slice(1).map(i=>N.nodes[i]);
   for(const node of targets){
    const nominal=new V(node.x,node.y,node.z),h=G.physics.raycast(p.positive?new V(node.x,10,node.z):nominal.clone().add(new V(0,.2,0)),new V(0,-1,0),p.positive?2:.4);if(!h.hit||h.normal.y<.68||(p.positive?Math.abs(h.point.y-9)>.15:h.point.distanceTo(nominal)>.01))throw Error('Human walkway node lacks original source support '+JSON.stringify({node,hit:h.hit,point:h.hit?h.point.toArray():null}));const target=p.positive?h.point.clone():nominal;let reached=false;
    for(let i=0;i<p.hz*3;i++){const dx=target.x-a.pos.x,dz=target.z-a.pos.z;if(Math.hypot(dx,dz)<.35&&Math.abs(target.y-a.pos.y)<.2&&a.grounded){reached=true;break;}G.game.rig.yaw=Math.atan2(dx,dz);G.game._frame(1/p.hz);frames++;if(!a.alive)break;}
    if(!reached||!a.alive)throw Error('Keyboard source bank walkway failed '+JSON.stringify({team:p.team,hz:p.hz,target:target.toArray(),position:a.pos.toArray(),alive:a.alive,grounded:a.grounded}));
   }
   return{walkwaySourceSupports:p.positive?literal.length:route.length,bankGoal:goal.toArray(),bankEnd:a.pos.toArray(),distanceToGoal:a.pos.distanceTo(goal),bankWalkSeconds:frames/p.hz,totalContinuousActualCapsuleSamples:p.capsuleSamples,simulationTicks:G.game.s3Clock.ticks-p.startTicks,alive:a.alive,grounded:a.grounded,weapon:a.weaponId,gear:a.s3.loadout};
  });await page.keyboard.up('w');assert(walkway.alive&&walkway.grounded&&walkway.distanceToGoal<.35);report.cases.push({...setup,...ascent,...walkway});save();console.log(JSON.stringify(report.cases.at(-1)));
 }
 const identity=await page.evaluate(async()=>{const G=NG,{STEP}=await import(new URL('patches/splatoon3/runtime/clock.mjs',document.baseURI));G.local.team=0;G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);return{sourceSha256:G.level.manifest.sourceSha256,version1130Verified:G.level.manifest.version1130Verified,simulationHz:1/STEP,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length};});assert.equal(identity.sourceSha256,'e6effc27b375336108429c8c1fc7cd93dc5e8e1559b1b2e0cde6d98d65853527');assert.equal(identity.version1130Verified,false);assert.equal(identity.simulationHz,60);assert.equal(identity.actors,8);assert.equal(identity.bots,7);assert.equal(report.errors.length,0,JSON.stringify(report.errors));Object.assign(report,identity,{status:'passed'});save();await page.screenshot({path:path.join(out,'bluefin.png'),timeout:60000});
}catch(error){report.status='failed';report.error=error.stack;save();if(page)await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
