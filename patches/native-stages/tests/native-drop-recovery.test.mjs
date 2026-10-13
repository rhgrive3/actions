import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.NATIVE_DROP_RECOVERY_FIXTURE_ASSETS;
test('real Robo source incoming walk plants before an opted drop and completes its supported footprint goal',{skip:!root},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'robo'),hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=hash();data.manifest.sourceNavigation={highDrops:true};const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);
 const from=G.nav.nodes[2418],edge=from.nb.find(e=>e.drop&&e.drop.direction[2]>.99);assert(edge);const goal=new THREE.Vector3(...edge.drop.landing),cases=[];
 for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];const a=new f.Actor({team:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(from.x,from.y,from.z-.8),0);a.invuln=0;G.actors=[a];const b=a.bot=new f.BotBrain(a,'normal');assert(b._pathTo(goal,.6));b.goalTimer=b.repath=b.bombCd=1000;
  let activation,departure,touchdown,air=false,released=false,completed=false,seconds=0,trace=[];
  for(let i=0;i<hz*8;i++){
   G.camera.position.copy(a.pos).add(new THREE.Vector3(0,2,6));G.time+=1/hz;const previousState=b._nativeDrop;b.update(1/hz);
   if(b._nativeDrop&&!activation)activation={position:a.pos.toArray(),velocity:a.vel.toArray(),phase:b._nativeDrop.phase};
   if(b._nativeDrop?.phase==='depart'&&!departure)departure={position:a.pos.toArray(),velocity:a.vel.toArray()};
   if(previousState&&!b._nativeDrop&&air){released=!!(!b.path);completed=!!(a.grounded&&f.nativeSourceFootSupported(G,a,G.nav.nodes[edge.to])&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<.35);trace.push({event:'release',released,completed,position:a.pos.toArray(),input:a.intent.move.toArray()});if(touchdown&&(released||completed))break;}
   a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(i+1)/hz;
   if(air&&a.grounded&&!touchdown){const h=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);touchdown={position:a.pos.toArray(),velocity:a.vel.toArray(),triangle:h.triangle,sourceHeight:h.point.y};}air ||=!a.grounded;
   if(i%Math.max(1,Math.floor(hz/5))===0)trace.push({seconds,position:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,phase:b._nativeDrop?.phase,path:b.path?.length,pi:b.pi});
   if(touchdown&&(released||completed))break;
  }
  assert(activation&&departure&&touchdown&&a.alive&&a.grounded&&(released||completed),JSON.stringify({hz,activation,departure,touchdown,end:a.pos.toArray(),phase:b._nativeDrop?.phase,path:b.path?.length,pi:b.pi}));assert(Math.hypot(...[departure.velocity[0],departure.velocity[2]])<.65,'ordinary plant removes incoming speed before the screened departure');assert(a.pos.z< -8,'source touchdown cannot continue blindly outward');assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);cases.push({hz,activation,departure,touchdown,released,completed,seconds,end:a.pos.toArray(),gearAP:0});
 }
 // Controlled grounded-contact states exercise the actual handler. These
 // source negatives are separate from the ordinary incoming-drop replay.
 const negativeActor=(position)=>{const a=new f.Actor({team:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(position,0);G.actors=[a];for(let i=0;i<60;i++){G.time+=1/60;a.update(1/60);}assert(a.alive&&a.grounded);return a;};
 const contact=(a,target=G.nav.nodes[edge.to])=>{const contactEdge={...edge,to:target.id,drop:{...edge.drop,landing:[target.x,target.y,target.z]}},nodes=G.nav.nodes,old=from.nb;from.nb=[contactEdge];const b=new f.BotBrain(a,'normal');b.path=[from.id,target.id];b.pi=1;b._nativeDrop={edge:contactEdge,path:b.path,phase:'depart',seconds:0,airborne:true,level:L,nav:G.nav,match:G.match,mode:G.match.mode};const position=a.pos.toArray(),velocity=a.vel.toArray();try{assert.equal(f.updateNativeDrop(b,G,1/60),true);assert.equal(b._nativeDrop,null);assert.equal(b.path,null);assert.equal(b.repath,0);assert.equal(b.goalTimer,0);assert.deepEqual(Array.from(a.intent.move.toArray()),[0,0,0]);assert.deepEqual(a.pos.toArray(),position);assert.deepEqual(a.vel.toArray(),velocity);}finally{from.nb=old;}return{position,footSupportedGoal:f.nativeSourceFootSupported(G,a,target),ordinaryStop:true,normalReplan:true};};
 const goalNode=G.nav.nodes[edge.to],negativeCases=[];
 const unsupported=negativeActor(new THREE.Vector3(goalNode.x,goalNode.y,goalNode.z));
 const higher={...goalNode,y:goalNode.y+1};G.nav.nodes.push(higher);higher.id=G.nav.nodes.length-1;negativeCases.push({kind:'unsupported goal height',...contact(unsupported,higher)});G.nav.nodes.pop();
 const noPaint=negativeActor(new THREE.Vector3(13.5,0,-10.5)),np=P.raycast(noPaint.pos.clone().setY(noPaint.pos.y+.1),new THREE.Vector3(0,-1,0),.3);
 assert(np.hit&&np.face===-1&&data.flags[np.triangle]===1,'the negative is an original real NoPaint slope');negativeCases.push({kind:'original NoPaint contact',sourceTriangle:np.triangle,...contact(noPaint)});
 const hole=negativeActor(new THREE.Vector3(goalNode.x,goalNode.y,goalNode.z)),h=P.raycast(hole.pos.clone().setY(hole.pos.y+.1),new THREE.Vector3(0,-1,0),.3),face=L.faces[h.face],local=h.point.clone().sub(face.origin),u=local.dot(face.u),v=local.dot(face.v),cell=face.grid+Math.max(0,Math.min(face.nv-1,Math.floor(v/face.cv)))*face.nu+Math.max(0,Math.min(face.nu-1,Math.floor(u/face.cu))),oldCell=L.mask[cell];
 assert.equal(oldCell,1);L.mask[cell]=0;try{negativeCases.push({kind:'masked source cell',sourceTriangle:h.triangle,...contact(hole)});}finally{L.mask[cell]=oldCell;}
 const dynamic=negativeActor(new THREE.Vector3(goalNode.x,goalNode.y,goalNode.z)),blockCount=L.blocks.length,faceCount=L.faces.length;
 L._addBlock({kind:'box',min:[goalNode.x+.12,goalNode.y+.2,goalNode.z-.08],max:[goalNode.x+.3,goalNode.y+.3,goalNode.z+.08],paint:false,hidden:true});
 try{for(let i=0;i<60;i++){G.time+=1/60;dynamic.update(1/60);}assert(dynamic.grounded);assert.equal(f.nativeSourceFootSupported(G,dynamic,goalNode),false);assert(dynamic._nativeWaypointGround.block>=L.staticBlockCount);assert(Math.abs(dynamic.pos.y-dynamic._nativeWaypointGround.y)<=.16);negativeCases.push({kind:'actual dynamic foot ring',supportBlock:dynamic._nativeWaypointGround.block,...contact(dynamic)});}finally{L.blocks.length=blockCount;L.faces.length=faceCount;}
 assert.equal(hash(),before);console.log(JSON.stringify({id:'robo',cases,negativeCases,sourceUnchanged:true}));
});

const slopeRoot=process.env.NATIVE_DROP_SLOPE_FIXTURE_ASSETS;
test('authentic Shipshape crane-slope drop plants on its real higher foot support and completes the lower source goal',{skip:!slopeRoot},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(slopeRoot,'shipshape'),digest=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=digest();
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();G.match.mode='zones';G.match.opts={};f.setRandom(()=>.5);
 const from=G.nav.nodes[28642];assert(Math.abs(from.y-5.1798441621614515)<1e-7&&from.x===-18.5&&from.z===63);const edge=from.nb.find(e=>e.drop&&e.drop.direction[2]<-.99);assert(edge,'original source-screened slope drop exists');
 const goal=new THREE.Vector3(...edge.drop.landing),sweep=f.nativeDropClearance(L),cases=[];
 for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();const a=new f.Actor({team:0,slot:1,name:'source slope drop',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(from.x,from.y,from.z),0);a.invuln=0;G.actors=[a];G.camera.position.copy(a.pos).add(new THREE.Vector3(0,2,6));
  for(let i=0;i<hz;i++){G.time+=1/hz;a.update(1/hz);}
  assert(a.alive&&a.grounded&&Math.abs(a.pos.y-from.y)>.16&&f.nativeSourceFootSupported(G,a,from));const planted=a.pos.toArray(),b=a.bot=new f.BotBrain(a,'normal');assert(b._pathTo(goal,.6));b.goalTimer=b.repath=b.bombCd=1000;
  let departed=false,airborne=false,finished=false,capsules=0,seconds=0;
  for(let i=0;i<hz*8;i++){
   G.time+=1/hz;const old=b._nativeDrop;b.update(1/hz);departed ||=b._nativeDrop?.phase==='depart';
   if(old&&!b._nativeDrop&&airborne&&a.grounded&&f.nativeSourceFootSupported(G,a,G.nav.nodes[edge.to])&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<.35){finished=true;break;}
   const previous=a.pos.clone();a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(i+1)/hz;airborne ||=!a.grounded;
   assert(sweep.clear(previous,a.pos,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height),'actual ordinary human capsule clears original slope departure');capsules++;
  }
  assert(departed&&airborne&&finished&&a.alive&&a.grounded,JSON.stringify({hz,planted,goal:goal.toArray(),end:a.pos.toArray(),phase:b._nativeDrop?.phase,path:b.path,pi:b.pi,seconds}));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);cases.push({hz,planted,centreHeight:from.y,heightDifference:planted[1]-from.y,goal:goal.toArray(),end:a.pos.toArray(),departed,airborne,handlerCompleted:finished,continuousHumanCapsules:capsules,seconds,gearAP:0});
 }
 assert.equal(digest(),before);console.log(JSON.stringify({id:'shipshape',cases,sourceUnchanged:true,scope:'Production Character/Actor/Brain isolated source kernel; raw30/60/120 distinct from Game FixedClock'}));
});

const obstructionRoot=process.env.NATIVE_DROP_OBSTRUCTION_FIXTURE_ASSETS;
test('a controlled Drop contact cannot walk between fitting original Manta floor endpoints through the retained source wall',{skip:!obstructionRoot},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(obstructionRoot,'manta'),L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 const start=new THREE.Vector3(-20,11.009400367736816,-18),goal=new THREE.Vector3(-17,11.009400367736816,-19);
 assert(P.bodyFits(start,.35,PLAYER.stepUp,PLAYER.height,false,.003)&&P.bodyFits(goal,.35,PLAYER.stepUp,PLAYER.height,false,.003));assert.equal(f.nativeDropClearance(L).clear(start,goal,.35,PLAYER.stepUp,PLAYER.height),false);
 const a=new f.Actor({team:0,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(start,0);G.actors=[a];G.camera.position.copy(start).add(new THREE.Vector3(0,2,6));for(let i=0;i<60;i++){G.time+=1/60;a.update(1/60);}assert(a.grounded);
 const target={id:1,x:goal.x,y:goal.y,z:goal.z,nb:[]},edge={to:1,drop:{upper:[-18,11.0094,-17.1028],landing:goal.toArray(),direction:[0,0,1]}},nav=G.nav={nodes:[{id:0,x:-18,y:11.0094,z:-17.1028,nb:[edge]},target]};assert(f.nativeSourceFootSupported(G,a,target));
 const b={a,path:[0,1],pi:1},position=a.pos.toArray(),velocity=a.vel.toArray();b._nativeDrop={edge,path:b.path,phase:'depart',seconds:0,airborne:true,level:L,nav,match:G.match,mode:G.match.mode};
 assert.equal(f.updateNativeDrop(b,G,1/60),true);assert.equal(b.path,null);assert.equal(b._nativeDrop,null);assert.deepEqual(Array.from(a.intent.move.toArray()),[0,0,0]);assert.deepEqual(a.pos.toArray(),position);assert.deepEqual(a.vel.toArray(),velocity);
 console.log(JSON.stringify({kind:'actual source obstruction with individually fitting endpoints',start:start.toArray(),goal:goal.toArray(),ordinaryStop:true,normalReplan:true,scope:'Controlled handler contact fixture with original source geometry, not a navigation admission or fall replay'}));
});
