#!/usr/bin/env node
// Controlled source-layer/respawn proof; distinct from whole-bank bot execution.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const source='e6effc27b375336108429c8c1fc7cd93dc5e8e1559b1b2e0cde6d98d65853527';
const site=path.resolve(process.argv[2]||'_site-native-bluefin-final');
const out=path.resolve(process.argv[3]||'.browser-evidence/bluefin-layers');
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const file=path.resolve(site,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
const result={status:'running',sourceSha256:source,errors:[],conditions:'Production Match/Actor/Character and source physics; controlled supported firing stance; ordinary WeaponRunner/Projectiles floor paint; source minimap; controlled Actor.splat with real death timer/respawn; direct Actor rates 30/60/120; 0AP; eight actors/seven bots; not whole-bank or retail proof; SwiftShader'};
page.on('pageerror',e=>result.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text().slice(0,1000));});
try{
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));
  Math.random=()=>.5;
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=bluefin',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{
  const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();
  await g.startMatch({mapId:'bluefin',mode:'turf',difficulty:'normal',duration:300});
  g.debug.freezeBots();
  g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);
  g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
  for(let i=0;i<80;i++)g._frame(1/60);
 });
 result.minimap=await page.evaluate(async()=>{
  const G=NG,map=G.game.minimap,{PLAYER}=await import(new URL('src/config.js',document.baseURI));
  map.ensure();if(G.level.nativeNav!==G.nav||map.level!==G.level||map.paint!==G.paint)throw Error('Detached source minimap/navigation');
  if(!G.level.native||G.level.layout.id!=='bluefin'||G.actors.some(a=>!a.alive))throw Error('Actual source match must retain all eight living actors');
  const vec=(x=0,y=0,z=0)=>G.local.pos.clone().set(x,y,z),down=vec(0,-1,0);
  const pixel=(x,z)=>{
   const p=map.toCanvas(x,z),ix=Math.max(0,Math.min(map.w-1,Math.floor(p.x))),iz=Math.max(0,Math.min(map.h-1,Math.floor(p.y))),index=iz*map.w+ix;
   return {index,x:map._worldX(ix+.5),z:map._worldZ(iz+.5),height:map.hgt[index],cell:map.pixCell[index]};
  };
  const pads=G.level.spawnPads.map(p=>pixel(p.x,p.z));
  if(pads.some(p=>Math.abs(p.height-15)>.15||p.cell<0))throw Error('Original pad minimap support '+JSON.stringify(pads));
  let beneath=null,beneathCount=0,broaderRayDifferences=0,firstBroaderRayDifference=null;
  for(let i=0;i<map.hgt.length;i++){
   if(map.pixCell[i]<0||map.hgt[i]<2.9)continue;
   const x=map._worldX(i%map.w+.5),z=map._worldZ(Math.floor(i/map.w)+.5),height=map.hgt[i],top=G.level.groundHeight(x,z);
   if(top-height<1)continue;
   // Verify the selected plane itself. A broad ray can hit a different source
   // surface just above it, including the retained 7cm fence/curb overlap.
   const h=G.level.triangleWorld.ray(vec(x,height+.002,z),down,.004,{minNormalY:.45});
   if(!h||Math.abs(h.point.y-height)>.0001)throw Error('Selected minimap layer lacks exact source floor '+JSON.stringify({index:i,x,z,height,top,hit:h?{triangle:h.triangle,y:h.point.y,normal:h.normal.toArray()}:null}));
   const physical=G.physics.raycast(vec(x,height+.1,z),down,.3);
   if(!physical.hit||Math.abs(physical.point.y-height)>.02){broaderRayDifferences++;firstBroaderRayDifference??={index:i,x,z,height,physicalHit:physical.hit,physicalY:physical.hit?physical.point.y:null,physicalTriangle:physical.hit?physical.triangle:null,physicalRawNormalY:physical.triangle>=0?G.level.triangleWorld.normals[physical.triangle*3+1]:null,selectedFloorTriangle:h.triangle};}
   beneathCount++;beneath??={index:i,x,z,height,top,cell:map.pixCell[i],triangle:h.triangle,sourceObject:G.level.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]].name};
  }
  if(!beneath)throw Error('No source lower-floor pixel beneath retained overhead geometry');
  // Select an empty pixel and a real nearby standing shot on its selected layer.
  let target=null,stance=null;
  const a=G.local;
  for(let i=0;i<map.hgt.length&&!target;i++){
   const cell=map.pixCell[i];if(cell<0||G.paint.grid[cell]!==0||map.hgt[i]<2.9)continue;
   const x=map._worldX(i%map.w+.5),z=map._worldZ(Math.floor(i/map.w)+.5),y=map.hgt[i];
   const h=G.physics.raycast(vec(x,y+.1,z),down,.3);if(!h.hit||h.face<0||h.normal.y<.99||Math.abs(h.point.y-y)>.0001)continue;
   for(const [dx,dz] of [[2.5,0],[-2.5,0],[0,2.5],[0,-2.5]]){
    const floor=G.physics.raycast(vec(x+dx,y+.2,z+dz),down,.4);
    if(!floor.hit||floor.normal.y<.99||Math.abs(floor.point.y-y)>.1||!G.physics.bodyFits(floor.point.clone().add(vec(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height))continue;
    const eye=floor.point.clone().add(vec(0,1.1,0)),line=h.point.clone().sub(eye),hit=G.physics.raycast(eye,line.clone().normalize(),line.length()+.02);
    if(!hit.hit||hit.point.distanceTo(h.point)>.05)continue;
    target={index:i,cell,x,z,height:y,face:h.face,triangle:h.triangle,point:h.point.toArray(),u:h.u,v:h.v};stance=floor.point.clone();break;
   }
  }
  if(!target)throw Error('No empty exact minimap floor with a supported ordinary shot');
  a.spawnAt(stance,0);G.projectiles.clear();a.intent.move.set(0,0,0);a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;
  const aim=vec(...target.point).sub(a.pos);aim.y-=1.1;a.aimYaw=Math.atan2(aim.x,aim.z);a.aimPitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z))));a.aimPoint.fromArray(target.point);a.intent.fire=true;
  let frames=0,naturalSplats=0;const splat=G.paint.splat;
  G.paint.splat=function(...args){naturalSplats++;return splat.apply(this,args);};
  try{for(;frames<240&&G.paint.grid[target.cell]!==a.team+1;frames++){G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);}}
  finally{G.paint.splat=splat;a.intent.fire=false;}
  if(!naturalSplats||G.paint.grid[target.cell]!==a.team+1||!a.alive||!a.grounded)throw Error('Natural shooter did not paint the exact selected minimap floor '+JSON.stringify({target,frames,naturalSplats,position:a.pos.toArray()}));
  for(let i=0;i<3;i++)map.update(1/60,true);
  const inkPixel=Array.from(map.inkImg.data.slice(target.index*4,target.index*4+4)),owner=map.owner[target.index];
  if(owner!==a.team+1||inkPixel[3]===0)throw Error('Natural source-floor ink absent from live minimap raster');
  map.setViewerTeam(1);const flipped=pixel(beneath.x,beneath.z);if(Math.abs(flipped.height-beneath.height)>.02)throw Error('Viewer flip changed source layer');map.setViewerTeam(0);
  G.paint.flush(1/60);G.renderer.render(G.scene,G.camera);
  return {pads,beneath,beneathCount,broaderRayDifferences,firstBroaderRayDifference,flipped,naturalPaint:{target,stance:stance.toArray(),frames,naturalSplats,owner,inkPixel,weapon:a.weaponId,gearAP:Object.keys(a.s3.abilityPoints).length},actors:G.actors.length,alive:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>a.bot).length,version1130Verified:G.level.manifest.version1130Verified};
 });
 assert.equal(result.minimap.actors,8);assert.equal(result.minimap.alive,8);assert.equal(result.minimap.bots,7);assert.equal(result.minimap.version1130Verified,false);assert.equal(result.minimap.naturalPaint.gearAP,0);
 await page.screenshot({path:path.join(out,'minimap.png'),timeout:60000});
 result.deathRespawns=await page.evaluate(()=>{
  const G=NG,pads=G.level.spawnPads,forward=pads[1].clone().sub(pads[0]).setY(0).normalize(),cases=[];
  for(const a of [G.local,G.actors.find(a=>a.bot&&a.team!==G.local.team)])for(const hz of [30,60,120]){
   const dt=1/hz,team=a.team,sign=team?-1:1,expected=Math.atan2(forward.x*sign,forward.z*sign);
   a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;
   a.aimYaw=expected+Math.PI;a.aimPoint.copy(pads[team]).addScaledVector(forward,-20*sign);if(a.bot)a.bot.aimYaw=a.aimYaw;
   const deaths=a.stats.deaths;a.splat(null,'environment');if(a.alive||a.stats.deaths!==deaths+1)throw Error('Production death lifecycle did not start');
   const tick=()=>{G.time+=dt;a.update(dt);G.projectiles.update(dt);G.paint.advanceSimulation(dt);};
   let deathFrames=0;while(!a.alive&&deathFrames<hz*15){tick();deathFrames++;}
   const target=a.s3.squidSpawn?.target;if(!target)throw Error('Natural death timer did not start source respawn');
   if(a.pos.clone().set(target.x,target.y,target.z).sub(pads[team]).dot(forward)*sign<=0||Math.abs(Math.sin(a.yaw)-Math.sin(expected))>1e-10||Math.abs(Math.cos(a.yaw)-Math.cos(expected))>1e-10)throw Error('Source death respawn retained stale outward aim');
   tick();if(!a.isBot)a.intent.fire=true;
   let landingFrames=0;while(a.s3.squidSpawn&&landingFrames<hz*4){tick();if(landingFrames>hz*.1)a.intent.fire=false;landingFrames++;}a.intent.fire=false;
   const h=G.physics.raycast(a.pos.clone().setY(a.pos.y+.1),a.pos.clone().set(0,-1,0),.3);
   if(!a.alive||!a.grounded||a.s3.squidSpawn||!h.hit||Math.abs(h.point.y-a.pos.y)>.02)throw Error('Source death launch did not settle on exact support '+JSON.stringify({team,hz,position:a.pos.toArray(),grounded:a.grounded,spawn:a.s3.squidSpawn}));
   if(Object.keys(a.s3.abilityPoints).length)throw Error('Unexpected gear');
   cases.push({team,hz,bot:!!a.bot,weapon:a.weaponId,deathFrames,deathSeconds:deathFrames/hz,landingFrames,landingSeconds:landingFrames/hz,target:[target.x,target.y,target.z],end:a.pos.toArray(),supportTriangle:h.triangle,supportObject:G.level.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]].name,alive:a.alive,grounded:a.grounded,gearAP:0});
  }
  if(G.actors.some(a=>!a.alive))throw Error('Source respawn proof must retain eight living actors');
  return cases;
 });
 assert.equal(result.deathRespawns.length,6);
 assert.equal(await page.evaluate(()=>NG.level.manifest.sourceSha256),source);
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));
 const b=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));result.build={contentHash:b.contentHash,inputHash:b.inputHash,revision:b.build.revision,runtimeSha256:b.build.nativeStages.runtimeSha256};
 result.status='passed';console.log(JSON.stringify({status:result.status,underneathPixels:result.minimap.beneathCount,naturalSplats:result.minimap.naturalPaint.naturalSplats,deathRespawns:result.deathRespawns.length,errors:result.errors.length}));
}catch(error){result.status='failed';result.error=error.stack;await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}
finally{fs.writeFileSync(path.join(out,'layers.json'),JSON.stringify(result,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
