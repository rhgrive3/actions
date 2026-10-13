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
 }assert.equal(hash(),before);console.log(JSON.stringify({id:'robo',cases,sourceUnchanged:true}));
});
