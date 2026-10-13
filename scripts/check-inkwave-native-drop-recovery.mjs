#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const site=path.resolve(process.argv[2]||'_site-native-drop-recovery');
const evidence=path.resolve(process.argv[3]||'.browser-evidence/drop-recovery');
fs.mkdirSync(evidence,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const moduleSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('../patches/native-stages/runtime/native-drop.mjs',import.meta.url))).digest('hex');
assert.equal(build.files['native-stages/runtime/native-drop.mjs'],moduleSha256,'current Drop owner must match the sealed build');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try{for(const id of (process.env.NATIVE_STAGE_IDS||'robo,shipshape').split(',')){
 const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,800));if(message.text().startsWith('drop-recovery '))console.log(message.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async id=>{const g=NG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<100;i++)g._frame(1/60);g.debug.freezeBots();},id);
 const report=await page.evaluate(async()=>{
  const G=NG,g=G.game,L=G.level,N=G.nav,V=G.local.pos.constructor;
  const {BotBrain}=await import(new URL('src/game/bots.js',document.baseURI));
  const {nativeDropClearance,nativeSourceFootSupported}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));
  if(!L.manifest.sourceNavigation?.highDrops||G.actors.length!==8||G.actors.filter(a=>a.bot).length!==7)throw Error('A real opted eight-actor/seven-bot native Match is required');
  const hash=async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const raw=async()=>Object.fromEntries(await Promise.all(['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'].map(async key=>[key,await hash(L.data[key].buffer)])));
  const before=await raw(),cases=[],team=L.layout.id==='robo'?1:0,from=N.nodes[L.layout.id==='robo'?2418:28642],edge=from?.nb.find(e=>e.drop&&e.drop.direction[2]*(L.layout.id==='robo'?1:-1)>.99);
  if(!edge||!N.valid[from.id]||!N.valid[edge.to])throw Error('Authentic original source Drop edge must be retained');
  const goal=new V(...edge.drop.landing),sweep=nativeDropClearance(L);
  for(const hz of [30,60,120]){
   g.debug.freezeBots();const a=G.actors.find(a=>a.team===team&&a.bot);
   for(const other of G.actors){
    if(other===a)continue;
    const p=L.spawnPads[other.team].clone(),angle=other.slot/4*Math.PI*2+.6;p.x+=Math.cos(angle)*.7;p.z+=Math.sin(angle)*.7;
    const h=G.physics.raycast(p.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
    if(!h.hit||h.face<0||Math.abs(h.point.y-p.y)>.15||!G.physics.bodyFits(p,.35,.35,1.45,false,.003))throw Error('Other real actors require original source-supported own-team pad setups');
    other.spawnAt(p,other.team?Math.PI:0);other.intent.move.set(0,0,0);other.intent.fire=other.intent.squid=other.intent.jump=other.intent.sub=other.intent.special=false;
   }
   G.paint.clear();G.projectiles.clear();a.setWeapon('shooter');a.spawnAt(new V(from.x,from.y,from.z+(L.layout.id==='robo'?-.8:0)),0);a.invuln=0;
   a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;
   if(L.layout.id==='shipshape')for(let i=0;i<hz;i++)g._frame(1/hz);
   if(!a.alive||!a.grounded)throw Error('Controlled departure must start naturally grounded');
   const plantedSetup=a.pos.toArray();
   if(L.layout.id==='shipshape'&&(!(Math.abs(a.pos.y-from.y)>.16)||!nativeSourceFootSupported(G,a,from)))throw Error('Authentic crane-slope higher foot support was not reproduced');
   const b=a.bot=new BotBrain(a,'normal');if(!b._pathTo(goal,.6))throw Error('Actual BotBrain rejects the original source goal');b.goalTimer=b.repath=b.bombCd=1000;
   const tickStart=g.s3Clock.ticks,intervals=new Set(),serial=a.s3JumpSerial||0;
   let activation=null,departure=null,touchdown=null,airborne=false,completed=false,recovered=false,actorTicks=0,capsules=0,microCapsules=0,body=null;
   const bodies=[],microIntervals=new Set();
   const timings=[],trace=[];
   const brainUpdate=b.update,actorUpdate=a.update,integrate=a._integrateMovementStep,collide=G.physics.collideBody;
   G.physics.collideBody=function(pos,radius,lift,height,...rest){if(pos===a.pos){body={radius,lift,height,skipGrates:!!rest[2]};if(!bodies.some(p=>p.radius===radius&&p.lift===lift&&p.height===height))bodies.push(body);}return collide.call(this,pos,radius,lift,height,...rest);};
   a._integrateMovementStep=function(dt,...args){const previous=this.pos.clone(),result=integrate.call(this,dt,...args);microIntervals.add(dt);if(body&&!sweep.clear(previous,this.pos,body.radius,body.lift,body.height,body.skipGrates))throw Error('Actual source movement micro-step capsule blocked '+JSON.stringify({id:L.layout.id,hz,previous:previous.toArray(),position:this.pos.toArray(),body}));microCapsules++;return result;};
   b.update=function(dt){
    const previous=this._nativeDrop,t=performance.now(),result=brainUpdate.call(this,dt);timings.push(performance.now()-t);
    if(this._nativeSurge||this._nativeClimb||this._nativeJumpAttach)throw Error('Isolated Drop recovery entered a different native transition');
    if(this._nativeDrop&&!activation)activation={position:a.pos.toArray(),velocity:a.vel.toArray(),phase:this._nativeDrop.phase};
    if(this._nativeDrop?.phase==='depart'&&!departure)departure={position:a.pos.toArray(),velocity:a.vel.toArray(),footSupported:nativeSourceFootSupported(G,a,from)};
    if(previous&&!this._nativeDrop&&airborne){
     completed=!!(a.grounded&&nativeSourceFootSupported(G,a,N.nodes[edge.to])&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<.35);
     recovered=!this.path&&!completed;
     trace.push({event:'owner-release',position:a.pos.toArray(),input:a.intent.move.toArray(),completed,recovered});
    }
    return result;
   };
   a.update=function(dt){
    if(Math.abs(dt-1/60)>1e-12)throw Error('Actual Actor must execute the installed fixed STEP');intervals.add(dt);actorTicks++;
    const previous=this.pos.clone();actorUpdate.call(this,dt);
    const c=body;if(!c)throw Error('The installed native terrain collider was not observed');
    if(!sweep.clear(previous,this.pos,c.radius,c.lift,c.height,this.form==='squid'))throw Error('Actual Drop recovery continuous source capsule blocked '+JSON.stringify({id:L.layout.id,hz,tick:actorTicks,previous:previous.toArray(),position:this.pos.toArray(),form:this.form,radius:c.radius,lift:c.lift,height:c.height}));capsules++;
    if(airborne&&this.grounded&&!touchdown){const h=G.physics.raycast(this.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);touchdown={position:this.pos.toArray(),velocity:this.vel.toArray(),groundTriangle:this.ground.triangle,centreSourceTriangle:h.hit?h.triangle:null,centreSourceHeight:h.hit?h.point.y:null,footSupportedGoal:nativeSourceFootSupported(G,this,N.nodes[edge.to])};}
    airborne ||=!this.grounded;
   };
   try{for(let i=0;i<hz*8;i++){g._frame(1/hz);if(i%Math.max(1,Math.floor(hz/4))===0)trace.push({ticks:g.s3Clock.ticks-tickStart,position:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,phase:b._nativeDrop?.phase||null,path:b.path?.length||0,pi:b.pi});if(completed||recovered)break;}}
   finally{b.update=brainUpdate;a.update=actorUpdate;a._integrateMovementStep=integrate;G.physics.collideBody=collide;}
   if(!(activation&&departure&&airborne&&touchdown&&completed&&a.alive&&a.grounded&&nativeSourceFootSupported(G,a,N.nodes[edge.to])))throw Error('Actual fixed-clock Drop recovery did not finish its genuine supported goal '+JSON.stringify({id:L.layout.id,hz,activation,departure,touchdown,completed,recovered,end:a.pos.toArray(),path:b.path,pi:b.pi,trace}));
   if(!departure.footSupported||Math.hypot(departure.velocity[0],departure.velocity[2])>=.65)throw Error('Departure was not planted through ordinary source-supported input');
   if((a.s3JumpSerial||0)!==serial||Object.keys(a.s3.abilityPoints).length)throw Error('Proof requires ordinary no-jump zero-AP Shooter');
   if(actorTicks!==g.s3Clock.ticks-tickStart||intervals.size!==1)throw Error('Game clock must own every selected Actor tick');
   timings.sort((x,y)=>x-y);cases.push({team,renderHz:hz,physicsHz:60,actorTicks,physicsIntervals:[...intervals],movementMicroIntervals:[...microIntervals],observedColliderProfiles:bodies,seconds:actorTicks/60,plantedSetup,upper:edge.drop.upper,upperNode:from.id,goal:goal.toArray(),goalNode:edge.to,activation,departure,touchdown,end:a.pos.toArray(),handlerCompleted:completed,normalReplanRecovery:recovered,continuousSourceCapsules:capsules,continuousMicroStepCapsules:microCapsules,ordinaryNoJump:true,gearAP:0,brainMilliseconds:{p50:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1)},trace});console.log('drop-recovery '+JSON.stringify(cases.at(-1)));
  }
  let unexpectedContactRecovery=null;
  if(L.layout.id==='robo'){
   // A controlled real grounded contact exercises safe recovery separately
   // from the incoming-velocity fall. No pose/input is written after setup.
   g.debug.freezeBots();const a=G.actors.find(a=>a.team===team&&a.bot);
   a.spawnAt(new V(13.5,0,-10.5),0);a.intent.move.set(0,0,0);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;
   for(let i=0;i<60;i++)g._frame(1/60);
   const hit=G.physics.raycast(a.pos.clone().add(new V(0,.1,0)),new V(0,-1,0),.3);
   if(!a.grounded||!hit.hit||hit.face!==-1||L.data.flags[hit.triangle]!==1||!nativeSourceFootSupported(G,a,N.nodes[edge.to]))throw Error('Controlled unexpected contact must be actual intact NoPaint with compatible static foot height');
   const start=a.pos.clone(),b=a.bot=new BotBrain(a,'normal');b.path=[from.id,edge.to];b.pi=1;b._nativeDrop={edge,path:b.path,phase:'depart',seconds:0,airborne:true,level:L,nav:N,match:G.match,mode:G.match.mode};
   let released=false,ordinaryGoal=null,samples=0;const sourceTriangle=hit.triangle,actorUpdate=a.update,brainUpdate=b.update,collide=G.physics.collideBody;let body=null;
   G.physics.collideBody=function(pos,radius,lift,height,...rest){if(pos===a.pos)body={radius,lift,height,skipGrates:!!rest[2]};return collide.call(this,pos,radius,lift,height,...rest);};
   b.update=function(dt){const owned=this._nativeDrop,result=brainUpdate.call(this,dt);if(owned&&!this._nativeDrop){released=!this.path&&this.repath===0&&this.goalTimer===0&&a.intent.move.lengthSq()===0;if(!released)throw Error('Unexpected NoPaint contact did not release through ordinary neutral input');}if(this.path&&!this._nativeDrop)ordinaryGoal=N.nodes[this.path.at(-1)].id;return result;};
   a.update=function(dt){const previous=this.pos.clone(),result=actorUpdate.call(this,dt);if(Math.abs(dt-1/60)>1e-12||!body||!sweep.clear(previous,this.pos,body.radius,body.lift,body.height,body.skipGrates))throw Error('Ordinary post-contact recovery lacks fixed-clock source capsule clearance '+JSON.stringify({tick:samples+1,released,ordinaryGoal,previous:previous.toArray(),position:this.pos.toArray(),form:this.form,body,grounded:this.grounded,pi:b.pi,path:b.path,mode:b.mode}));samples++;return result;};
   try{for(let i=0;i<360;i++){g._frame(1/60);const h=G.physics.raycast(a.pos.clone().add(new V(0,.25,0)),new V(0,-1,0),.6),node=N.nodes[N.nearest(a.pos,.6)];if(released&&ordinaryGoal!==null&&a.alive&&a.grounded&&h.hit&&h.face>=0&&node?.nativePaintable&&nativeSourceFootSupported(G,a,node)&&a.pos.distanceTo(start)>.3)break;}}finally{a.update=actorUpdate;b.update=brainUpdate;G.physics.collideBody=collide;}
   const endSource=G.physics.raycast(a.pos.clone().add(new V(0,.25,0)),new V(0,-1,0),.6);
   const finalNode=N.nodes[N.nearest(a.pos,.6)],sourceFoot=finalNode?.nativePaintable&&nativeSourceFootSupported(G,a,finalNode);
   if(!released||ordinaryGoal===null||!a.alive||!a.grounded||!endSource.hit||endSource.face<0||!sourceFoot||a.pos.distanceTo(start)<.3)throw Error('Real ordinary replan did not recover from the intact NoPaint contact '+JSON.stringify({released,ordinaryGoal,start:start.toArray(),end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,face:endSource.face,sourceFoot,mode:b.mode,path:b.path,pi:b.pi}));
   unexpectedContactRecovery={kind:'controlled actual grounded NoPaint contact, separate from incoming fall replay',sourceTriangle,start:start.toArray(),end:a.pos.toArray(),ordinaryStop:true,normalReplan:true,ordinaryGoal,finalSourceTriangle:endSource.triangle,finalSourceFace:endSource.face,finalSourceNode:finalNode.id,sourceFootSupported:true,alive:true,grounded:true,fixedActorSteps:samples,continuousSourceCapsules:samples,seconds:samples/60};console.log('drop-recovery '+JSON.stringify(unexpectedContactRecovery));
  }
  if(JSON.stringify(await raw())!==JSON.stringify(before))throw Error('An original source binary changed');
  G.paint.flush(1/60);g._skipRender=false;G.renderer.render(G.scene,G.camera);
  return {id:L.layout.id,sourceSha256:L.manifest.sourceSha256,sourceNavigation:L.manifest.sourceNavigation,actors:G.actors.length,alive:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>a.bot).length,sourceBuffers:before,sourceBuffersUnchanged:true,cases,unexpectedContactRecovery,otherNativeHandlersExecuted:false,conditions:'Actual native Turf Match/Game._frame at render30/60/120, installed fixed1/60 Actor/Brain/Projectiles; eight real actors/seven bots with controlled original source-supported own-team pad setups and a real source edge goal; ordinary incoming movement/braking/gravity, production Character, empty initial paint, zero-AP Shooter; no later pose/velocity/ink/source writes. Isolated edge completion, not whole-bank or ranked-objective qualification. Robo highDrops is private calibration only; Shipshape retains its owner definition. SwiftShader timings are software diagnostics.'};
 });
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.actors,8);assert.equal(report.alive,8);assert.equal(report.bots,7);report.errors=errors;report.buildFingerprint=build.contentHash;report.moduleSha256=moduleSha256;reports.push(report);fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));
 await page.screenshot({path:path.join(evidence,id+'.png'),timeout:60000,animations:'disabled'});await context.close();
}}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
