import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,available=!!root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('Shipshape genuine facade seam needs a normal grounded jump before ordinary painted-wall swimming',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'shipshape'),hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.triangleFace.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=hash();
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L),cases=[];
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);
 const playerFields=Object.fromEntries(['radius','s3SwimTerrainRadiusRaw','s3HumanoidTerrainRadiusRaw','s3TerrainDistanceScale','squidBodyLift','squidHeight','stepUp'].map(k=>[k,PLAYER[k]]));
 for(const sign of [-1,1])for(const [hz,jump] of [[60,false],[30,true],[60,true],[120,true]]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const stance=new THREE.Vector3(sign*28.45,1.5,sign*39),ground=P.raycast(stance.clone().setY(1.8),new THREE.Vector3(0,-1,0),.6),samples=[];
  assert.ok(ground.hit&&ground.face>=0&&Math.abs(ground.point.y-stance.y)<.1&&P.bodyFits(stance,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height),'original supported human shooting stance');
  for(let y=1.8;y<6.05;y+=.15){const h=P.raycast(new THREE.Vector3(stance.x,y,stance.z),new THREE.Vector3(-sign,0,0),4);assert.ok(h.hit&&h.face>=0&&L.containsFaceUV(L.faces[h.face],h.u,h.v),'uninterrupted exact original paintable facade');samples.push({point:h.point.clone(),face:h.face,u:h.u,v:h.v,triangle:h.triangle});}
  const a=new f.Actor({team:sign<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(stance,sign<0?Math.PI/2:-Math.PI/2);G.actors=[a];
  let admitted=0,naturalSplats=0,paintSeconds=0;const splat=G.paint.splat;G.paint.splat=function(...args){naturalSplats++;return splat.apply(this,args);};
  try{for(let frame=0;frame<hz*25;frame++){
   const missing=samples.find(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1);if(!missing)break;
   const delta=missing.point.clone().sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimPoint.copy(missing.point);a.aimYaw=a.intent.aimYaw=Math.atan2(delta.x,delta.z);a.aimPitch=a.intent.aimPitch=Math.atan2(delta.y,Math.hypot(delta.x,delta.z));a.intent.move.set(0,0,0);a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.fire=a.ink>15&&!a.weaponRunner.s3ShooterCancelMain;a.intent.squid=a.ink<=15;
   const count=G.projectiles.list.length;G.time+=1/hz;a.update(1/hz);admitted+=Math.max(0,G.projectiles.list.length-count);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);paintSeconds=(frame+1)/hz;
  }}finally{G.paint.splat=splat;}
  const owned=samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===a.team+1).length;assert.equal(owned,samples.length,'ordinary admitted weapon owns every original source wall contact');assert.ok(admitted&&naturalSplats);
  a.intent.fire=false;a.intent.squid=true;a.intent.jump=false;a.intent.move.set(-sign,0,0);let climbed=false,jumpFrom=null,seconds=0,maxY=a.pos.y;
  for(let frame=0;frame<hz*10;frame++){
   a.intent.jump=jump&&frame===hz;a.intent.squid=!(jump&&frame===hz);if(a.intent.jump)jumpFrom={position:a.pos.toArray(),grounded:a.grounded};
   G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=a.climbing;seconds=(frame+1)/hz;maxY=Math.max(maxY,a.pos.y);if(a.alive&&a.grounded&&a.pos.y>5.95){const h=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);if(h.hit&&h.face>=0)break;}
  }
  const landing=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3),row={sign,hz,jump,admitted,naturalSplats,paintSeconds,owned,samples:samples.length,seconds,jumpFrom,jumpSerial:a.s3JumpSerial||0,climbed,maxY,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,landingFace:landing.face,landingTriangle:landing.triangle,landingObject:landing.hit?L.manifest.objects[L.triangleWorld.objectIds[landing.triangle]].name:null};cases.push(row);console.log(JSON.stringify(row));
  assert.ok(a.alive&&a.grounded&&landing.hit&&landing.face>=0);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  if(jump){assert.ok(jumpFrom?.grounded&&climbed&&Math.abs(a.pos.y-6.050000190734863)<.15,'normal supported jump and ordinary squid input reach the actual opposing bank');assert.equal(row.jumpSerial,1);}
  else{assert.equal(climbed,false,'intact protruding source seam blocks plain swim attachment');assert.equal(row.jumpSerial,0);assert.ok(maxY<1.6);}
 }
 assert.equal(hash(),before,'all original source collision, roles, charts and masks remain unchanged');
 const result={id:'shipshape',sourceSha256:L.manifest.sourceSha256,version1130Verified:false,productionCharacter:true,ordinaryActorWeaponRunnerProjectiles:true,manualPaint:false,playerFields,cases};
 if(process.env.SHIPSHAPE_FACADE_REPORT)fs.writeFileSync(process.env.SHIPSHAPE_FACADE_REPORT,JSON.stringify(result,null,2)+'\n');
});
