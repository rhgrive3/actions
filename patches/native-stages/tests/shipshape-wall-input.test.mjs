import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,available=root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('Shipshape actual bots paint an empty source wall and swim onto its source support',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,L=G.level=new f.NativeLevel(readStage(root,'shipshape'));G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,G.physics);G.camera=new THREE.PerspectiveCamera();
 const center=f.nativeRankedStage(G).zones[0].center,goal=G.nav.nearest(new THREE.Vector3(...center),1.2),cases=[];
 for(const team of [0,1]){
  const route=G.nav.path(G.nav.nativeSpawnNodeIds[team],goal,team,50000);assert.ok(route?.length);
  const at=route.slice(1).findIndex((to,i)=>G.nav.edgeType(route[i],to)==='climb');assert.ok(at>=0,'qualified source route includes a real wall');
  const edge=G.nav.nodes[route[at]].nb.find(e=>e.to===route[at+1]),c=edge.climb;
  for(const hz of [30,60,120]){
   G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();const actor=f.make('shooter');actor.team=team;actor.isBot=true;actor._integrate=f.Actor.prototype._integrate;actor.spawnAt(new THREE.Vector3(...c.lower),team?Math.PI:0);actor.invuln=0;G.actors=[actor];
   const brain=actor.bot=new f.BotBrain(actor,'normal');assert.ok(brain._pathTo(new THREE.Vector3(...c.upper),.6));brain.goalTimer=brain.repath=brain.bombCd=1000;
   let fire=false,swim=false,climbed=false,seconds=0;
   for(let frame=0;frame<hz*12;frame++){G.time+=1/hz;brain.update(1/hz);fire ||=actor.intent.fire;swim ||=actor.intent.squid;actor.character.root.position.copy(actor.pos);actor.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=actor.climbing;seconds=(frame+1)/hz;if(climbed&&actor.grounded&&Math.abs(actor.pos.y-c.upper[1])<.15)break;}
   const row={team,hz,seconds,fire,swim,climbed,alive:actor.alive,grounded:actor.grounded,start:c.lower,target:c.upper,end:actor.pos.toArray(),phase:brain._nativeClimb?.phase,ownedSamples:c.samples.filter(s=>G.paint.sample(s.face,s.u,s.v)===team+1).length,wallSamples:c.samples.length,weapon:actor.weaponId,gearAP:actor.s3.abilityPoints};cases.push(row);console.log(JSON.stringify({id:'shipshape',...row}));
   if(process.env.SHIPSHAPE_WALL_REPORT)fs.writeFileSync(process.env.SHIPSHAPE_WALL_REPORT,JSON.stringify({id:'shipshape',sourceSha256:L.manifest.sourceSha256,version1130Verified:false,cases},null,2)+'\n');
   assert.ok(fire&&swim&&climbed&&actor.alive&&actor.grounded&&Math.abs(actor.pos.y-c.upper[1])<.15,'ordinary BotBrain/Actor/WeaponRunner/Projectiles must paint and climb the source wall '+JSON.stringify(row));
   assert.equal(row.ownedSamples,row.wallSamples);assert.deepEqual(Object.keys(actor.s3.abilityPoints),[]);
  }
 }
});
