import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';

test('ordinary bots retain their original waypoint acceptance policy',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),b=new f.BotBrain(a,'normal');
 f.G.nav={nodes:[{id:0,x:a.pos.x,y:a.pos.y+.5,z:a.pos.z,nb:[]}]};b.path=[0];b.pi=0;
 assert.equal(f.nativeSourceWaypointReached(f.G,a,f.G.nav.nodes[0]),true);
 b._steer(1/60);assert.equal(b.pi,1,'the legacy generous vertical gate remains unchanged');
});

test('opted source followers reject airborne, lower and unsupported arrival without altering Actor state',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),n={x:a.pos.x,y:a.pos.y+.5,z:a.pos.z};
 f.G.level.manifest={sourceNavigation:{highDrops:true}};const before=a.pos.toArray(),velocity=a.vel.toArray();
 a.grounded=true;assert.equal(f.nativeSourceWaypointReached(f.G,a,n),false,'standing below a raised node never reaches it');
 n.y=a.pos.y;a.grounded=false;assert.equal(f.nativeSourceWaypointReached(f.G,a,n),false,'an airborne near-pass never reaches a support');
 a.grounded=true;assert.equal(f.nativeSourceWaypointReached(f.G,a,n),false,'ordinary blockout contact cannot substitute for a native source triangle');
 assert.deepEqual(Array.from(a.pos.toArray()),Array.from(before));assert.deepEqual(Array.from(a.vel.toArray()),Array.from(velocity));
});

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,manifest=root&&path.join(root,'bluefin','manifest.json');
const opted=manifest&&fs.existsSync(manifest)&&JSON.parse(fs.readFileSync(manifest)).sourceNavigation?.highDrops;
test('actual raised source curb is jumped and retained through its narrow supported lane',{skip:!opted},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,'bluefin')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 const N=G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();
 const ids=[5909,5910,5861,5827,5802,5771,5735,5685,5631],start=N.nodes[ids[0]],end=N.nodes[ids.at(-1)];
 assert.equal(N.edgeType(ids[0],ids[1]),'jump');assert.ok(N.nodes[ids[1]].y-start.y>PLAYER.stepUp);
 for(let i=1;i<ids.length;i++)assert.ok(N.nodes[ids[i-1]].nb.some(e=>e.to===ids[i]),'every assigned edge is generated from the real source');
 const proofs=[];f.setRandom(()=>.5);
 try{for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();const a=f.make('shooter');a.team=1;a.isBot=true;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(new THREE.Vector3(start.x,start.y,start.z),0);a.invuln=0;G.actors=[a];
  const b=a.bot=new f.BotBrain(a,'normal');b.path=[...ids];b.pi=1;b.goal=ids.at(-1);b.goalTimer=b.repath=b.bombCd=1000;
  let jumped=false,raised=false,seconds=0,wrongAdvance=false,minY=Infinity,maxXError=0;
  for(let frame=0;frame<hz*35;frame++){
   const beforePi=b.pi;G.time+=1/hz;b.update(1/hz);jumped ||=a.intent.jump;
   if(b.pi>beforePi&&beforePi===1&&(!a.grounded||Math.abs(a.pos.y-3.5)>.16))wrongAdvance=true;
   a.character.root.position.copy(a.pos);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(frame+1)/hz;
   raised ||=a.grounded&&Math.abs(a.pos.y-3.5)<.1;if(raised&&a.pos.z<8.5){minY=Math.min(minY,a.pos.y);maxXError=Math.max(maxXError,Math.abs(a.pos.x+6));}
   if(a.grounded&&a.pos.distanceTo(new THREE.Vector3(end.x,end.y,end.z))<.3)break;
   if(!a.alive||a.grounded&&a.pos.y<2.8)break;
  }
  assert.ok(a.alive&&a.grounded&&a.pos.distanceTo(new THREE.Vector3(end.x,end.y,end.z))<.3&&jumped&&raised&&!wrongAdvance,'ordinary bot input stays on the real curb at '+hz+'Hz '+JSON.stringify({pos:a.pos.toArray(),jumped,raised,wrongAdvance,seconds,pi:b.pi,minY,maxXError}));
  assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);proofs.push({hz,seconds,jumped,raised,wrongAdvance,minY,maxXError,end:a.pos.toArray(),weapon:'Shooter_Normal_00',gearAP:0,actualBrainActorWeaponProjectilesPaintClock:true});
 }}finally{f.restoreRandom();}
 console.log(JSON.stringify({sourceCurbCases:proofs,sourceNodes:ids,sourceGeometryUnchanged:true}));
});
