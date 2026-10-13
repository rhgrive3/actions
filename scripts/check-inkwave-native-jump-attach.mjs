#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-jump-attach');
fs.mkdirSync(evidence,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),owners={};
for(const file of ['native-stages/adapter.mjs','native-stages/runtime/native-jump-attach.mjs','native-stages/runtime/native-climb.mjs','native-stages/runtime/native-drop.mjs','native-stages/runtime/native-nav.mjs']){
 const sha=crypto.createHash('sha256').update(fs.readFileSync(new URL('../patches/'+file,import.meta.url))).digest('hex');assert.equal(build.files[file],sha,'sealed runtime owner '+file);owners[file]=sha;
}
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const mode of (process.env.NATIVE_JUMP_ATTACH_MODES||'turf,zones,tower,rainmaker,clams').split(',')){
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));if(m.text().startsWith('native-jump '))console.log(m.text());});
  await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
  await page.evaluate(async mode=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'shipshape',mode,difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},mode);
  const report=await page.evaluate(async mode=>{
   const G=NG,L=G.level,N=G.nav,V=G.local.pos.constructor,vec=p=>new V(...p),cases=[],controls=[];
   const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI)),{STEP}=await import(new URL('patches/splatoon3/runtime/clock.mjs',document.baseURI));
   const {nativeDropClearance,nativeClimbTransition,nativeSourceFootSupported}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),sweep=nativeDropClearance(L);
   if(!G.match.playing()||!L.manifest.sourceNavigation?.wallJumpAttach)throw Error('Sealed original stage or actual playing state is absent');
   if(mode!=='turf'&&G.match.ranked?.mode!==mode)throw Error('Actual ranked wrapper is absent');
   console.log('native-jump '+JSON.stringify({kind:'compiled-navigation',mode,nodes:N.nodes.length,validNodes:N.validIds.length,metrics:G.game.nativeWorld.metrics}));
   const digest=async()=>{const result={};for(const key of ['triangles','flags','triangleFace','mask'])result[key]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',L.data[key].buffer)),v=>v.toString(16).padStart(2,'0')).join('');return result;},before=await digest();
   const find=p=>N.nodes.find(n=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<1e-5);
   const setupOthers=actor=>{for(const other of G.actors){if(other===actor)continue;const point=L.spawnPads[other.team].clone().add(new V((other.slot-1.5)*1.3,0,other.team?-1.5:1.5)),hit=G.physics.raycast(point.clone().setY(point.y+.1),new V(0,-1,0),.3);if(!hit.hit||hit.face<0||!G.physics.bodyFits(point,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003))throw Error('Other actors lack genuine supported source setup');other.spawnAt(point,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;if(other.bot)other.bot.update=()=>{other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;};}};
   for(const sign of [-1,1]){
    const lower=find([sign*26.5,1.5,sign*39]),upper=find([sign*25.5,6.050000190734863,sign*39]),edge=lower?.nb.find(e=>e.to===upper?.id&&e.climb?.kind==='jump-attach');
    if(!edge||nativeClimbTransition(N,lower,upper)!==null)throw Error('Original contour admission or unchanged straight-climb guard failed');
    for(const hz of [30,60,120]){
     G.paint.clear();G.projectiles.clear();const actor=G.actors.find(a=>a.team===(sign<0?0:1)&&a.bot);actor.setWeapon('shooter');setupOthers(actor);actor.spawnAt(new V(lower.x,lower.y,lower.z),actor.team?Math.PI:0);actor.bot=new BotBrain(actor,'normal');const brain=actor.bot,goal=new V(upper.x,upper.y,upper.z);if(!brain._pathTo(goal,.6))throw Error('Ordinary source BotBrain path is absent');brain.goalTimer=brain.repath=brain.bombCd=1000;
     const update=actor.update,jumpSerialBefore=actor.s3JumpSerial||0;let ticks=0,handled=0,fire=false,swim=false,climbed=false,completed=false;
     actor.update=function(dt){if(Math.abs(dt-STEP)>1e-10)throw Error('Actual gameplay step changed');const previous=this.pos.clone(),active=brain._nativeJumpAttach;fire ||=this.intent.fire;swim ||=this.intent.squid;handled+=!!brain._nativeTraversalHandled;const result=update.call(this,dt);completed ||=!!active&&!brain._nativeJumpAttach;const squid=this.form==='squid',radius=(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;if(!sweep.clear(previous,this.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid))throw Error('Actual original capsule sweep failed '+JSON.stringify({mode,sign,hz,ticks,from:previous.toArray(),to:this.pos.toArray(),form:this.form,phase:brain._nativeJumpAttach?.phase}));climbed ||=this.climbing;ticks++;return result;};
     let seconds=0;const times=[];
     try{for(let frame=0;frame<hz*20;frame++){const t=performance.now(),active=brain._nativeJumpAttach;G.game._frame(1/hz);times.push(performance.now()-t);seconds=(frame+1)/hz;completed ||=!!active&&!brain._nativeJumpAttach;if(completed&&actor.grounded&&actor.pos.distanceTo(goal)<.45&&nativeSourceFootSupported(G,actor,upper))break;}}finally{actor.update=update;}
     const owned=edge.climb.samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===actor.team+1).length;
     const normalJumps=(actor.s3JumpSerial||0)-jumpSerialBefore;
     if(!(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<.45&&nativeSourceFootSupported(G,actor,upper)&&fire&&swim&&climbed&&completed&&handled&&owned===edge.climb.samples.length&&normalJumps===1&&!Object.keys(actor.s3.abilityPoints).length))throw Error('Actual fixed-clock source attachment failed '+JSON.stringify({mode,sign,hz,ticks,seconds,fire,swim,climbed,completed,handled,owned,samples:edge.climb.samples.length,jumpSerialBefore,jumpSerial:actor.s3JumpSerial,normalJumps,end:actor.pos.toArray(),goal:goal.toArray(),phase:brain._nativeJumpAttach?.phase,pi:brain.pi,grounded:actor.grounded}));
     times.sort((a,b)=>a-b);cases.push({sign,renderHz:hz,simulationStep:STEP,seconds,ticks,fire,swim,climbed,handlerCompleted:true,handledFrames:handled,owned,samples:edge.climb.samples.length,jumpSerialBefore,jumpSerial:actor.s3JumpSerial,normalJumps,end:actor.pos.toArray(),sourceSupport:true,continuousSourceCapsules:true,cpuFrame:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}});console.log('native-jump '+JSON.stringify({mode,...cases.at(-1)}));
     if(mode==='turf'){
      setupOthers(actor);actor.spawnAt(vec(edge.climb.jumpFrom),actor.team?Math.PI:0);const serialBefore=actor.s3JumpSerial||0;actor.bot.update=()=>{actor.intent.move.fromArray(edge.climb.normal).negate();actor.intent.squid=true;actor.intent.fire=actor.intent.jump=actor.intent.sub=actor.intent.special=false;};let maximumY=actor.pos.y;for(let i=0;i<hz*3;i++){G.game._frame(1/hz);maximumY=Math.max(maximumY,actor.pos.y);}const jumps=(actor.s3JumpSerial||0)-serialBefore;if(!actor.alive||!actor.grounded||maximumY>=upper.y-1||jumps!==0)throw Error('Actual owned source no-jump control failed '+JSON.stringify({sign,hz,maximumY,serialBefore,serial:actor.s3JumpSerial,jumps,alive:actor.alive,grounded:actor.grounded,end:actor.pos.toArray()}));controls.push({sign,renderHz:hz,seconds:3,maximumY,jumpSerialBefore:serialBefore,jumpSerial:actor.s3JumpSerial,normalJumps:0,alive:true,grounded:true});
     }
    }
   }
   if(JSON.stringify(await digest())!==JSON.stringify(before))throw Error('Original source buffers changed');G.paint.flush(STEP);G.game._skipRender=false;G.renderer.render(G.scene,G.camera);
   return {mode,id:L.layout.id,sourceSha256:L.manifest.sourceSha256,version1130Verified:false,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,alive:G.actors.filter(a=>a.alive).length,cases,controls,sourceBuffers:before,sourceBuffersUnchanged:true,navMetrics:G.game.nativeWorld.metrics,weapon:'shooter / Shooter_Normal_00',gearAP:0,conditions:'Sealed source opt-in; production Game._frame with installed fixed STEP, Match, ranked input wrapper, Actor, BotBrain, WeaponRunner and Projectiles; other seven actors retained on genuine own-bank supports; ordinary inputs only after source-supported setup; no paint/pose/velocity/jump-serial writes; SwiftShader, hardware FPS unverified'};
  },mode);
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.bots,7);assert.equal(report.alive,8);assert.equal(report.cases.length,6);report.errors=errors;report.buildFingerprint=build.contentHash;report.moduleOwners=owners;reports.push(report);fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));await page.screenshot({path:path.join(evidence,'shipshape-'+mode+'.png'),timeout:30000});await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
