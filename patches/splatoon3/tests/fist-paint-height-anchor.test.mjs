import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
import {tickTripleSlamFists,tripleSlamFistCenters,FIST_STAMP_RADIUS} from '../runtime/triple-slam-fists.mjs';
function level(T,height) {
 const V=(...a)=>new T.Vector3(...a), faces=[],blocks=[];
 function floor(x,y,width) {
  const id=faces.length;
  faces.push({id,block:id,paintable:true,turf:true,wall:false,origin:V(x,y,-12),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:width,sv:32});
  blocks.push({id,solid:true,grate:false,center:V(x+width/2,y-.05,4),half:V(width/2,.05,16),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],aabbMin:V(x,y-.1,-12),aabbMax:V(x+width,y,20),faces:[id,-1,-1,-1,-1,-1]});
 }
 floor(-20,0,26);floor(6,height,14);
 return {faces,blocks,pointInside:()=>false,queryBlocks:()=>blocks.map((_,i)=>i),groundHeight:(x)=>x>6?height:0};
}
async function client(id,height,blocked=false) {
 const f=await fixture(),session=f.makeSession(id,'a',[['a','A'],['b','B']]);
 const nm=f.makeNetMatch(session,{id:'fist-height'}),actors=['a','b'].map((owner,nid)=>f.makeActor({nid,owner,remote:owner!==id,team:nid,roller:false}));
 f.G.match=f.bind(nm,actors);f.G.time=10;f.G.level=level(f.THREE,height);
 class CpuPaint extends f.PaintSystem {_initGPU(){} _pushQuad(){}}
 const paint=f.G.paint=new CpuPaint(null,f.G.level,{atlasSize:1024,maxDensity:8,cell:.25});
 if(blocked) {
  const V=(...a)=>new f.THREE.Vector3(...a);
  f.G.level.blocks.push({id:2,solid:true,grate:false,center:V(-1,2,2.05),half:V(1,2,.05),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],aabbMin:V(-2,0,2),aabbMax:V(0,4,2.1),faces:[-1,-1,-1,-1,-1,-1]});
 }
 f.G.physics=new f.Physics(f.G.level);f.G.projectiles={applyHit(){}};f.G.actors=[];
 const owner=actors[0];owner.alive=true;owner.addTurfNoSpecial=()=>{};
 return {f,nm,paint,owner};
}
function fire(c) {
 const origin={x:0,y:0,z:0};
 c.owner._s3TripleSlamFists={origin,centers:tripleSlamFistCenters(origin,0),remaining:0,scale:1};
 assert.equal(tickTripleSlamFists(c.owner,1/60,c.f.G,c.f.THREE),true);
 return c.nm.out.filter(e=>e[1]==='s');
}
function copyEvent(e) {const c=JSON.parse(JSON.stringify(e));if(Number.isSafeInteger(e._netTick)){c._netTick=e._netTick;c._netSeq=e._netSeq;}return c;}
for(const [name,height] of [['upper shelf',8],['low step',1],['drop edge',-8],['flat ground',0]]) {
 test(`fist cluster keeps its impact height over ${name}; native sender/receiver agree`,async()=>{
  const a=await client('a',height),b=await client('b',height),events=fire(a);
  assert.equal(events.length,38);assert.ok(events.every(e=>e[3]===.12),'all source stamps retain the central impact plane');
  assert.ok(events.every(e=>e[5]===FIST_STAMP_RADIUS),'ordinary radius admission is unchanged');
  b.nm._peer('a');for(const e of events)b.nm._play('a',copyEvent(e));
  assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));
  assert.deepEqual(Array.from(a.paint.counts),Array.from(b.paint.counts));
  const elevated=a.f.G.level.faces[1],cells=a.paint.grid.slice(elevated.grid,elevated.grid+elevated.nu*elevated.nv);
  if(height>0||height<-FIST_STAMP_RADIUS)assert.ok(cells.every(c=>c===0),'no relocated shelf or deep-cliff footprint');
  if(height===0)assert.ok(cells.some(c=>c!==0),'flat neighboring ground remains paintable');
 });
}
test('blocked fist keeps the existing center LOS gate and sends only the other 19 stamps',async()=>{
 const a=await client('a',8,true),b=await client('b',8,true),events=fire(a);
 assert.equal(events.length,19);assert.ok(events.every(e=>e[3]===.12));
 b.nm._peer('a');for(const e of events)b.nm._play('a',copyEvent(e));
 assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));
});
