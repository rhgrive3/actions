#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),helperHash=crypto.createHash('sha256').update(fs.readFileSync(new URL('../patches/native-stages/runtime/native-jump-input.mjs',import.meta.url))).digest('hex');
assert.equal(build.files['native-stages/runtime/native-jump-input.mjs'],helperHash,'test the exact candidate helper');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',fingerprint:build.contentHash,helperHash,cases:[],errors:[],scope:'Installed production Game/Actor/Character/BotBrain in normal eight-actor Match. Original supported source node2230→2403; actual normal jump admitted before controlled controller-context cancellation. Mode identity changes are explicit negative controls, not a claim about natural goal policy. Actual reset, death/respawn and startMatch world changes; no source, pose, velocity or serial writes after initial source setup. Tower uses physical keyboard boarding from original source floor. SwiftShader.'};
try{
 const page=await browser.newPage({viewport:{width:960,height:640}});page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot',null,{timeout:180000});
 for(const change of ['refill','retreat','defend','target','reset','death-respawn','world','match','nav','squid']){
  const row=await page.evaluate(async change=>{
   const G=NG,g=G.game,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{NavGraph}=await import(new URL('src/game/nav.js',document.baseURI)),{nativeOrdinaryJumpInput}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
   g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'wahoo',mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();
   const a=G.actors.find(v=>v.team===1&&v.bot),V=a.pos.constructor;a.setWeapon('shooter');a.spawnAt(new V(12.599296569824219,10.872639257757971,-24.185100555419922),0);for(let i=0;i<30;i++)g._frame(1/60);if(!a.grounded)throw Error('Original lower floor must support setup');
   a.bot=new BotBrain(a,'normal');const b=a.bot;if(!b._pathTo(new V(12.599296569824219,12.025199890136719,-23.185100555419922),.6)||b.path.length!==2)throw Error('Select the actual two-node source path');b.goalTimer=b.repath=b.bombCd=1000;const serial=a.s3JumpSerial||0;g._frame(1/60);if(a.grounded||a.vel.y<=0||(a.s3JumpSerial||0)!==serial+1)throw Error('Normal Actor must admit the original supported jump');
   a.intent.jump=false;nativeOrdinaryJumpInput(b,G);if(!a.intent.jump)throw Error('Matching admitted ascent must have active pending hold');
   if(['refill','retreat','defend'].includes(change))b.mode=change;
   if(change==='target')b.target=G.actors.find(v=>v.team!==a.team);
   if(change==='reset')b.reset();
   if(change==='death-respawn')a.splat(null,'weapon');
   if(change==='world'){g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',mode:'turf',difficulty:'normal'});}
   if(change==='match'){g.menus.wipe.cancel();await g.startMatch({mapId:'wahoo',mode:'zones',difficulty:'normal'});}
   if(change==='nav')G.nav=new NavGraph(G.level,G.physics);
   if(change==='squid'){b.update=()=>{};a.intent.squid=true;a.intent.jump=false;a.intent.fire=false;a.intent.sub=false;for(let i=0;i<18&&a.form!=='squid';i++)g._frame(1/60);if(a.form!=='squid')throw Error('Actual Actor must own squid transform');}
   a.intent.jump=false;const before={p:a.pos.toArray(),v:a.vel.toArray(),serial:a.s3JumpSerial};nativeOrdinaryJumpInput(b,G);const after={p:a.pos.toArray(),v:a.vel.toArray(),serial:a.s3JumpSerial};if(a.intent.jump||JSON.stringify(before)!==JSON.stringify(after))throw Error('Stale jump owner survived '+change);
   let respawn=null;if(change==='death-respawn'){let ticks=0;while(!a.alive&&ticks<900){g._frame(1/60);ticks++;}if(!a.alive)throw Error('Normal real Match death timer did not respawn');a.intent.jump=false;nativeOrdinaryJumpInput(b,G);if(a.intent.jump)throw Error('Old owner retained input after natural respawn');respawn={ticks,alive:a.alive,sourcePad:G.level.spawnPads[a.team].toArray(),position:a.pos.toArray(),initialSquidSpawn:!!a.s3?.squidSpawn};}
   return {change,cancelled:true,pendingHeldBeforeChange:true,helperPreservedPoseVelocitySerial:true,serialDelta:before.serial-serial,respawn,actors:G.actors.length,bots:G.actors.filter(v=>v.bot).length};
  },change);result.cases.push(row);assert.equal(row.actors,8);assert.equal(row.bots,7);console.log(JSON.stringify(row));
 }
 await page.evaluate(async()=>{const G=NG,g=G.game;g.menus.wipe.cancel();await g.startMatch({mapId:'wahoo',mode:'tower',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();g.menus.show(null);for(const a of G.actors)if(a!==G.local)a.spawnAt(G.level.spawnPads[a.team],0);const a=G.local,t=G.match.ranked.stage.tower,p=t.boarding.approaches[t.centerIndex];a.spawnAt(new a.pos.constructor(...p.start),0);for(let i=0;i<15;i++)g._frame(1/60);if(!a.grounded||a.ground.block===G.match.rankedWorld.towerBlockId)throw Error('Tower control starts on original floor');g.rig.yaw=Math.atan2(p.end[0]-a.pos.x,p.end[2]-a.pos.z);g.rig.pitch=0;globalThis.towerApproach=p;});
 await page.keyboard.down('w');if(await page.evaluate(()=>towerApproach.jumping))await page.keyboard.down('Space');let rider=null,walking=true;
 for(let i=0;i<90;i++){rider=await page.evaluate(async()=>{const G=NG,a=G.local,{nativeTowerRider}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));G.game._frame(1/60);const p=towerApproach,dx=p.end[0]-p.start[0],dz=p.end[2]-p.start[2],length=Math.hypot(dx,dz);return {rider:nativeTowerRider(G,a),reached:((a.pos.x-p.start[0])*dx+(a.pos.z-p.start[2])*dz)/length>=length-.15};});if(rider.rider)break;if(walking&&rider.reached){await page.keyboard.up('w');walking=false;}}
 await page.keyboard.up('w');await page.keyboard.up('Space');assert(rider.rider,'genuine input must board the live current-world Tower');
 result.tower=await page.evaluate(async()=>{const G=NG,a=G.local,{BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{nativeOrdinaryJumpInput,nativeTowerRider}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),b=new BotBrain(a,'normal');a.intent.jump=false;const before={p:a.pos.toArray(),v:a.vel.toArray(),serial:a.s3JumpSerial};nativeOrdinaryJumpInput(b,G);const after={p:a.pos.toArray(),v:a.vel.toArray(),serial:a.s3JumpSerial};return {actualRider:nativeTowerRider(G,a),grounded:a.grounded,groundBlock:a.ground.block,towerBlock:G.match.rankedWorld.towerBlockId,inputReleased:!a.intent.jump,helperPreservedPoseVelocitySerial:JSON.stringify(before)===JSON.stringify(after)};});assert(Object.values(result.tower).filter(v=>typeof v==='boolean').every(Boolean));
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(out,'jump-lifecycle.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
