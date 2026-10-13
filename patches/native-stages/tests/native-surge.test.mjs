import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeStageCatalog,nativeBrowserStageIntegrity,NATIVE_RUNTIME_EXTERNALS} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';

test('source Surge is explicit and participates in source-cache identity',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/surge-catalog-'));
 const base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false};
 const write=value=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation:value}));
 try{
  for(const value of [{wallSurge:true},{wallClimb:true,highDrops:true,wallSurge:true}]){write(value);assert.deepEqual(nativeStageCatalog(dir).stages.at(-1).sourceNavigation,value);assert.notEqual(nativeBrowserStageIntegrity(base),nativeBrowserStageIntegrity({...base,sourceNavigation:value}));}
  for(const value of [{wallSurge:false},{wallSurge:1},{wallSurge:true,hover:true}]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('production native bundle reads the installed ordinary movement singleton',async()=>{
 const {build}=await import('esbuild'),result=await build({entryPoints:['patches/native-stages/runtime/engine.mjs'],bundle:true,format:'esm',minify:true,write:false,metafile:true,external:NATIVE_RUNTIME_EXTERNALS});
 const imports=Object.values(result.metafile.outputs).flatMap(o=>o.imports);assert.ok(imports.some(i=>i.external&&i.path==='../../splatoon3/runtime/movement.mjs'));assert.ok(!Object.keys(result.metafile.inputs).some(i=>i.endsWith('/splatoon3/runtime/movement.mjs')),'there must be no uninstalled second movement configuration');assert.ok(Object.keys(result.metafile.inputs).some(i=>i.endsWith('/native-surge.mjs')));
});

test('ordinary actors keep their selected inputs without a source Surge opt-in',async()=>{
 const f=await nativeFixture(),actor=f.make('shooter'),brain=new f.BotBrain(actor,'normal');actor.intent.move.set(1,0,0);actor.intent.squid=actor.intent.jump=actor.intent.fire=true;
 assert.equal(f.updateNativeSurge(brain,f.G,1/60),false);assert.deepEqual(Array.from(actor.intent.move.toArray()),[1,0,0]);assert.equal(actor.intent.squid,true);assert.equal(actor.intent.jump,true);assert.equal(actor.intent.fire,true);
});

const root=process.env.NATIVE_SURGE_FIXTURE_ASSETS;
test('authentic Manta narrow rims retain NoPaint and obstruction negatives while four real weapon/bot routes clear source capsules at 30/60/120Hz',{skip:!root},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'manta'),hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.triangleFace.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=hash();
 data.manifest.sourceNavigation={wallClimb:true,highDrops:true,wallSurge:true};
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();f.setRandom(()=>.5);
 const N=G.nav,reach=seed=>{const seen=new Set([seed]),q=[seed];for(let i=0;i<q.length;i++)for(const edge of N.nodes[q[i]].nb)if(!seen.has(edge.to)){seen.add(edge.to);q.push(edge.to);}return seen;},both=N.nativeSpawnNodeIds.map(reach);
 assert.ok(N.validIds.filter(id=>both.every(s=>s.has(id))).length>2000,'both unchanged opposed source pads reach the substantial central/source-bank component');
 const lower=N.nodes[2356],upper=N.nodes[2354];assert.equal(f.nativeClimbTransition(N,lower,upper),null,'ordinary continuous wall swimming cannot waive the actual NoPaint rim');
 const np=P.raycast(new THREE.Vector3(-13,10.85,lower.z-.2),new THREE.Vector3(-1,0,0),2);assert.ok(np.hit&&np.triangle>=0&&np.face<0,'the source NP rim remains physical and has no paint chart');
 assert.equal(f.nativeSurgeTransition(N,N.nodes[6625],N.nodes[6795]),null,'the actual raised source obstruction rejects the capsule flight');
 const sweep=f.nativeDropClearance(L);assert.equal(sweep.clear(new THREE.Vector3(-11,8,lower.z),new THREE.Vector3(-15,8,lower.z),.35,PLAYER.stepUp,PLAYER.height),false,'fitting endpoints cannot waive the source wall between them');
 const wanted=[2356,7326,3055,6638],edges=wanted.map(from=>({from,edge:N.nodes[from].nb.find(e=>e.climb?.kind==='surge')}));assert.ok(edges.every(c=>c.edge),'all four supported source wall orientations are qualified');
 const cases=[];
 for(const {from,edge}of edges)for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];const a=new f.Actor({team:edge.climb.lower[2]<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(...edge.climb.lower),a.team?Math.PI:0);a.invuln=0;G.actors=[a];const goal=new THREE.Vector3(...edge.climb.upper),brain=a.bot=new f.BotBrain(a,'normal');assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;assert.ok(brain.path.slice(1).some((to,i)=>N.nodes[brain.path[i]].nb.find(e=>e.to===to)?.climb?.kind==='surge'));
  let fire=false,swim=false,surge=false,seconds=0;
  for(let i=0;i<hz*10;i++){
   G.time+=1/hz;brain.update(1/hz);fire ||=a.intent.fire;swim ||=a.intent.squid;const previous=a.pos.clone();a.update(1/hz);const squid=a.form==='squid',radius=(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
   assert.ok(sweep.clear(previous,a.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid),'the actual live form capsule clears every source triangle '+JSON.stringify({from,hz,i,phase:brain._nativeSurge?.phase,previous:previous.toArray(),position:a.pos.toArray(),squid}));
   G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);surge ||=a.s3.surge?.phase==='burst';seconds=(i+1)/hz;if(a.grounded&&Math.abs(a.pos.y-goal.y)<.15&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<.6)break;
  }
  const floor=L.triangleWorld.ray(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3,{minNormalY:.68});assert.ok(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.6&&fire&&swim&&surge,'the real weapon/brain/controller reaches genuine supported roof '+JSON.stringify({from,hz,seconds,position:a.pos.toArray(),goal:goal.toArray(),fire,swim,surge}));assert.ok(floor&&(floor.flags&2));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  assert.ok(edge.climb.samples.every(s=>G.paint.sample(s.face,s.u,s.v)===a.team+1));cases.push({from,team:a.team,hz,seconds,goal:goal.toArray(),end:a.pos.toArray(),sourceLandingTriangle:floor.triangle,weapon:'shooter / Shooter_Normal_00',gearAP:0,fire,swim,surge,grounded:true,sourceCapsulesClear:true,productionCharacterMuzzle:true});
 }
 const interruptionCases=[];
 for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const edge=edges[0].edge,a=new f.Actor({team:edge.climb.lower[2]<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(...edge.climb.paintStance),0);a.invuln=0;G.actors=[a];
  const away=new THREE.Vector3(...edge.climb.normal);a.aimYaw=Math.atan2(away.x,away.z);a.aimPitch=0;a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.1,0)).addScaledVector(away,6);a.intent.fire=true;
  const tick=()=>{G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);};
  for(let i=0;i<Math.ceil(hz*.3);i++)tick();
  a.intent.squid=true;for(let i=0;i<Math.ceil(hz*.15);i++)tick();
  assert.ok(a.weaponRunner.s3ShooterCancelMain,'ordinary held-fire swim interruption cancels the actual Shooter stream');
  assert.ok(edge.climb.samples.some(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1),'the interrupted shots leave a real source wall to paint');
  const brain=a.bot=new f.BotBrain(a,'normal'),goal=new THREE.Vector3(...edge.climb.upper);assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;
  let released=false,newAdmittedShots=0;const stop=f.on('weapon:fire',event=>{if(event.actor===a)newAdmittedShots++;});
  for(let i=0;i<hz*10;i++){brain.update(1/hz);released ||=!a.intent.fire;tick();if(a.grounded&&a.pos.distanceTo(goal)<.6)break;}
  stop();
  assert.ok(released&&newAdmittedShots>0&&a.grounded&&a.pos.distanceTo(goal)<.6,'ordinary fire release, new admitted projectiles and supported source ascent recover after the interruption '+JSON.stringify({hz,released,newAdmittedShots,end:a.pos.toArray(),goal:goal.toArray(),grounded:a.grounded,cancelMain:a.weaponRunner.s3ShooterCancelMain,phase:brain._nativeSurge?.phase}));
  interruptionCases.push({hz,naturalSwimInterruption:true,productionCharacterMuzzle:true,ordinaryFireRelease:released,newAdmittedShots,end:a.pos.toArray(),grounded:a.grounded});
 }
 const bankCases=[];
 for(const team of [0,1])for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];const a=new f.Actor({team,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;G.actors=[a];
  const targetPoint=new THREE.Vector3(team?-12:12,8,team?-30.102798461914062:30.897201538085938),to=N.nearest(targetPoint,.6),target=N.nodes[to];assert.ok(target.nativePaintable&&target.zone<0);const goal=new THREE.Vector3(target.x,target.y,target.z),brain=a.bot=new f.BotBrain(a,'normal');assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;const waypoints=brain.path.length,climbs=brain.path.slice(1).filter((id,i)=>N.edgeType(brain.path[i],id)==='climb').length,drops=brain.path.slice(1).filter((id,i)=>N.nodes[brain.path[i]].nb.find(e=>e.to===id)?.drop).length;
  assert.ok(climbs>=1&&drops>=1);let seconds=0,fire=false,surge=false;
  for(let frame=0;frame<hz*90;frame++){
   assert.ok(brain.path&&brain.goal===to,'the ordinary full-bank path stays live without goal reacquisition '+JSON.stringify({team,hz,frame,position:a.pos.toArray(),pi:brain.pi,plain:brain._nativeClimb&&{phase:brain._nativeClimb.phase,seconds:brain._nativeClimb.seconds,stalled:brain._nativeClimb.stalled},wall:a.wallHit,ledge:a._ledgeHit,contacts:a.contacts}));G.time+=1/hz;brain.update(1/hz);fire ||=a.intent.fire;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);surge ||=a.s3.surge?.phase==='burst';seconds=(frame+1)/hz;if(a.grounded&&a.pos.distanceTo(goal)<.75)break;
  }
  assert.ok(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.75&&fire&&surge,'the actual opposed source-bank bot route completes '+JSON.stringify({team,hz,seconds,end:a.pos.toArray(),goal:goal.toArray(),fire,surge}));bankCases.push({team,hz,seconds,sourcePad:L.spawnPads[team].toArray(),goal:goal.toArray(),end:a.pos.toArray(),waypoints,climbs,drops,replans:0,grounded:true,actualWeaponPaint:true,productionCharacterMuzzle:true});
 }
 assert.equal(hash(),before,'source collision, flags, chart IDs and masks remain immutable');console.log(JSON.stringify({id:'manta',sourceSha256:L.manifest.sourceSha256,nav:N.nodes.length,valid:N.validIds.length,common:N.validIds.filter(id=>both.every(s=>s.has(id))).length,cases,interruptionCases,bankCases,sourceBuffersUnchanged:true}));
});
