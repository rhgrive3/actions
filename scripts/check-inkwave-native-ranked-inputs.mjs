#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import crypto from 'node:crypto';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-climbs');fs.mkdirSync(evidence,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')),rankedModuleSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('../patches/splatoon3/runtime/ranked/bots.mjs',import.meta.url))).digest('hex');assert.equal(build.files['splatoon3/runtime/ranked/bots.mjs'],rankedModuleSha256);
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const mode of (process.env.NATIVE_CLIMB_MODES||'turf,zones,tower,rainmaker,clams').split(','))for(const id of (process.env.NATIVE_STAGE_IDS||'flounder').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('console',m=>{if(m.text().startsWith('native-climb '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
  await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async ({id,mode})=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode,difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},{id,mode});
  const report=await page.evaluate(async()=>{
   const G=NG,N=G.nav,L=G.level,V=G.local.pos.constructor,vec=(p)=>new V(...p),cases=[],banks=[];
   if(!L.manifest.sourceNavigation?.wallClimb)throw Error('Source wall navigation is not opted in');
   const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI));
   for(const actor of G.actors){actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;}
   if(G.match.mode!=='turf'&&(!G.match.playing()||G.match.ranked.mode!==G.match.mode))throw Error('The actual ranked wrapper must be active');
   const random=Math.random;Math.random=()=>.5;
   try{for(let team=0;team<2;team++){
    const actor=G.actors.find(a=>a.team===team&&a.bot),center=N.nearest(new V(0,12,0),1.2),route=N.path(N.nearest(L.spawnPads[team],1.2),center,team,50000);
    if(!route)throw Error('No opposing pad to central source route');
    const at=route.slice(1).findIndex((to,i)=>N.edgeType(route[i],to)==='climb'),edge=N.nodes[route[at]].nb.find(e=>e.to===route[at+1]),climb=edge.climb;
    for(const other of G.actors){if(other===actor)continue;const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);if(!h.hit||h.face<0||Math.abs(h.point.y-p.y)>.15)throw Error('Other actors require their original supported team pads');other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=false;}
    actor.setWeapon('shooter');
    for(const hz of [30,60,120]){
     G.projectiles.clear();G.paint.clear();actor.spawnAt(vec(climb.lower),team?Math.PI:0);actor.invuln=0;actor.bot=new BotBrain(actor,'normal');const brain=actor.bot;
     if(!brain._pathTo(vec(climb.upper),.6))throw Error('Existing BotBrain rejected source upper support');brain.goalTimer=1000;brain.repath=1000;brain.bombCd=1000;
     let climbed=false,fire=false,swim=false,seconds=0,handledFrames=0;
     const times=[];for(let i=0;i<hz*8;i++){const t=performance.now();G.time+=1/hz;if(G.match.ranked)G.match.ranked.frame.actors=G.actors.map(a=>({id:String(a.nid??a.team+':'+a.slot),team:a.team,slot:a.slot,pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded}));brain.update(1/hz);handledFrames+=!!brain._nativeTraversalHandled;fire ||=actor.intent.fire;swim ||=actor.intent.squid;actor.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);times.push(performance.now()-t);climbed ||=actor.climbing;seconds=(i+1)/hz;if(climbed&&actor.grounded&&Math.abs(actor.pos.y-climb.upper[1])<.15)break;}
     const owned=climb.samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===team+1).length;
     if(!(fire&&swim&&climbed&&actor.grounded&&Math.abs(actor.pos.y-climb.upper[1])<.15&&owned===climb.samples.length&&handledFrames>0))throw Error('Source bot climb failed '+JSON.stringify({team,hz,fire,swim,climbed,grounded:actor.grounded,position:actor.pos.toArray(),owned,samples:climb.samples.length}));
     times.sort((a,b)=>a-b);cases.push({team,hz,seconds,handledFrames,fire,swim,climbed,grounded:true,ownedWallSamples:owned,sourceWallSamples:climb.samples.length,end:actor.pos.toArray(),cpuStep:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}});console.log('native-climb '+JSON.stringify(cases.at(-1)));
    }
    // Restore the tested bot to its actual own-bank setup before the other
    // team trial, so a prior opposing-bank endpoint cannot become a combat
    // target or body obstacle in the next isolated navigation trace.
    actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.bot.update=()=>{};actor.intent.move.set(0,0,0);actor.intent.fire=actor.intent.squid=actor.intent.jump=actor.intent.sub=actor.intent.special=false;
   }}finally{Math.random=random;}
   G.paint.flush(1/60);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);
   return {id:L.layout.id,sourceSha256:L.manifest.sourceSha256,version1130Verified:L.manifest.version1130Verified,actors:G.actors.length,alive:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>a.bot).length,weapon:'shooter / Shooter_Normal_00',gearAP:Object.keys(G.actors.find(a=>a.bot).s3.abilityPoints),cases,banks,conditions:'production Chromium Actor/BotBrain/WeaponRunner/Projectiles/fixed paint clock; eight actors retained; other bots frozen; source-supported setup poses; initial ownership cleared; goal reacquired after ordinary refill/recovery; 0.5 RNG; SwiftShader'};
  });
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.alive,8);assert.equal(report.bots,7);report.mode=mode;report.errors=errors;report.buildFingerprint=build.contentHash;report.rankedModuleSha256=rankedModuleSha256;report.proofScope='Physical source-climb input ownership through the installed ranked wrapper; controlled supported path, no whole objective/score/Tower boarding claim';reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,id+'-'+mode+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
