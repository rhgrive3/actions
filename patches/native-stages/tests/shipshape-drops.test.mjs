import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const available=!!root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('Shipshape original bank departures admit ordinary human and bot gravity at 30/60/120 Hz',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,data=readStage(root,'shipshape');
 const hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.triangleFace.buffer)).digest('hex'),before=hash();
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L),N=G.nav=new f.NavGraph(L,P);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);
 const nearest=p=>N.nodes.reduce((a,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2])?n:a,N.nodes[0]),cases=[],departures=[];
 const reach=N.nativeSpawnNodeIds.map(seed=>{const seen=new Set([seed]),queue=[seed];for(let i=0;i<queue.length;i++)for(const e of N.nodes[queue[i]].nb)if(N.valid[e.to]&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}return seen;});
 for(const sign of [-1,1]){
  const upper=nearest([-sign*4.5,9,sign*40]),lower=nearest([-sign*4.5,6,sign*41]),edge=f.nativeDropTransition(N,upper,lower);
  assert.ok(edge&&N.valid[upper.id]&&N.valid[edge.to],'original supported bank departure is admitted');
  departures.push({upper:{id:upper.id,position:[upper.x,upper.y,upper.z],valid:!!N.valid[upper.id],reachable:reach.map(r=>r.has(upper.id))},lower:{id:lower.id,position:[lower.x,lower.y,lower.z],valid:!!N.valid[lower.id],reachable:reach.map(r=>r.has(lower.id))},constructorEdges:upper.nb.filter(e=>e.drop).map(e=>({to:e.to,landing:e.drop.landing})),screenedLanding:edge.drop.landing});
  assert.equal(P.los(new THREE.Vector3(upper.x,upper.y+1.5,upper.z),new THREE.Vector3(lower.x,lower.y+1.5,lower.z)),false,'straight diagonal LOS retains its original source obstruction');
  const flags=L.manifest.sourceNavigation;L.manifest.sourceNavigation={wallClimb:true};assert.equal(f.nativeDropTransition(N,upper,lower),null);L.manifest.sourceNavigation=flags;
  for(const bot of [false,true])for(const hz of [30,60,120]){
   G.actors=[];G.projectiles.clear();G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
   const a=new f.Actor({team:sign<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),goal=new THREE.Vector3(...edge.drop.landing);
   a.isBot=bot;a.spawnAt(new THREE.Vector3(...edge.drop.upper),Math.atan2(edge.drop.direction[0],edge.drop.direction[2]));a.invuln=0;G.actors=[a];
   let brain;if(bot){brain=a.bot=new f.BotBrain(a,'normal');assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;assert.ok(brain.path.slice(1).some((id,i)=>N.nodes[brain.path[i]].nb.find(e=>e.to===id)?.drop));}
   else{a.intent.move.fromArray(edge.drop.direction);a.intent.fire=a.intent.squid=a.intent.jump=false;}
   let airborne=false,seconds=0,firstTouchdown=null,completedDrop=false;
   for(let frame=0;frame<hz*6;frame++){G.time+=1/hz;const activeDrop=brain?._nativeDrop;brain?.update(1/hz);completedDrop ||=!!activeDrop&&!brain._nativeDrop;a.character.root.position.copy(a.pos);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);airborne ||=!a.grounded;seconds=(frame+1)/hz;if(airborne&&a.grounded&&a.pos.y<upper.y-1.25&&!firstTouchdown)firstTouchdown={seconds,position:a.pos.toArray()};if(firstTouchdown&&a.grounded&&a.pos.distanceTo(goal)<.45&&Math.abs(a.pos.y-goal.y)<.16&&(!bot||completedDrop))break;}
   const support=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);
   assert.ok(firstTouchdown&&a.alive&&a.grounded&&a.pos.distanceTo(goal)<.45&&Math.abs(a.pos.y-goal.y)<.16,'ordinary real controller walks from touchdown onto final supported node '+JSON.stringify({bot,hz,seconds,end:a.pos.toArray(),goal:goal.toArray(),alive:a.alive,grounded:a.grounded}));
   if(bot)assert.ok(completedDrop,'bot completes the real drop handler after supported travel');
   assert.ok(support.hit&&support.face>=0);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);assert.equal(a.s3JumpSerial||0,0);
   const face=L.faces[support.face],i=Math.max(0,Math.min(face.nu-1,Math.floor(support.u/face.cu))),j=Math.max(0,Math.min(face.nv-1,Math.floor(support.v/face.cv)));
   assert.ok(face.turf&&L.mask[face.grid+j*face.nu+i],'final source floor is a legitimate paint cell');
   const sourceObject=L.manifest.objects[L.triangleWorld.objectIds[support.triangle]].name;
   assert.match(sourceObject,/^Fld_Twist00_FloorTrim/);
   cases.push({team:a.team,bot,hz,seconds,start:edge.drop.upper,firstTouchdown,end:a.pos.toArray(),finalNode:goal.toArray(),verticalError:Math.abs(a.pos.y-goal.y),handlerCompleted:bot?true:null,sourceTriangle:support.triangle,sourceObject,weapon:'shooter / Shooter_Normal_00',gearAP:0,form:a.form,ordinaryMoveGravity:true,productionCharacter:true,alive:true,grounded:true});
  }
 }
 assert.equal(hash(),before,'all source collision and mask references remain immutable');
 const result={id:'shipshape',sourceSha256:L.manifest.sourceSha256,version1130Verified:false,departures,cases,sourceBuffersUnchanged:true};console.log(JSON.stringify(result));
 if(process.env.SHIPSHAPE_DROP_REPORT)fs.writeFileSync(process.env.SHIPSHAPE_DROP_REPORT,JSON.stringify(result,null,2)+'\n');
});
