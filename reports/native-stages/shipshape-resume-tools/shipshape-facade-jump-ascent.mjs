import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape')),P=G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);const playerFields=Object.fromEntries(['radius','s3SwimTerrainRadiusRaw','s3HumanoidTerrainRadiusRaw','s3TerrainDistanceScale','squidBodyLift','squidHeight','stepUp','jumpSpeed','swimJumpSpeed'].map(k=>[k,PLAYER[k]]));const cases=[];
for(const sign of [-1,1])for(const hz of [30,60,120]){
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
 const stance=new THREE.Vector3(sign*28.45,1.5,sign*39),ground=P.raycast(stance.clone().setY(1.8),new THREE.Vector3(0,-1,0),.6),samples=[];
 if(!ground.hit||ground.face<0||Math.abs(ground.point.y-stance.y)>.1||!P.bodyFits(stance,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height))throw Error('Authentic supported stance required');
 for(let y=1.8;y<6.05;y+=.15){const h=P.raycast(new THREE.Vector3(stance.x,y,stance.z),new THREE.Vector3(-sign,0,0),4);if(!h.hit||h.face<0)throw Error('Actual source wall line gap '+y);samples.push({point:h.point.clone(),face:h.face,u:h.u,v:h.v,triangle:h.triangle,mask:L.mask[L.faces[h.face].grid+Math.floor(h.v/L.faces[h.face].cv)*L.faces[h.face].nu+Math.floor(h.u/L.faces[h.face].cu)]});}
 const a=new f.Actor({team:sign<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(stance,sign<0?Math.PI/2:-Math.PI/2);G.actors=[a];let shots=0,paintSeconds=0;
 const shot0=G.projectiles.inkFlight.stats.headImpacts;
 for(let frame=0;frame<hz*25;frame++){
  const missing=samples.find(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1);if(!missing)break;
  const delta=missing.point.clone().sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimPoint.copy(missing.point);a.aimYaw=a.intent.aimYaw=Math.atan2(delta.x,delta.z);a.aimPitch=a.intent.aimPitch=Math.atan2(delta.y,Math.hypot(delta.x,delta.z));a.intent.move.set(0,0,0);a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=a.ink>15&&!a.weaponRunner.s3ShooterCancelMain;a.intent.squid=a.ink<=15;
  G.time+=1/hz;a.update(1/hz);shots+=G.projectiles.list.filter(p=>p.age===0).length;G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);paintSeconds=(frame+1)/hz;
 }
 const owned=samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===a.team+1).length,trace=[];let maxY=a.pos.y,climbed=false;
 a.intent.fire=false;a.intent.squid=true;a.intent.jump=false;a.intent.move.set(-sign,0,0);
 for(let frame=0;frame<hz*10;frame++){a.intent.jump=frame===hz;a.intent.squid=frame!==hz;G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=a.climbing;maxY=Math.max(maxY,a.pos.y);if(frame%Math.max(1,hz/10)===0)trace.push({seconds:(frame+1)/hz,position:a.pos.toArray(),climbing:a.climbing,grounded:a.grounded,form:a.form,groundTeam:a.groundTeam});if(a.alive&&a.grounded&&a.pos.y>5.95)break;}
 const result={sign,hz,stance:stance.toArray(),supportTriangle:ground.triangle,productionCharacter:true,playerFields,normalGroundedJump:true,jumpSerial:a.s3JumpSerial||0,weapon:a.weaponId,gearAP:a.s3.abilityPoints,paintSeconds,shots,headImpacts:G.projectiles.inkFlight.stats.headImpacts-shot0,owned,samples:samples.length,climbed,maxY,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,sourceLine:samples.map(s=>({point:s.point.toArray(),face:s.face,triangle:s.triangle,mask:s.mask,owner:G.paint.sample(s.face,s.u,s.v)})),trace};cases.push(result);fs.writeFileSync('.ci-scratch/facade-jump-ascent.json',JSON.stringify({cases},null,2));console.log(JSON.stringify({...result,trace:undefined,sourceLine:undefined}));
}
