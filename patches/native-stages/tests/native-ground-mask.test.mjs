import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,geometry} from './fixtures/bvh-query-fixture.mjs';

const f=await setup(),down=f.V(0,-1,0);
const flatten=h=>h&&({triangle:h.triangle,distance:h.distance,point:h.point.toArray(),normal:h.normal.toArray(),u:h.u,v:h.v,flags:h.flags,object:h.object});

test('sparse ground masks preserve scalar hits, counters and the 30-ray boundary',()=>{
 const scalar=new f.CurrentWorld(geometry()),batch=new f.CurrentWorld(geometry());
 let seed=84589;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const count of [0,1,2,9,17,30,31])for(let run=0;run<120;run++){
  const points=Array.from({length:count},(_,i)=>f.V(
   i%4===0?100:(random()-.5)*10,random()*7-1,(random()-.5)*10));
  if(count>3&&run%5===0)points[3].x=NaN;
  if(count>5&&run%7===0)points[5].y=Infinity;
  const outputs=points.map(()=>({point:f.V(91,92,93),normal:f.V(94,95,96)}));
  const options={ignoreGrates:!!(run%2),minNormalY:[-2,.68,1.01][run%3]};
  const far=run%11===0?NaN:run%13===0?Infinity:random()*8+.001;
  const expected=points.map(p=>flatten(scalar.ray(p,down,far,options)));
  batch.rayDownBatch(points,far,options,outputs);
  assert.deepEqual(outputs.map(h=>h.hit?flatten(h):null),expected);
  assert.equal(batch.queryCount,scalar.queryCount);
  assert.equal(batch.triangleTests,scalar.triangleTests);
  for(let i=0;i<count;i++)if(!outputs[i].hit){
   assert.deepEqual(Array.from(outputs[i].point.toArray()),[91,92,93]);
   assert.deepEqual(Array.from(outputs[i].normal.toArray()),[94,95,96]);
  }
  assert.equal(batch._queryDepth,0);
 }
});

test('sparse ground masks retain early-hit scalar fallback and recover after an exception',()=>{
 const world=new f.CurrentWorld(geometry());
 const points=Array.from({length:30},(_,i)=>f.V(i===29?0:100,4,0));
 const outputs=points.map(()=>({point:f.V(),normal:f.V()}));
 const expected=points.map(p=>world.ray(p,down,8,{anyHit:true}));
 world.rayDownBatch(points,8,{anyHit:true},outputs);
 assert.deepEqual(outputs.map(h=>h.hit),expected.map(Boolean));
 const nodes=world.nodes;
 world.nodes=new Proxy(nodes,{get(target,key){if(key==='0')throw Error('ground node failure');return target[key];}});
 assert.throws(()=>world.rayDownBatch(points,8,{},outputs),/ground node failure/);
 assert.equal(world._queryDepth,0);
 world.nodes=nodes;
 world.rayDownBatch(points,8,{},outputs);
 assert.equal(outputs[29].hit,true);
 assert(outputs.slice(0,29).every(h=>!h.hit));
});
