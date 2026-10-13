import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.NATIVE_GROUNDED_FORM_ASSETS||process.env.INKWAVE_NATIVE_STAGE_ASSETS,ready=root&&fs.existsSync(path.join(root,'bluefin','manifest.json'));
test('natural source Shooter triggers ordinary refill through a human-clear swim-blocked source lane at all kernel rates',{skip:!ready},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,'bluefin')),P=G.physics=new f.NativePhysics(L),N=G.nav=new f.NavGraph(L,P);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(L.data.triangles.buffer)).update(Buffer.from(L.data.flags.buffer)).update(Buffer.from(L.mask.buffer)).digest('hex'),sourceBefore=digest();
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();const cases=[],clearance=f.nativeDropClearance(L);f.setRandom(()=>.5);
 try{for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const start=N.nodes[4878],target=N.nodes[4755],a=new f.Actor({team:1,name:'source grounded form',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(start.x,start.y,start.z),Math.PI);a.invuln=0;G.actors=[a];
  let samples=0;const forms=new Set(),tick=()=>{const previous=a.pos.clone();G.time+=1/hz;a.update(1/hz);const sq=a.form==='squid',r=(sq?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;assert(clearance.clear(previous,a.pos,r,sq?PLAYER.squidBodyLift:PLAYER.stepUp,sq?PLAYER.squidHeight:PLAYER.height,sq),JSON.stringify({hz,from:previous.toArray(),to:a.pos.toArray(),form:a.form}));samples++;forms.add(a.form);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);};
  for(let i=0;i<6;i++)tick();
  const paintPoint=new THREE.Vector3(-20.25,3,-10.75),h=P.raycast(paintPoint.clone().setY(3.2),new THREE.Vector3(0,-1,0),.4);assert(h.hit&&h.face>=0);
  const aim=h.point.clone().sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimYaw=Math.atan2(aim.x,aim.z);a.aimPitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z));a.aimPoint.copy(h.point);a.intent.fire=true;
  let preparationFrames=0;while(a.ink>8&&preparationFrames<hz*16){tick();preparationFrames++;}a.intent.fire=false;for(let i=0;i<Math.ceil(hz*.2);i++)tick();assert(a.ink/PLAYER.inkMax<.12,'actual shooting enters the ordinary low-ink refill condition');const naturalLowInk=a.ink;
  const painted=G.paint.grid.reduce((s,v)=>s+(v===a.team+1),0);assert(painted>0,'ordinary projectiles own original source terrain');
  const goal=new THREE.Vector3(target.x,target.y,target.z),b=a.bot=new f.BotBrain(a,'normal');assert(b._pathTo(goal,.6));const originalPath=Array.from(b.path);assert(originalPath.includes(4878)&&originalPath.includes(4817)&&originalPath.at(-1)===4755,JSON.stringify(originalPath));b.goalTimer=b.repath=b.bombCd=1000;
  let seconds=0,friendly=false,kidTicks=0,autoRefill=false;
  for(let i=0;i<hz*12;i++){b.update(1/hz);autoRefill ||=b.mode==='refill';kidTicks+=!a.intent.squid;tick();friendly ||=a.groundTeam===1;seconds=(i+1)/hz;if(a.grounded&&a.pos.distanceTo(goal)<.25&&f.nativeSourceFootSupported(G,a,target))break;}
  assert(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.25&&f.nativeSourceFootSupported(G,a,target)&&friendly&&kidTicks>0&&autoRefill,JSON.stringify({hz,seconds,end:a.pos.toArray(),goal:goal.toArray(),friendly,kidTicks,pi:b.pi,mode:b.mode}));assert.equal(digest(),sourceBefore);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  cases.push({hz,seconds,start:[start.x,start.y,start.z],goal:goal.toArray(),end:a.pos.toArray(),route:originalPath,sourcePaintTriangle:h.triangle,sourcePaintFace:h.face,paintedCells:painted,naturalLowInk,preparationFrames,ordinaryAutomaticRefill:autoRefill,friendlyTerrain:true,forms:Array.from(forms),kidTicks,continuousActualCapsuleSamples:samples,continuousActualCapsuleFailures:0,alive:true,grounded:true,sourceFootSupported:true,weapon:'Shooter_Normal_00',gearAP:0});console.log(JSON.stringify({sourceGroundedFormCase:cases.at(-1)}));
 }}finally{f.restoreRandom();}
 const report={sourceSha256:L.manifest.sourceSha256,sourceUnchanged:true,cases,conditions:'Actual source-supported initial poses, production Character/Actor/ordinary BotBrain, natural Shooter through WeaponRunner/projectiles, initially empty paint, zeroAP, no later pose/velocity/ink/ownership assignments. Every initial/prepaint/moving capsule and final source-foot support verified. Controlled CPU kernel30/60/120; optional source-motion playback unavailable. No whole-bank or production variable-physics claim.'};console.log(JSON.stringify({sourceGroundedFormPhysical:report}));
});
