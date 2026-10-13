import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_DROP_CACHE_FIXTURE_ASSETS;
test('authentic Humpback interior layer cannot suppress a farther supported departure',{skip:!root},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,data=readStage(root,'humpback');
 const hash=()=>{const h=crypto.createHash('sha256');for(const key of ['vertices','indices','triangles','flags','triangleFace','mask'])h.update(Buffer.from(data[key].buffer));return h.digest('hex');},before=hash();
 assert.equal(data.manifest.sourceSha256,'fcff18651320c4855b2af6278ad726aa7a8fbb4021c0329913163082a29e604d');
 data.manifest.sourceNavigation={wallClimb:true,highDrops:true};
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 const N=G.nav,nearest=p=>N.nodes.reduce((a,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2])?n:a,N.nodes[0]);
 const upper=nearest([-13.8,3,46.6]),interior=nearest([-13.8,0,45.6]),lower=nearest([-13.8,0,44.6]);
 for(const [n,p]of [[upper,[-13.8,3,46.6]],[interior,[-13.8,0,45.6]],[lower,[-13.8,0,44.6]]])assert.ok(Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<.001,'every candidate is an actual exported support');
 const nearGround=P.raycast(new THREE.Vector3(interior.x,upper.y+.1,interior.z),new THREE.Vector3(0,-1,0),.3);
 assert.ok(nearGround.hit&&Math.abs(nearGround.point.y-upper.y)<.001,'the nearer lower layer lies beneath intact source floor');
 N._nativeDropCache=new Map();assert.equal(f.nativeDropTransition(N,upper,interior),null);
 const edge=f.nativeDropTransition(N,upper,lower);assert.ok(edge,'a lower-dependent rejection must not poison the farther departure');
 assert.ok(Math.abs(N.nodes[edge.to].y)<.001);assert.equal(edge.drop.sourceTriangle,92193);
 N._nativeDropCache=new Map();const fresh=f.nativeDropTransition(N,upper,lower);
 assert.equal(JSON.stringify(edge),JSON.stringify(fresh),'ordered and fresh queries must admit exactly the same screened source trajectory');
 // The first reported two-cell frontier is different: its intermediate column
 // contains only an unplayable floor, so it was never a cache-order failure.
 const originalUpper=nearest([6.2,6,42.6]),originalLower=nearest([6.2,3.0001,40.6]);
 const column=N.nodes.filter(n=>Math.hypot(n.x-6.2,n.z-41.6)<.001);assert.ok(column.every(n=>!n.nativePaintable));
 const original=f.nativeDropTransition(N,originalUpper,originalLower);assert.ok(original);assert.equal(original.drop.sourceTriangle,94500);
 f.setRandom(()=>.5);const cases=[];
 for(const [departure,height]of [[edge,0],[original,3.0000998973846436]])for(const bot of [false,true])for(const hz of [30,60,120]){
  G.actors=[];G.projectiles.clear();G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
  const a=new f.Actor({team:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(new THREE.Vector3(...departure.drop.upper),Math.PI);G.actors=[a];a.intent.fire=a.intent.squid=a.intent.jump=false;
  const goal=new THREE.Vector3(...departure.drop.landing);let brain;if(bot){a.isBot=true;brain=a.bot=new f.BotBrain(a,'normal');assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;}else a.intent.move.fromArray(departure.drop.direction);
  let airborne=false,first=null,seconds=0;
  for(let i=0;i<hz*6;i++){
   G.time+=1/hz;brain?.update(1/hz);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);airborne ||=!a.grounded;seconds=(i+1)/hz;
   if(airborne&&a.grounded&&a.pos.y<departure.drop.upper[1]-1.25){
    if(first===null){const hit=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);assert.ok(hit.hit&&hit.face>=0);first=hit.triangle;}
    if(!bot||a.pos.distanceTo(goal)<.4)break;
   }
  }
  assert.ok(a.alive&&a.grounded&&Math.abs(a.pos.y-height)<.001&&first!==null&&(data.flags[first]&2),JSON.stringify({bot,hz,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,first,goal:goal.toArray()}));
  if(bot)assert.ok(a.pos.distanceTo(goal)<.4,'the ordinary bot continues from natural touchdown to the screened supported waypoint');
  assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);assert.equal(a.s3JumpSerial||0,0);
  cases.push({bot,hz,seconds,start:departure.drop.upper,end:a.pos.toArray(),firstSourceTriangle:first,screenedSourceTriangle:departure.drop.sourceTriangle,ordinaryWalkGravity:true,heldDirectionUntilTouchdownOrBotGoal:true,productionCharacter:true,grounded:true,gearAP:0});
 }
 assert.equal(hash(),before);console.log(JSON.stringify({id:'humpback',sourceSha256:L.manifest.sourceSha256,upper:upper.id,interior:interior.id,lower:lower.id,orderedAndFreshIdentical:true,originalColumnPlayableNodes:column.filter(n=>n.nativePaintable).length,nav:N.nodes.length,valid:N.validIds.length,cases,sourceBuffersUnchanged:true}));
});
