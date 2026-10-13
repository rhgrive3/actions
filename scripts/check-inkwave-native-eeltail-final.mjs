#!/usr/bin/env node
// Targeted real-game checks for final shared minimap and tower-route changes.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native-eeltail-final'),out=path.resolve(process.argv[3]||'.browser-evidence/eeltail-final');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
const result={status:'running',errors:[],measurement:'Real Chromium game; exact source triangles and dynamic tower; diagnostic probes, not retail comparison'};
page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
try{
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=eeltail',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:'eeltail',mode:'turf',difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);g.debug.freezeBots();});
 result.minimap=await page.evaluate(()=>{
  const G=NG,map=G.game.minimap;map.ensure();if(G.level.nativeNav!==G.nav)throw Error('Minimap navigation is not owned by current level');
  const pixel=(x,z)=>{const c=map.toCanvas(x,z),ix=Math.max(0,Math.min(map.w-1,Math.floor(c.x))),iz=Math.max(0,Math.min(map.h-1,Math.floor(c.y))),index=iz*map.w+ix;return{index,x:map._worldX(ix+.5),z:map._worldZ(iz+.5),height:map.hgt[index],cell:map.pixCell[index]};};
  const center=pixel(0,-.5),top=G.level.groundHeight(center.x,center.z);
  if(Math.abs(center.height-6)>.12||top-center.height<5)throw Error('Unreachable central overhead surface hides playable floor: '+JSON.stringify({center,top}));
  const origin=G.local.pos.clone().set(center.x,center.height+.5,center.z),down=origin.clone().set(0,-1,0),hit=G.physics.raycast(origin,down,1);
  if(!hit.hit||center.cell<0)throw Error('Selected minimap layer has no exact paint support');
  G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),2,0,{seed:.25,instant:true});
  if(G.paint.grid[center.cell]!==1)throw Error('Minimap pixel does not address actual own-ink floor cell');
  const spawns=G.level.spawnPads.map(p=>pixel(p.x,p.z));if(spawns.some(p=>Math.abs(p.height-15)>.12))throw Error('Spawn minimap layer differs from source support');
  map.setViewerTeam(1);const flipped=pixel(0,-.5);if(Math.abs(flipped.height-center.height)>.12)throw Error('Viewer flip changed selected source floor');map.setViewerTeam(0);
  for(let i=0;i<3;i++)map.update(1/60,true);const inkPixel=Array.from(map.inkImg.data.slice(center.index*4,center.index*4+4));
  if(map.owner[center.index]!==1||inkPixel[3]===0)throw Error('Selected exact floor ink is absent from live minimap raster');
  G.paint.flush(1/60);G.renderer.render(G.scene,G.camera);
  return{center,topSurface:top,spawns,flipped,inkPixel,levelOwnsNavigation:true,ownInkVisible:true,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,initialSpawnActors:G.actors.map(a=>({team:a.team,alive:a.alive,position:a.pos.toArray(),spawnActive:!!a.s3?.squidSpawn})),local:{position:G.local.pos.toArray(),grounded:G.local.grounded,spawnActive:!!G.local.s3?.squidSpawn}};
 });assert.equal(result.minimap.actors,8);assert.equal(result.minimap.bots,7);assert.equal(result.minimap.local.grounded,true);assert.equal(result.minimap.local.spawnActive,false);assert(result.minimap.initialSpawnActors.every(a=>a.alive&&!a.spawnActive),'Initial source launch must finish for all eight actors');await page.screenshot({path:path.join(out,'minimap.png'),timeout:60000});
 result.deathRespawns=await page.evaluate(()=>{
  const G=NG,g=G.game,pads=G.level.spawnPads,forward=pads[1].clone().sub(pads[0]).setY(0).normalize(),proof=[];
  for(const actor of [G.local,G.actors.find(a=>a.bot&&a.team!==G.local.team)])for(const hz of [30,60,120]){
   const team=actor.team,sign=team?-1:1,expected=Math.atan2(forward.x*sign,forward.z*sign);
   actor.aimYaw=expected+Math.PI;actor.aimPoint.copy(pads[team]).addScaledVector(forward,-20*sign);if(actor.bot)actor.bot.aimYaw=actor.aimYaw;
   actor.alive=false;actor.respawn();const target=actor.s3.squidSpawn?.target;
   if(!target||actor.pos.clone().set(target.x,target.y,target.z).sub(pads[team]).dot(forward)*sign<=0)throw Error('Death launch did not choose supported opponent-facing target');
   if(Math.abs(Math.sin(actor.yaw)-Math.sin(expected))>1e-10||Math.abs(Math.cos(actor.yaw)-Math.cos(expected))>1e-10)throw Error('Death launch retained outward combat yaw');
   actor.intent.fire=false;g.input.mouse.left=false;g._frame(1/hz);
   actor.intent.fire=true;g.input.mouse.left=true;for(let i=0;i<Math.ceil(hz*.1);i++)g._frame(1/hz);actor.intent.fire=false;g.input.mouse.left=false;
   for(let i=0;i<hz*2;i++)g._frame(1/hz);
   if(!actor.alive||!actor.grounded||actor.s3.squidSpawn)throw Error('Actual source death launch failed to land: '+JSON.stringify({team,hz,position:actor.pos.toArray(),grounded:actor.grounded,spawn:actor.s3.squidSpawn}));
   proof.push({team,hz,bot:!!actor.bot,weapon:actor.weaponId,target:[target.x,target.y,target.z],position:actor.pos.toArray(),grounded:actor.grounded});
  }
  return proof;
 });
 await page.evaluate(async()=>{const g=NG.game;g.menus.wipe.cancel();await g.startMatch({mapId:'eeltail',mode:'tower',difficulty:'easy'});for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();});
 result.tower=await page.evaluate(()=>{
  const G=NG,m=G.match,e=m.ranked,w=m.rankedWorld,a=m.local,path=e.stage.tower.path;let probes=0;const failures=[];
  for(let i=0;i<path.length;i++)for(const side of [-.7,.7]){
   e.rule.state.position=path[i].slice();w._syncTower(e,false);a.pos.fromArray(path[i]);a.pos.x+=side;a.vel.set(0,0,0);a.grounded=true;a._resolve(false,a.pos.y,false);probes++;
   if(!a.grounded||a.ground.block!==w.towerBlockId||Math.abs(a.pos.y-path[i][1])>.12)failures.push({waypoint:i,side,position:a.pos.toArray(),grounded:a.grounded,block:a.ground.block});
  }
  const center=path[e.stage.tower.centerIndex];e.rule.state.position=center.slice();w._syncTower(e,false);a.pos.fromArray(center);a.pos.x+=.7;a.vel.set(0,0,0);a._resolve(false,a.pos.y,false);m.advanceRanked(1);
  if(e.rule.state.controllingTeam!==a.team)throw Error('Resolved real tower rider did not control tower');
  G.renderer.render(G.scene,G.camera);if(G.renderer.getContext().getError()!==G.renderer.getContext().NO_ERROR)throw Error('Final source scene WebGL error');
  return{pathNodes:path.length,path:path.map(p=>p.slice()),centerIndex:e.stage.tower.centerIndex,halfSize:e.stage.tower.halfSize,localLift:e.stage.tower.localLift,sourceClearance:e.stage.tower.sourceClearance,probes,failures,controllingTeam:e.rule.state.controllingTeam,version1130Verified:e.stage.version1130Verified,calibration:e.stage.calibration};
 });assert.deepEqual(result.tower.failures,[]);assert(result.tower.pathNodes>2);assert(result.tower.sourceClearance?.queries>0);assert.equal(result.tower.version1130Verified,false);
 result.otherRanked=[];
 for(const mode of ['zones','rainmaker','clams']){
  await page.evaluate(async mode=>{const g=NG.game;g.menus.wipe.cancel();await g.startMatch({mapId:'eeltail',mode,difficulty:'easy'});for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();},mode);
  result.otherRanked.push(await page.evaluate(mode=>{
   const m=NG.match,e=m.ranked,w=m.rankedWorld,a=m.local;
   if(mode==='zones'){w.captureZone(0,0);m.advanceRanked(1.2);if(e.counts[0]>98)throw Error('Final source zone did not score');}
   if(mode==='rainmaker'){m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:2000,kind:'main'});m.advanceRanked(1/60);if(e.rule.state.barrier.active)throw Error('Final source barrier did not pop');a.pos.fromArray(e.rule.state.pos);m.advanceRanked(1/60);if(e.rule.state.carrier===null)throw Error('Final source Rainmaker pickup failed');}
   if(mode==='clams'){a.pos.fromArray(e.rule.state.clams[0].pos);a.grounded=true;m.advanceRanked(1/60);const id=String(a.nid??`${a.team}:${a.slot}`);if(!(e.rule.state.inventories[id]?.small||e.rule.state.inventories[id]?.power))throw Error('Final source clam pickup failed');}
   if(!e.restore(e.snapshot()))throw Error('Final source rule snapshot restore failed');
   return{mode,actors:m.actors.length,counts:[...e.counts],goals:e.stage[mode]?.goals||null,version1130Verified:e.stage.version1130Verified};
  },mode));
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));
 result.build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')).contentHash;result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}
finally{fs.writeFileSync(path.join(out,'final.json'),JSON.stringify(result,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
