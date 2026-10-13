import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
test('production Manta actors paint and traverse both original source foredecks at the installed simulation step',{skip:!root},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,data=readStage(root,'manta');
 const raw=()=>Object.fromEntries(['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'].map(key=>[key,crypto.createHash('sha256').update(Buffer.from(data[key].buffer)).digest('hex')])),before=raw();
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new CpuPaint(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const N=G.nav=new f.NavGraph(L,P),sweep=f.nativeDropClearance(L);
 G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();f.setRandom(()=>.5);const cases=[];
 try{for(const team of [0,1]){
  G.paint=new CpuPaint(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const a=new f.Actor({team,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;G.actors=[a];
  assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  const id=N.nearest(new THREE.Vector3(team?-12:12,8,team?-30.102798461914062:30.897201538085938),.6),node=N.nodes[id],goal=new THREE.Vector3(node.x,node.y,node.z),brain=a.bot=new f.BotBrain(a,'normal');
  assert.ok(node.nativePaintable&&node.zone<0&&Math.abs(node.z)>29&&Math.abs(node.y-8)<.01);
  assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;
  const route=brain.path.slice(),edges=route.slice(1).map((to,i)=>N.nodes[route[i]].nb.find(e=>e.to===to));assert.ok(edges.some(e=>e.climb?.kind==='surge')&&edges.some(e=>e.drop));
  let fire=false,climbed=false,surged=false,replans=0,ticks=0,actorCapsules=0,movementCapsules=0,previous=null,profile=null;
  const collideBody=P.collideBody;
  P.collideBody=function(pos,radius,lift,height,contacts,horizontal,skipGrates,...rest){const result=collideBody.call(this,pos,radius,lift,height,contacts,horizontal,skipGrates,...rest);if(pos===a.pos&&previous){profile={radius,lift,height,skipGrates};assert.ok(sweep.clear(previous,pos,radius,lift,height,skipGrates),'actual source movement capsule '+JSON.stringify({team,ticks,from:previous.toArray(),to:pos.toArray(),profile,pi:brain.pi}));movementCapsules++;previous.copy(pos);}return result;};
  try{for(;ticks<7200;ticks++){
   if(brain.mode==='paint'&&(!brain.path||brain.goal!==id)){assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=1000;replans++;}
   G.time+=1/60;brain.update(1/60);fire ||=a.intent.fire;const start=a.pos.clone();previous=start.clone();a.update(1/60);
   assert.ok(profile&&sweep.clear(start,a.pos,profile.radius,profile.lift,profile.height,profile.skipGrates),'actual source Actor capsule '+JSON.stringify({team,ticks,from:start.toArray(),to:a.pos.toArray(),profile,pi:brain.pi}));actorCapsules++;
   G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);climbed ||=a.climbing;surged ||=a.s3.surge?.phase==='burst';
   if(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.75&&f.nativeSourceFootSupported(G,a,node)){ticks++;break;}
  }}finally{P.collideBody=collideBody;}
  assert.ok(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.75&&f.nativeSourceFootSupported(G,a,node)&&fire&&climbed&&surged,JSON.stringify({team,ticks,end:a.pos.toArray(),goal:goal.toArray(),fire,climbed,surged,pi:brain.pi}));
  cases.push({team,physicsStep:1/60,ticks,seconds:ticks/60,start:L.spawnPads[team].toArray(),goal:goal.toArray(),end:a.pos.toArray(),distance:a.pos.distanceTo(goal),waypoints:route.length,climbs:edges.filter(e=>e.type==='climb').length,drops:edges.filter(e=>e.drop).length,replans,actorCapsules,movementCapsules,sourceFootSupported:true,actualWeaponPaint:fire,climbed,surged,weapon:'shooter / WeaponShooterNormal',gearAP:0,productionCharacter:true});
 }}finally{f.restoreRandom();}
 assert.deepEqual(raw(),before);const evidence={id:'manta',sourceSha256:L.manifest.sourceSha256,cases,sourceBuffers:before,sourceBuffersUnchanged:true,conditions:'one production Actor/Character/Brain with actual WeaponRunner, Projectiles and paint clock per CPU case; empty initial paint; normal inputs at installed 1/60 step; original pads to genuinely opposed source foredecks; 0.5 RNG before Actor/Brain; goal command may be reselected after ordinary paint replanning; optional VM motion import unavailable, separate real Chromium eight-actor proofs required'};
 console.log(JSON.stringify(evidence));if(process.env.MANTA_BANK_CPU_REPORT){fs.mkdirSync(path.dirname(process.env.MANTA_BANK_CPU_REPORT),{recursive:true});fs.writeFileSync(process.env.MANTA_BANK_CPU_REPORT,JSON.stringify(evidence,null,2));}
});
