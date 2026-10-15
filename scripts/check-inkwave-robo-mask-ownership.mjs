#!/usr/bin/env node
// Source-derived partial-cell shots and ordinary own/enemy wall ink. Private assets only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {SOURCE_RECIPE} from '../patches/native-stages/runtime/source-catalog.mjs';

function selectPartialWall(G,old,PLAYER) {
 const V=G.local.pos.constructor,L=G.level,P=G.physics,N=G.nav,radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 if(old.length!==L.mask.length)throw Error('Historical source mask size differs');
 for(const face of L.faces){
  if(!face.wall||face.nativeEmpty||Math.abs(face.n.y)>.2||face.sv<1.5)continue;
  for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++){
   const k=face.grid+j*face.nu+i,centerUV=[(i+.5)*face.cu,(j+.5)*face.cv];
   if(old[k]||!L.mask[k]||L.containsFaceUV(face,...centerUV))continue;
   for(const du of [.1,.3,.7,.9])for(const dv of [.1,.3,.7,.9]){
    const u=(i+du)*face.cu,v=(j+dv)*face.cv;if(!L.containsFaceUV(face,u,v))continue;
    const target=face.origin.clone().addScaledVector(face.u,u).addScaledVector(face.v,v),normal=new V(face.n.x,0,face.n.z).normalize();
    for(const distance of [3,4,5]){
     const stance=target.clone().addScaledVector(normal,distance),floor=P.raycast(stance.clone().add(new V(0,2,0)),new V(0,-1,0),5);
     if(!floor.hit||floor.normal.y<.68||floor.face<0||target.y-floor.point.y<.5||target.y-floor.point.y>2)continue;
     stance.y=floor.point.y;if(!P.bodyFits(stance,radius,PLAYER.stepUp,PLAYER.height,false,.01))continue;
     const eye=stance.clone().add(new V(0,1.05,0)),aim=target.clone().sub(eye),hit=P.raycast(eye,aim.clone().normalize(),aim.length()+.1);
     if(!hit.hit||hit.face!==face.id||hit.point.distanceTo(target)>.001)continue;
     const node=N.nearest(stance,1.2),routes=N.nativeSpawnNodeIds.map((seed,team)=>N.path(seed,node,team,50000)?.length||0);
     if(!routes.every(x=>x>0))continue;
     return {stance,target,face:face.id,triangle:hit.triangle,u:hit.u,v:hit.v,centerUV,k,sourceObject:L.manifest.objects[face.object].name,routes};
    }
   }
  }
 }
 throw Error('No original supported partial-cell shot from both banks');
}

function selectClimbWall(G,PLAYER) {
 const L=G.level,P=G.physics,V=G.local.pos.constructor,radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 for(const node of G.nav.validIds.map(id=>G.nav.nodes[id])){
  if(node.zone>=0||!node.nativePaintable||node.y>9)continue;
  for(let k=0;k<8;k++){
   const direction=new V(Math.sin(k*Math.PI/4),0,Math.cos(k*Math.PI/4)),stance=new V(node.x,node.y,node.z),hit=P.raycast(stance.clone().add(new V(0,1.05,0)),direction,7);
   if(!hit.hit||hit.face<0||hit.dist<3||Math.abs(hit.normal.y)>.2)continue;
   const face=L.faces[hit.face];if(!face.wall||face.nativeEmpty||face.sv<2||face.bounds[1][1]-hit.point.y<.75)continue;
   const floor=P.raycast(stance.clone().add(new V(0,.15,0)),new V(0,-1,0),.3);
   if(!floor.hit||floor.normal.y<.68||!P.bodyFits(stance,radius,PLAYER.stepUp,PLAYER.height,false,.01))continue;
   const tangent=new V(hit.normal.z,0,-hit.normal.x);
   for(const side of [1,-1]){
    const enemyStance=stance.clone().addScaledVector(tangent,side*1.6),h=P.raycast(enemyStance.clone().add(new V(0,.5,0)),new V(0,-1,0),1);
    if(!h.hit||h.normal.y<.68)continue;enemyStance.y=h.point.y;
    if(!P.bodyFits(enemyStance,radius,PLAYER.stepUp,PLAYER.height,false,.01))continue;
    return {stance,target:hit.point.clone(),direction,normal:hit.normal.clone(),tangent,enemyStance,side,sourceObject:L.manifest.objects[face.object].name,face:hit.face};
   }
  }
 }
 throw Error('No original supported tall wall and opposing shooter stance');
}

const site=path.resolve(process.argv[2]||'_site-native-robo-final'),out=path.resolve(process.argv[3]||'.browser-evidence/robo-mask-ownership'),oldMask=path.resolve(process.env.ROBO_PRE_V4_MASK||'.ci-scratch/robo-pre-v4-mask.bin');
fs.mkdirSync(out,{recursive:true});const oldBytes=fs.readFileSync(oldMask),build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),sourceCatalogHash=crypto.createHash('sha256').update(fs.readFileSync(new URL('../patches/native-stages/runtime/source-catalog.mjs',import.meta.url))).digest('hex');
assert.equal(build.files['native-stages/runtime/source-catalog.mjs'],sourceCatalogHash);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/__robo-mask-v3.bin'){res.writeHead(200,{'content-type':'application/octet-stream'});res.end(oldBytes);return;}const file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:960,height:640}}),errors=[],result={status:'running',revision:build.build.revision,contentHash:build.contentHash,sourceRecipe:SOURCE_RECIPE,oldMaskSha256:crypto.createHash('sha256').update(oldBytes).digest('hex'),sourceCatalogSha256:sourceCatalogHash,errors};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.addInitScript(()=>{Math.random=()=>.5;localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=robo',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(async()=>{const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();await g.startMatch({mapId:'robo',mode:'turf',duration:180,difficulty:'normal'});for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();});
 await page.evaluate('globalThis.selectPartialWall='+selectPartialWall.toString());await page.evaluate('globalThis.selectClimbWall='+selectClimbWall.toString());
 result.proof=await page.evaluate(async()=>{
  const G=NG,g=G.game,a=G.local,{PLAYER}=await import(new URL('src/config.js',document.baseURI)),old=new Uint8Array(await(await fetch('/__robo-mask-v3.bin')).arrayBuffer()),probe=selectPartialWall(G,old,PLAYER),cases=[],V=a.pos.constructor;
  a.setWeapon('shooter');const world=G.projectiles.inkFlight.world,splat=G.paint.splat,configure=G.projectiles.inkFlight.configure,controller=G.match.controller,controllerUpdate=controller.update,computeAim=controller.computeAim,actorUpdate=a.update,trace=[],naturalPaint=[],actorDt=[];let fire=false,admitted=0;
  const aim=probe.target.clone().sub(probe.stance.clone().add(new V(0,1.05,0))),yaw=Math.atan2(aim.x,aim.z),pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z));
  controller.update=()=>{a.intent.move.set(0,0,0);a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=fire;a.aimPoint.copy(probe.target);a.aimYaw=a.intent.aimYaw=yaw;a.aimPitch=a.intent.aimPitch=pitch;};controller.computeAim=()=>{};
  a.update=function(dt){actorDt.push(dt);return actorUpdate.call(this,dt);};
  G.projectiles.inkFlight.configure=function(...args){const ok=configure.apply(this,args);if(ok&&args[0].owner===a)admitted++;return ok;};
  G.projectiles.inkFlight.world=function(...args){const h=world.apply(this,args);if(h.hit){const f=G.level.faces[h.face],u=f?h.point.clone().sub(f.origin).dot(f.u):0,v=f?h.point.clone().sub(f.origin).dot(f.v):0,i=f?Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))):0,j=f?Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv))):0,centerUV=f?[(i+.5)*f.cu,(j+.5)*f.cv]:[0,0],k=f?f.grid+j*f.nu+i:-1;trace.push({face:h.face,triangle:h.triangle,point:h.point.toArray(),u,v,centerUV,k,inside:!!f&&G.level.containsFaceUV(f,u,v),centerInside:!!f&&G.level.containsFaceUV(f,...centerUV),distanceToTarget:h.point.distanceTo(probe.target),oldMask:k>=0?old[k]:null,newMask:k>=0?G.level.mask[k]:null});}return h;};
  G.paint.splat=function(...args){if(args[0].distanceTo(probe.target)<2)naturalPaint.push({face:args[3]?.face,kind:args[3]?.kind,team:args[2]});return splat.apply(this,args);};
  try{for(const hz of [30,60,120]){
   G.projectiles.clear();G.paint.clear();trace.length=naturalPaint.length=actorDt.length=0;admitted=0;g.s3Clock.reset();a.spawnAt(probe.stance,yaw);a.aimPoint.copy(probe.target);a.aimYaw=yaw;a.aimPitch=pitch;fire=true;
   for(let i=0;i<hz&&!admitted;i++)g._frame(1/hz);fire=false;if(admitted!==1)throw Error('Partial-cell trigger did not admit exactly one actual shot');
   for(let i=0;i<hz;i++)g._frame(1/hz);
   const contact=trace.find(h=>h.face===probe.face&&h.distanceToTarget<2&&h.inside&&!h.centerInside&&h.oldMask===0&&h.newMask===1);
   if(!contact||contact!==trace[0])throw Error('No first-source partial-cell weapon impact '+JSON.stringify({hz,trace,naturalPaint,stance:a.pos.toArray(),aim:a.aimDir.toArray()}));
   const owned=G.paint.sample(contact.face,contact.u,contact.v),outside=G.paint.sample(contact.face,...contact.centerUV),cellOwner=G.paint.grid[contact.k];
   if(owned!==a.team+1||outside!==0||cellOwner!==a.team+1||!naturalPaint.length||!a.alive||!a.grounded||actorDt.some(dt=>dt!==1/60))throw Error('Source partial-cell membership/actual Actor clock failed');
   cases.push({renderHz:hz,simulationStep:1/60,actorTicks:actorDt.length,admitted,owned,cellOwner,sameCellOutside:outside,sourceContacts:structuredClone(trace),naturalPaint:structuredClone(naturalPaint),sourceApproachWaypoints:probe.routes,alive:a.alive,grounded:a.grounded});
  }}finally{controller.update=controllerUpdate;controller.computeAim=computeAim;a.update=actorUpdate;G.projectiles.inkFlight.world=world;G.projectiles.inkFlight.configure=configure;G.paint.splat=splat;}
  const dead=G.paint.dead.findIndex(v=>v===1);if(dead<0||G.paint.grid[dead]!==0)throw Error('Actual uncovered source hole claimed');
  let np=null;for(let id=0;id<G.level.triangleWorld.flags.length;id++){const flags=G.level.triangleWorld.flags[id],name=G.level.manifest.objects[G.level.triangleWorld.objectIds[id]].name;if(!(flags&1)||(flags&2)||!/^Fld_Cross00_GeneralCube_.*GeneralBoxNoPaint_/.test(name))continue;const t=G.level.triangleWorld.triangle(id),n=new V().fromArray(G.level.triangleWorld.normals,id*3),h=G.physics.raycast(t.getMidpoint(new V()).addScaledVector(n,.1),n.clone().negate(),.2);if(h.hit&&h.triangle>=0&&!(G.level.triangleWorld.flags[h.triangle]&2)&&h.face===-1&&/^Fld_Cross00_GeneralCube_.*GeneralBoxNoPaint_/.test(G.level.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]].name)){np=h;break;}}
  if(!np||G.paint.sample(np.face,np.u,np.v)!==0)throw Error('Original NoPaint actual contact claimed');
  const negative={uncoveredCell:dead,uncoveredOwnership:G.paint.grid[dead],noPaintTriangle:np.triangle,noPaintFace:np.face,noPaintOwnership:0,noPaintObject:G.level.manifest.objects[G.level.triangleWorld.objectIds[np.triangle]].name};
  const wall=selectClimbWall(G,PLAYER),receiver=G.actors.find(o=>o.team===0&&o.bot),enemy=G.actors.find(o=>o.team===1&&o.bot),direction=wall.direction,normal=wall.normal,hz=60;
  G.paint.clear();G.projectiles.clear();receiver.setWeapon('shooter');enemy.setWeapon('shooter');receiver.spawnAt(wall.stance,Math.atan2(direction.x,direction.z));enemy.spawnAt(wall.enemyStance,0);
  const setAim=(actor,target)=>{const d=target.clone().sub(actor.pos.clone().add(new V(0,1.05,0)));actor.aimPoint.copy(target);actor.aimYaw=actor.intent.aimYaw=Math.atan2(d.x,d.z);actor.aimPitch=actor.intent.aimPitch=Math.atan2(d.y,Math.hypot(d.x,d.z));};
  setAim(receiver,wall.target);receiver.intent.move.set(0,0,0);receiver.intent.fire=true;receiver.intent.squid=receiver.intent.jump=receiver.intent.sub=receiver.intent.special=false;let ownAdmitted=0,ownNaturalSplats=0,attached=false,upward=false,ownWall=null;
  const splatOwn=G.paint.splat;G.paint.splat=function(...args){if(args[2]===receiver.team&&args[0].distanceTo(wall.target)<3)ownNaturalSplats++;return splatOwn.apply(this,args);};
  try{for(let i=0;i<hz*1.5;i++){G.time+=1/hz;const n=G.projectiles.list.length;receiver.update(1/hz);ownAdmitted+=Math.max(0,G.projectiles.list.length-n);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
   receiver.intent.fire=false;receiver.intent.squid=true;receiver.intent.move.copy(direction);
   for(let i=0;i<hz*5;i++){G.time+=1/hz;receiver.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);if(receiver.climbing){attached=true;upward=receiver.vel.y>0;ownWall=G.physics.raycast(receiver.pos.clone().add(new V(0,.3,0)),direction,PLAYER.radius+.35);break;}}
  }finally{G.paint.splat=splatOwn;}
  if(!attached||!ownAdmitted||!ownNaturalSplats||!ownWall?.hit||ownWall.face<0||G.paint.sample(ownWall.face,ownWall.u,ownWall.v)!==receiver.team+1)throw Error('Actual own Shooter did not paint/attach source wall '+JSON.stringify({attached,ownAdmitted,ownNaturalSplats,feet:receiver.pos.toArray(),wall:wall.sourceObject}));
  const enemyTarget=G.physics.raycast(ownWall.point.clone().addScaledVector(wall.tangent,wall.side*1.2).addScaledVector(normal,1),direction,1.3);
  if(!enemyTarget.hit||enemyTarget.face<0)throw Error('No adjacent source target avoiding receiver capsule');
  setAim(enemy,enemyTarget.point);enemy.intent.move.set(0,0,0);enemy.intent.squid=enemy.intent.jump=enemy.intent.sub=enemy.intent.special=false;enemy.intent.fire=true;receiver.intent.move.set(0,0,0);receiver.intent.squid=true;receiver.intent.fire=receiver.intent.jump=receiver.intent.sub=receiver.intent.special=false;G.projectiles.clear();
  let enemyAdmitted=0,enemyNaturalSplats=0,released=false,enemyOwnedAtRelease=false;const releaseTrace=[],enemyImpacts=[],enemyWorld=G.projectiles.inkFlight.world,enemySplat=G.paint.splat;
  G.projectiles.inkFlight.world=function(...args){const h=enemyWorld.apply(this,args);if(h.hit)enemyImpacts.push({face:h.face,triangle:h.triangle,point:h.point.toArray()});return h;};G.paint.splat=function(...args){if(args[2]===enemy.team)enemyNaturalSplats++;return enemySplat.apply(this,args);};
  try{for(let i=0;i<hz*3;i++){G.time+=1/hz;if(!enemyAdmitted){enemy.update(1/hz);enemyAdmitted=G.projectiles.list.filter(p=>p.owner===enemy).length;if(enemyAdmitted)enemy.intent.fire=false;}G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);const h=G.physics.raycast(receiver.pos.clone().add(new V(0,.3,0)),direction,PLAYER.radius+.35),owner=h.hit&&h.face>=0?G.paint.sample(h.face,h.u,h.v):0,was=receiver.climbing;receiver.update(1/hz);releaseTrace.push({frame:i,owner,wasClimbing:was,climbing:receiver.climbing,position:receiver.pos.toArray(),alive:receiver.alive,wallFace:h.face,wallTriangle:h.triangle});if(was&&!receiver.climbing){released=true;enemyOwnedAtRelease=owner===enemy.team+1;break;}}}finally{G.projectiles.inkFlight.world=enemyWorld;G.paint.splat=enemySplat;}
  if(!enemyAdmitted||!enemyNaturalSplats||!released||!enemyOwnedAtRelease||!receiver.alive)throw Error('Genuine enemy Shooter source release failed '+JSON.stringify({enemyAdmitted,enemyNaturalSplats,enemyImpacts,released,enemyOwnedAtRelease,releaseTrace}));
  G.paint.flush(1/60);g._skipRender=false;G.renderer.render(G.scene,G.camera);
  return {conditions:'Partial source shots: controlled input/aim, actual Game._frame fixed STEP1/60 at three render cadences. Wall ownership/release: ordinary Actor/Character/WeaponRunner/Projectiles raw 1/60 single interaction. Actual eight-alive/seven-bot Match; zero-AP Shooter; initial source-supported setups only, then intent inputs without pose/velocity/ink writes. SwiftShader, no retail or hardware FPS claim.',sourceSha256:G.level.manifest.sourceSha256,actors:G.actors.length,aliveActors:G.actors.filter(o=>o.alive).length,bots:G.actors.filter(o=>o.bot).length,abilityPoints:a.s3.abilityPoints,weapon:a.weaponId,sourceWeapon:a.weapon.sourceMainActor,productionCharacter:!!a.character?.root?.isObject3D,partialWall:{stance:probe.stance.toArray(),target:probe.target.toArray(),face:probe.face,triangle:probe.triangle,cell:probe.k,sourceObject:probe.sourceObject},cases,negative,enemyRelease:{hz,ownAdmitted,ownNaturalSplats,attached,upward,sourceObject:wall.sourceObject,receiverWeapon:receiver.weaponId,enemyWeapon:enemy.weaponId,receiverAbilityPoints:receiver.s3.abilityPoints,enemyAbilityPoints:enemy.s3.abilityPoints,enemyAdmitted,enemyNaturalSplats,enemyImpacts,released,enemyOwnedAtRelease,trace:releaseTrace}};
 });
 assert.equal(errors.length,0);assert.equal(result.proof.actors,8);assert.equal(result.proof.aliveActors,8);assert.equal(result.proof.bots,7);assert.deepEqual(result.proof.abilityPoints,{});assert.deepEqual(result.proof.enemyRelease.receiverAbilityPoints,{});assert.deepEqual(result.proof.enemyRelease.enemyAbilityPoints,{});assert.equal(result.proof.productionCharacter,true);assert.equal(result.proof.enemyRelease.upward,true,'Natural own-wall paint grants actual upward swim motion');result.status='passed';await page.screenshot({path:path.join(out,'robo-ownership.png'),timeout:60000});console.log(JSON.stringify(result.proof));
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{fs.writeFileSync(path.join(out,'ownership.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
