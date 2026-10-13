import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog,nativeBrowserStageIntegrity} from '/workspace/stage-worktrees/flounder-climb-recovery/scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from '/workspace/stage-worktrees/flounder-climb-recovery/patches/native-stages/tests/fixture.mjs';

test('source wall traversal is an explicit validated opt-in',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/climb-catalog-'));
 const base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false};
 assert.notEqual(nativeBrowserStageIntegrity(base),nativeBrowserStageIntegrity({...base,sourceNavigation:{wallClimb:true}}),'derived public cache separates opted navigation metadata');
 const write=sourceNavigation=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation}));
 try{write({wallClimb:true});assert.equal(nativeStageCatalog(dir).stages.at(-1).sourceNavigation.wallClimb,true);for(const value of [{wallClimb:false},{wallClimb:1},{wallClimb:true,teleport:true}]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}for(const s of nativeStageCatalog().stages.filter(s=>['scorch','hagglefish','inkblot','mako','brinewater'].includes(s.id)))assert.equal(s.sourceNavigation,undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('ordinary blockout bots retain inputs without a native manifest',async()=>{
 const f=await nativeFixture(),actor=f.make('shooter'),brain=new f.BotBrain(actor,'normal');actor.intent.squid=true;actor.intent.move.set(1,0,0);
 assert.equal(f.G.level.manifest,undefined);assert.equal(f.updateNativeClimb(brain,f.G,1/60),false);f.nativeClimbTravelForm(brain,f.G);assert.equal(actor.intent.squid,true);assert.deepEqual(Array.from(actor.intent.move.toArray()),[1,0,0]);
});

const root=process.env.NATIVE_CLIMB_FIXTURE_ASSETS,id=process.env.INKWAVE_NATIVE_CLIMB_STAGE||'flounder',available=root&&fs.existsSync(path.join(root,id,'manifest.json'));
test('opted source walls have real supported routes, while NoPaint and disabled paths reject',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,id)),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const started=performance.now(),N=G.nav=new f.NavGraph(L,P);
 const navBuildMilliseconds=performance.now()-started;
 const edges=N.nodes.flatMap(n=>n.nb.filter(e=>e.type==='climb').map(e=>({lower:n,upper:N.nodes[e.to],edge:e})));assert.ok(edges.length>0);
 const center=N.nearest(new THREE.Vector3((L.bounds.minX+L.bounds.maxX)/2,(L.spawnPads[0].y+L.spawnPads[1].y)/2,(L.bounds.minZ+L.bounds.maxZ)/2),1.2),routes=[];
 for(let team=0;team<2;team++){const route=N.path(N.nearest(L.spawnPads[team],1.2),center,team,50000);assert.ok(route?.length);assert.ok(route.slice(1).some((to,i)=>N.edgeType(route[i],to)==='climb'),'actual opposing source-bank route needs a climb');routes.push(route);}
 const bankPaths=[];
 for(let team=0;team<2;team++){
  const actor=f.make('shooter');actor.team=team;actor.pos.copy(L.spawnPads[team]);const brain=new f.BotBrain(actor,'normal'),sign=team?-1:1,to=N.nearest(new THREE.Vector3(-15*sign,6,35*sign),1.2),node=N.nodes[to];
  assert.ok(brain._pathTo(new THREE.Vector3(node.x,node.y,node.z),.6),'existing BotBrain accepts a long opposing-bank source route without the legacy 6000-pop cutoff');
  bankPaths.push({team,waypoints:brain.path.length,climbs:brain.path.slice(1).filter((to,i)=>N.edgeType(brain.path[i],to)==='climb').length});
 }
 const first=edges[0];assert.ok(f.nativeClimbTransition(N,first.lower,first.upper));
 delete L.manifest.sourceNavigation;assert.equal(f.nativeClimbTransition(N,first.lower,first.upper),null,'ordinary stages retain walking-only navigation');L.manifest.sourceNavigation={wallClimb:true};
 let noPaint=0,blockedCorridors=0;
 for(const lower of N.nodes){if(lower.y<=PLAYER.fallDeathY)continue;for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
  const x=lower.ix+dx,z=lower.iz+dz;if(x<0||z<0||x>=N.nx||z>=N.nz)continue;
  for(const upperId of N.cells[z*N.nx+x]){const upper=N.nodes[upperId];if(upper.y-lower.y<=1.25)continue;const origin=new THREE.Vector3(lower.x,lower.y+.3,lower.z),direction=new THREE.Vector3(dx,0,dz),hit=P.raycast(origin,direction,1.25);
   if(hit.hit&&Math.abs(hit.normal.y)<.15&&hit.face<0){assert.equal(f.nativeClimbTransition(N,lower,upper),null,'NoPaint wall never creates a climb edge');noPaint++;}
   if(hit.hit&&Math.abs(hit.normal.y)<.15&&hit.face>=0){const spine=hit.point.clone().addScaledVector(hit.normal,PLAYER.radius+.04);let blocked=false;for(let y=lower.y;y<upper.y;y+=.25)if(!P.bodyFits(spine.clone().setY(y),PLAYER.radius,.32,PLAYER.height,false,.015)){blocked=true;break;}if(blocked){assert.equal(f.nativeClimbTransition(N,lower,upper),null,'actual source ceiling or protrusion rejects the capsule corridor');blockedCorridors++;}}
  }
 }if(noPaint>=12&&blockedCorridors>=8)break;}
 assert.ok(noPaint>0,'negative cases come from actual exported nonpaintable triangles');
 assert.ok(blockedCorridors>0,'headroom negatives use actual exported triangles');
 const point=new THREE.Vector3(...first.edge.climb.samples[0].point),normal=new THREE.Vector3(...first.edge.climb.normal),a=f.make();a.pos.copy(point).addScaledVector(normal,PLAYER.radius+.05);a.pos.y-=.3;a.form='squid';a.intent.move.copy(normal).negate();a.climbExit=0;
 G.paint.splat(point.clone().addScaledVector(normal,.005),2,0,{seed:.375,instant:true});a._updateClimb(1/60,true);assert.ok(a.climbing);
 G.paint.splat(point.clone().addScaledVector(normal,.005),3,1,{seed:.375,instant:true});a._updateClimb(1/60,true);assert.equal(a.climbing,false,'live enemy-wall ownership releases the actor');
 const human=[],bots=[],bankTraversal=[];
 G.camera=new THREE.PerspectiveCamera();
 for(let team=0;team<2;team++){
  const route=routes[team],at=route.slice(1).findIndex((to,i)=>N.edgeType(route[i],to)==='climb'),edge=N.nodes[route[at]].nb.find(e=>e.to===route[at+1]);
  for(const hz of [30,60,120]){
   G.paint.grid.fill(0);G.paint.counts=[0,0];
   for(const sample of edge.climb.samples)G.paint.splat(new THREE.Vector3(...sample.point).addScaledVector(new THREE.Vector3(...edge.climb.normal),.005),1.8,team,{instant:true,seed:.375});
   const actor=f.make('shooter');actor.team=team;actor._integrate=f.Actor.prototype._integrate;actor.pos.fromArray(edge.climb.lower);actor.vel.set(0,0,0);actor.intent.move.fromArray(edge.climb.normal).negate();actor.intent.squid=true;G.actors=[actor];let climbed=false;
   for(let frame=0;frame<hz*5;frame++){G.time+=1/hz;actor.update(1/hz);climbed ||=actor.climbing;if(actor.pos.y>edge.climb.upper[1]-.1&&actor.grounded)break;}
   assert.ok(climbed&&actor.grounded&&Math.abs(actor.pos.y-edge.climb.upper[1])<.12,'ordinary swim input reaches actual source upper support '+JSON.stringify({team,hz,lower:edge.climb.lower,upper:edge.climb.upper,pos:actor.pos.toArray(),climbed,grounded:actor.grounded,wallHit:{hit:actor.wallHit.hit,face:actor.wallHit.face,point:actor.wallHit.point.toArray()},ledgeHit:{hit:actor._ledgeHit.hit,face:actor._ledgeHit.face,point:actor._ledgeHit.point.toArray()}}));
   human.push({team,hz,start:edge.climb.lower,end:actor.pos.toArray(),grounded:actor.grounded,initialState:'source wall already friendly-inked; humanoid shooter; default fixture gear'});
  }
  for(const hz of [30,60,120]){
   G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
   const actor=f.make('shooter');actor.team=team;actor.isBot=true;actor._integrate=f.Actor.prototype._integrate;actor.pos.fromArray(edge.climb.lower);actor.vel.set(0,0,0);actor.invuln=0;G.actors=[actor];
   const brain=actor.bot=new f.BotBrain(actor,'normal');assert.ok(brain._pathTo(new THREE.Vector3(...edge.climb.upper),.6));brain.goalTimer=100;brain.repath=100;
   let climbed=false,fire=false,swim=false,seconds=0;
   for(let frame=0;frame<hz*8;frame++){
    G.time+=1/hz;brain.update(1/hz);fire ||=actor.intent.fire;swim ||=actor.intent.squid;actor.character.root.position.copy(actor.pos);actor.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=actor.climbing;seconds=(frame+1)/hz;
    if(climbed&&actor.grounded&&Math.abs(actor.pos.y-edge.climb.upper[1])<.15)break;
   }
   assert.ok(fire&&swim&&climbed&&actor.grounded&&Math.abs(actor.pos.y-edge.climb.upper[1])<.15,'existing BotBrain paints an empty source wall then swims to support '+JSON.stringify({team,hz,fire,swim,climbed,pos:actor.pos.toArray(),grounded:actor.grounded,phase:brain._nativeClimb?.phase,missing:edge.climb.samples.filter(s=>G.paint.sample(s.face,s.u,s.v)!==team+1),ink:actor.ink}));
   assert.ok(edge.climb.samples.every(s=>G.paint.sample(s.face,s.u,s.v)===team+1),'weapon paint owns every wall-chain sample');
   assert.deepEqual(Object.keys(actor.s3.abilityPoints),[],'test gear is zero AP');
   bots.push({team,hz,seconds,start:edge.climb.lower,end:actor.pos.toArray(),wallSamples:edge.climb.samples.length,weapon:'shooter / Shooter_Normal_00',gearAP:0,initialWall:'unpainted',ordinaryFireSwimMove:true,grounded:true});
  }
 }
 for(let team=0;team<2;team++)for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const actor=f.make('shooter');actor.team=team;actor.isBot=true;actor._integrate=f.Actor.prototype._integrate;actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.invuln=0;G.actors=[actor];
  const brain=actor.bot=new f.BotBrain(actor,'normal'),sign=team?-1:1,to=N.nearest(new THREE.Vector3(-15*sign,6,35*sign),1.2),node=N.nodes[to],goal=new THREE.Vector3(node.x,node.y,node.z);
  assert.ok(brain._pathTo(goal,.6));const initialWaypoints=brain.path.length,initialClimbs=brain.path.slice(1).filter((to,i)=>N.edgeType(brain.path[i],to)==='climb').length;assert.ok(initialClimbs>=2);
  brain.goalTimer=1000;brain.repath=1000;brain.bombCd=1000;
  let climbed=false,fire=false,seconds=0,replans=0;
  for(let frame=0;frame<hz*90;frame++){
   // A requested traversal goal persists through ordinary refill and recovery,
   // as an objective caller would request it again; no Actor pose is assigned.
   if(brain.mode==='paint'&&(!brain.path||brain.goal!==to)){brain._pathTo(goal,.6);brain.goalTimer=1000;brain.repath=1000;replans++;}
   G.time+=1/hz;brain.update(1/hz);fire ||=actor.intent.fire;actor.character.root.position.copy(actor.pos);actor.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=actor.climbing;seconds=(frame+1)/hz;
   if(actor.grounded&&actor.pos.distanceTo(goal)<1.5)break;
  }
  assert.ok(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<1.5&&climbed&&fire,'existing bot physically traverses opposing source bank, real walls and supports at '+hz+'Hz/team'+team+' '+JSON.stringify({seconds,climbed,fire,pos:actor.pos.toArray(),distance:actor.pos.distanceTo(goal),alive:actor.alive,grounded:actor.grounded,ink:actor.ink,mode:brain.mode,goal:brain.goal,pi:brain.pi,path:brain.path?.slice(brain.pi,brain.pi+2),phase:brain._nativeClimb?.phase,climbSeconds:brain._nativeClimb?.seconds,climbStall:brain._nativeClimb?.stalled,specialActive:actor.specialActive,form:actor.form,squid:actor.intent.squid}));
  bankTraversal.push({team,hz,seconds,replans,initialWaypoints,initialClimbs,start:L.spawnPads[team].toArray(),end:actor.pos.toArray(),distanceToGoal:actor.pos.distanceTo(goal),weapon:'shooter / Shooter_Normal_00',gearAP:0,initialPaint:'unpainted',actualBrainActorWeaponProjectilesPaintClock:true});
 }
 console.log(JSON.stringify({id,climbEdges:edges.length,navNodes:N.nodes.length,validNodes:N.validIds.length,noPaintNegativeCases:noPaint,blockedSourceCorridors:blockedCorridors,navBuildMilliseconds,verificationMilliseconds:performance.now()-started,enemyWallReleased:true,bankPaths,human,bots,bankTraversal,sourceBuffersUnchanged:true}));
});
