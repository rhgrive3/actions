import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';

const baseline=process.env.INKWAVE_ROLLER_FAST_PATH_BASELINE;
const f=await fixture({productionComposition:true,
 extraExports:"export {rollerDrumSupport} from './patches/splatoon3/runtime/roller.mjs';export {traceRollingFloor} from './patches/splatoon3/runtime/rolling-floor.mjs';",
 adaptRuntime:(rel,code)=>baseline&&rel==='patches/splatoon3/runtime/roller.mjs'?fs.readFileSync(baseline,'utf8'):code});
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
const flat=[{kind:'box',min:[-4,-.5,-4],max:[4,0,4]}];
function world(single=flat,{pos=[0,.05,0],yaw=0,grounded=true}={}){
 const level=new f.Level({bounds:{minX:-8,maxX:8,minZ:-8,maxZ:16},spawnPads:[[-3,0,0],[3,0,0]],spawnBarrier:0,half:[],single});
 const physics=new f.Physics(level),hit=new f.Hit();physics.raycast(V(pos[0],pos[1]+3,pos[2]),V(0,-1,0),10,hit,true);assert(hit.hit);
 const actor={pos:V(...pos),yaw,grounded,ground:{hit:true,face:hit.face}};
 const scratch={ids:[],start:V(),delta:V(),contactPoint:V(),wallPoint:V()};
 const count={queries:0,height:0,rays:0},query=level.queryBlocks,height=level.groundHeight,ray=physics.raycast;
 level.queryBlocks=function(...args){count.queries++;return query.apply(this,args);};
 level.groundHeight=function(...args){count.height++;return height.apply(this,args);};
 physics.raycast=function(...args){count.rays++;return ray.apply(this,args);};
 return {level,physics,actor,scratch,count,G:{physics}};
}
const support=w=>f.rollerDrumSupport(w.actor,w.G,w.scratch);

test('actual flat stage with 5cm pose clearance uses height query without surface tracing',()=>{
 const w=world();assert.deepEqual(structuredClone(support(w)),{floor:true,wall:false,supported:true});
 assert.equal(w.count.height,1);assert.equal(w.count.rays,0,'no continuous-path confirmation ray');
 assert.equal(w.count.queries,2,'capsule broad phase + cheap floor column only');
 assert.equal(w.scratch.floorContact,undefined,'no continuous-path scratch/collection is allocated');
});

test('descending ramp still invokes continuous support when the cheap height differs',()=>{
 const w=world([{kind:'ramp',low:[0,0,0],high:[0,8,8],width:8,thickness:.5}],{pos:[0,4.05,4],yaw:Math.PI});
 assert.equal(support(w).floor,true);assert.equal(w.count.height,1);assert.equal(w.count.rays,1,'real ramp contact is confirmed');
 assert(w.scratch.floorContact,'slope retains continuous collision tracing');
});

test('cliff over lower ground and airborne state retain unsupported admission',()=>{
 const single=[{kind:'box',min:[-4,-.5,-4],max:[4,0,.2]},{kind:'box',min:[-4,-3.5,-4],max:[4,-3,4]}];
 const cliff=world(single);assert.equal(support(cliff).supported,false);assert.equal(cliff.count.height,1);assert(cliff.scratch.floorContact,'continuous path checks the ledge');
 const air=world(flat,{grounded:false});assert.equal(support(air).supported,false);assert.equal(air.count.height,0);assert.equal(air.count.rays,0);
});

test('cheap coplanar support cannot authorize paint across a real centre-path gap',()=>{
 const w=world([{kind:'box',min:[-4,-.5,-4],max:[4,0,.2]},{kind:'box',min:[-4,-.5,.21],max:[4,0,4]}]);
 // The pre-existing cheap support fallback also accepts this destination.
 // Paint has an independent, unchanged continuity gate; support is not paint.
 assert.equal(support(w).floor,true);assert.equal(w.count.rays,0);
 const contact={point:V(),origin:V(),down:V(),hit:new f.Hit()};
 assert.equal(f.traceRollingFloor(w.actor,V(0,0,.75),w.level,w.physics,contact),undefined,'no paint contact across the missing collision strip');
});

test('short flat support call-count sample removes per-tick trace work',()=>{
 const w=world(),iterations=4096,start=performance.now();
 for(let i=0;i<iterations;i++)assert.equal(support(w).floor,true);
 const elapsedMs=performance.now()-start;
 console.log(JSON.stringify({scope:'real Level/Physics; stationary flat support micro-sample, not device FPS',baseline:!!baseline,iterations,elapsedMs,...w.count,traceScratch:!!w.scratch.floorContact}));
 assert.equal(w.count.rays,0);assert.equal(w.count.height,iterations);assert.equal(w.count.queries,iterations*2);
});
