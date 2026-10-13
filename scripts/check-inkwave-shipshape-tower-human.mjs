#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site-native-shipshape');
const evidence=path.resolve(process.argv[3]||'.browser-evidence/shipshape-tower-human');
fs.mkdirSync(evidence,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end('Missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',buildContentHash:build.contentHash,revision:build.revision,cases:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text().slice(0,800));});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 for(const hz of [30,60,120]){
  const setup=await page.evaluate(async()=>{
   const G=NG,g=G.game;
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'shipshape',mode:'tower',difficulty:'normal'});
   g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);
   g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   for(let i=0;i<100;i++)g._frame(1/60);
   g.debug.freezeBots();g.menus.show(null);
   const {PLAYER}=await import(new URL('src/config.js',document.baseURI));
   const {nativeDropClearance}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
   const a=G.local,V=a.pos.constructor,L=G.level;
   for(const other of G.actors){
    if(other===a)continue;
    const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;
    p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;
    const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
    if(!h.hit||h.triangle<0||h.face<0||Math.abs(h.point.y-p.y)>.15)throw Error('Other actor lacks original source pad support');
    other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);
    other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;
   }
   G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');
   const tower=G.match.ranked.stage.tower,approach=tower.boarding.approaches[tower.centerIndex];
   if(!approach)throw Error('No source-qualified centre boarding approach');
   a.spawnAt(new V(...approach.start),0);
   for(let i=0;i<15;i++)g._frame(1/60);
   if(!a.grounded||a.ground.triangle<0||a.ground.block===G.match.rankedWorld.towerBlockId)throw Error('Human boarding must begin on original supported floor');
   const from=a.pos.clone();g.rig.yaw=Math.atan2(approach.end[0]-from.x,approach.end[2]-from.z);g.rig.pitch=0;
   const probe=G.physics.raycast(from.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
   const monitor=globalThis.shipshapeTowerHuman={approach,sourceSha256:L.manifest.sourceSha256,serial:a.s3JumpSerial||0,actorSteps:0,movementCapsules:0,actorCapsules:0,firstFailure:null,profiles:[],intervals:[],sweep:nativeDropClearance(L),originalUpdate:a.update,originalIntegrate:a._integrateMovementStep,originalCollide:G.physics.collideBody,body:null,sourceData:L.data.triangles};
   G.physics.collideBody=function(pos,radius,lift,height,...rest){
    if(pos===a.pos){monitor.body={radius,lift,height,skipGrates:!!rest[2]};if(!monitor.profiles.some(p=>JSON.stringify(p)===JSON.stringify(monitor.body)))monitor.profiles.push({...monitor.body});}
    return monitor.originalCollide.call(this,pos,radius,lift,height,...rest);
   };
   a._integrateMovementStep=function(dt,...args){
    const previous=this.pos.clone(),out=monitor.originalIntegrate.call(this,dt,...args),b=monitor.body;
    if(!b)throw Error('Installed source collider profile missing');
    if(!monitor.intervals.includes(dt))monitor.intervals.push(dt);
    monitor.movementCapsules++;
    if(!monitor.sweep.clear(previous,this.pos,b.radius,b.lift,b.height,b.skipGrates))monitor.firstFailure||={kind:'source-movement-sweep',previous:previous.toArray(),position:this.pos.toArray(),body:{...b}};
    return out;
   };
   a.update=function(dt){
    if(Math.abs(dt-1/60)>1e-12)throw Error('Actor differs from installed fixed STEP');
    const out=monitor.originalUpdate.call(this,dt);monitor.actorSteps++;
    const squid=this.form==='squid',radius=(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
    monitor.actorCapsules++;
    if(!G.physics.bodyFits(this.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid))monitor.firstFailure||={kind:'endpoint-capsule',position:this.pos.toArray(),radius,margin:.01};
    return out;
   };
   return {start:from.toArray(),sourceTriangle:probe.triangle,sourceFace:probe.face,jumping:!!approach.jumping,sourceFloor:true,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length};
  });
  await page.keyboard.down('w');if(setup.jumping)await page.keyboard.down('Space');
  let rider=null,walking=true;
  try{
   for(let frame=0;frame<hz*3;frame++){
    rider=await page.evaluate(async hz=>{
     const G=NG,a=G.local,m=shipshapeTowerHuman;
     const {nativeTowerRider}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
     G.game._frame(1/hz);
     const p=m.approach,dx=p.end[0]-p.start[0],dz=p.end[2]-p.start[2],d=Math.hypot(dx,dz);
     return {rider:nativeTowerRider(G,a),reached:((a.pos.x-p.start[0])*dx+(a.pos.z-p.start[2])*dz)/d>=d-.15};
    },hz);
    if(rider.rider)break;
    if(walking&&rider.reached){await page.keyboard.up('w');walking=false;}
   }
  }finally{await page.keyboard.up('w');await page.keyboard.up('Space');}
  const receipt=await page.evaluate(async()=>{
   const G=NG,a=G.local,m=shipshapeTowerHuman;
   const {nativeTowerRider}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
   a.update=m.originalUpdate;a._integrateMovementStep=m.originalIntegrate;G.physics.collideBody=m.originalCollide;
   return {rider:nativeTowerRider(G,a),sourceSha256:m.sourceSha256,position:a.pos.toArray(),grounded:a.grounded,groundBlock:a.ground.block,towerBlock:G.match.rankedWorld.towerBlockId,serialDelta:(a.s3JumpSerial||0)-m.serial,actorSteps:m.actorSteps,movementCapsules:m.movementCapsules,actorCapsules:m.actorCapsules,firstFailure:m.firstFailure,bodyProfiles:m.profiles,movementIntervals:m.intervals,sourceDataIdentity:G.level.data.triangles===m.sourceData,alive:a.alive,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,gearAP:Object.keys(a.s3.abilityPoints)};
  });
  result.cases.push({renderHz:hz,physicsHz:60,setup,...receipt});
  fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(result,null,2));
  assert.equal(receipt.rider,true,'Actual W/Space must board current Tower');
  assert.equal(receipt.grounded,true);assert.equal(receipt.alive,true);assert.equal(receipt.sourceDataIdentity,true);
  assert.equal(receipt.groundBlock,receipt.towerBlock);assert.equal(receipt.firstFailure,null);
  assert.equal(receipt.actors,8);assert.equal(receipt.bots,7);assert.equal(receipt.gearAP.length,0);
  assert(receipt.actorCapsules>0&&receipt.movementCapsules>0);
  if(setup.jumping)assert(receipt.serialDelta>=1,'Ordinary jump must be physically admitted');
  console.log(JSON.stringify({renderHz:hz,rider:true,actorSteps:receipt.actorSteps,movementCapsules:receipt.movementCapsules,actorCapsules:receipt.actorCapsules}));
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));
 result.status='passed';
 result.conditions='Physical keyboard W/Space from original source-supported inferred Tower approach; actual Game fixed STEP and production controller/Actor; eight actors/seven bots with other brains frozen; no postsetup actor pose/velocity/ink writes; actual movement-subdivision source capsule sweeps and endpoint fits; centre boarding only, full ride/scoring proven separately; Chromium SwiftShader, retail placement and hardware FPS unverified.';
 await context.close();
}catch(e){result.status='failed';result.error=e.message;throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(result,null,2));}
