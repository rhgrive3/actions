import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_CLIMB_FIXTURE_ASSETS||process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const id=process.env.NATIVE_CLIMB_FIXTURE_STAGE||'flounder';
const available=root&&fs.existsSync(path.join(root,id,'manifest.json'));
test('an ordinary shooter interruption can resume painting a qualified source climb',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,data=readStage(root,id);
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const N=G.nav=new f.NavGraph(L,P);
 const from=N.nodes.find(n=>n.nb.some(e=>e.type==='climb'&&!e.climb.kind));
 assert.ok(from,'the source fixture must have a real qualified plain wall');
 const edge=from.nb.find(e=>e.type==='climb'&&!e.climb.kind),c=edge.climb,cases=[],random=Math.random;Math.random=()=>.5;
 const tick=(a,dt)=>{G.time+=dt;a.character.root.position.copy(a.pos);a.update(dt);G.projectiles.update(dt);G.paint.advanceSimulation(dt);};
 try{for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a.isBot=true;a.spawnAt(new THREE.Vector3(...c.paintStance),0);a.invuln=0;
  const normal=new THREE.Vector3(...c.normal);a.aimYaw=Math.atan2(normal.x,normal.z);a.aimPitch=0;a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.1,0)).addScaledVector(normal,6);a.intent.fire=true;
  for(let i=0;i<Math.ceil(hz*.3);i++)tick(a,1/hz);
  a.intent.fire=false;a.intent.squid=true;tick(a,1/hz);
  assert.equal(a.weaponRunner.s3ShooterCancelMain,true,'the cancellation comes from real fire and swim inputs');
  const b=a.bot=new f.BotBrain(a,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;b.goalTimer=b.repath=b.bombCd=1000;
  let released=false,fire=false,climbed=false,seconds=0;
  for(let i=0;i<hz*8;i++){
   b.update(1/hz);released ||=b._nativeClimb?.phase==='release'&&!a.intent.fire&&!a.intent.squid;fire ||=a.intent.fire;tick(a,1/hz);climbed ||=a.climbing;seconds=(i+1)/hz;
   if(climbed&&a.grounded&&Math.abs(a.pos.y-c.upper[1])<.16)break;
  }
  assert.ok(released&&fire&&climbed&&a.alive&&a.grounded&&Math.abs(a.pos.y-c.upper[1])<.16,JSON.stringify({id,hz,released,fire,climbed,seconds,end:a.pos.toArray()}));
  assert.ok(c.samples.every(s=>G.paint.sample(s.face,s.u,s.v)===a.team+1));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  cases.push({hz,seconds,ordinaryRelease:true,realWeaponPaint:true,sourceUpperSupport:true,gearAP:0});
 }}finally{Math.random=random;}
 console.log(JSON.stringify({id,sourceSha256:L.manifest.sourceSha256,cases}));
});
