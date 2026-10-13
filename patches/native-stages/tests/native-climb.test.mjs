import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';

test('source wall traversal is an explicit validated opt-in',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/climb-catalog-'));
 const base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false};
 const write=sourceNavigation=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation}));
 try{write({wallClimb:true});assert.equal(nativeStageCatalog(dir).stages.at(-1).sourceNavigation.wallClimb,true);for(const value of [{wallClimb:false},{wallClimb:1},{wallClimb:true,teleport:true}]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}for(const s of nativeStageCatalog().stages.filter(s=>['scorch','hagglefish','inkblot','mako','brinewater'].includes(s.id)))assert.equal(s.sourceNavigation,undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,id=process.env.INKWAVE_NATIVE_CLIMB_STAGE||'flounder',available=root&&fs.existsSync(path.join(root,id,'manifest.json'));
test('opted source walls have real supported routes, while NoPaint and disabled paths reject',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,id)),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const started=performance.now(),N=G.nav=new f.NavGraph(L,P);
 const edges=N.nodes.flatMap(n=>n.nb.filter(e=>e.type==='climb').map(e=>({lower:n,upper:N.nodes[e.to],edge:e})));assert.ok(edges.length>0);
 const center=N.nearest(new THREE.Vector3((L.bounds.minX+L.bounds.maxX)/2,(L.spawnPads[0].y+L.spawnPads[1].y)/2,(L.bounds.minZ+L.bounds.maxZ)/2),1.2),routes=[];
 for(let team=0;team<2;team++){const route=N.path(N.nearest(L.spawnPads[team],1.2),center,team,50000);assert.ok(route?.length);assert.ok(route.slice(1).some((to,i)=>N.edgeType(route[i],to)==='climb'),'actual opposing source-bank route needs a climb');routes.push(route);}
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
 const human=[];
 for(let team=0;team<2;team++){
  const route=routes[team],at=route.slice(1).findIndex((to,i)=>N.edgeType(route[i],to)==='climb'),edge=N.nodes[route[at]].nb.find(e=>e.to===route[at+1]);
  for(const hz of [30,60,120]){
   G.paint.grid.fill(0);G.paint.counts=[0,0];
   for(const sample of edge.climb.samples)G.paint.splat(new THREE.Vector3(...sample.point).addScaledVector(new THREE.Vector3(...edge.climb.normal),.005),1.8,team,{instant:true,seed:.375});
   const actor=f.make('shooter');actor.team=team;actor._integrate=f.Actor.prototype._integrate;actor.pos.fromArray(edge.climb.lower);actor.vel.set(0,0,0);actor.intent.move.fromArray(edge.climb.normal).negate();actor.intent.squid=true;G.actors=[actor];let climbed=false;
   for(let frame=0;frame<hz*5;frame++){G.time+=1/hz;actor.update(1/hz);climbed ||=actor.climbing;if(actor.pos.y>edge.climb.upper[1]-.1&&actor.grounded)break;}
   assert.ok(climbed&&actor.grounded&&Math.abs(actor.pos.y-edge.climb.upper[1])<.12,'ordinary swim input reaches actual source upper support');
   human.push({team,hz,start:edge.climb.lower,end:actor.pos.toArray(),grounded:actor.grounded,initialState:'source wall already friendly-inked; humanoid shooter; default fixture gear'});
  }
 }
 console.log(JSON.stringify({id,climbEdges:edges.length,navNodes:N.nodes.length,validNodes:N.validIds.length,noPaintNegativeCases:noPaint,blockedSourceCorridors:blockedCorridors,navigationMilliseconds:performance.now()-started,enemyWallReleased:true,human,sourceBuffersUnchanged:true}));
});
