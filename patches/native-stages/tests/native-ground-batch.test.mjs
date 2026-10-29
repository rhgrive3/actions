import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,geometry} from './fixtures/bvh-query-fixture.mjs';

const flatten=h=>h&&({triangle:h.triangle,distance:h.distance,point:h.point.toArray(),normal:h.normal.toArray(),u:h.u,v:h.v,flags:h.flags,object:h.object});
const ground=h=>({...h,normal:h.normal.toArray()});
const f=await setup(),V=f.V,down=V(0,-1,0);
const points=Array.from({length:9},()=>V()),outputs=Array.from({length:9},()=>({point:V(),normal:V()}));
let seed=73129;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function footprint(x,y,z,foot){
 points[0].set(x,y,z);for(let i=0;i<8;i++){const a=i/8*Math.PI*2;points[i+1].set(x+Math.cos(a)*foot,y,z+Math.sin(a)*foot);}return points;
}

test('one masked ground traversal preserves every independent ray, tie, grate and counter',()=>{
 const a=new f.CurrentWorld(geometry()),b=new f.CurrentWorld(geometry());
 for(let n=0;n<3500;n++){
  const x=n<40?[-4-1e-10,-4,-0,0,4,4+1e-10][n%6]:(random()-.5)*12;
  footprint(x,random()*7-1,(random()-.5)*12,random()*.8);
  const far=random()*7+.001,options={ignoreGrates:!!(n%2),minNormalY:[-2,.62,.68,1.1][n%4]};
  const expected=points.map(p=>flatten(a.ray(p,down,far,options)));
  b.rayDownBatch(points,far,options,outputs);
  assert.deepEqual(outputs.map(h=>h.hit?flatten(h):null),expected);
  assert.equal(b.queryCount,a.queryCount);assert.equal(b.triangleTests,a.triangleTests);
 }
 for(const far of [0,-1,Infinity,NaN]){
  const expected=points.map(p=>flatten(a.ray(p,down,far)));
  b.rayDownBatch(points,far,{},outputs);assert.deepEqual(outputs.map(h=>h.hit?flatten(h):null),expected);
 }
 assert.equal(b._queryDepth,0);
});

test('native batched footprint matches inherited source/dynamic support selection exactly',()=>{
 const a=f.make(),b=f.make();
 // A genuine moving box above the source floor covers dynamic precedence.
 for(const state of [a,b]){
  const id=state.level.blocks.length;
  state.level.blocks.push({id,solid:true,grate:false,center:V(0,3,0),half:V(.45,.15,.45),aabbMin:V(-.45,2.85,-.45),aabbMax:V(.45,3.15,.45),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]});
 }
 const expected={normal:V()},actual={normal:V()};
 for(let n=0;n<2500;n++){
  const args=[(random()-.5)*9,random()*5,(random()-.5)*9,.2+random(),.2+random(),random()*.6];
  f.Physics.prototype.groundProbe.call(a.physics,...args,expected,!!(n%2),.12);
  b.physics.groundProbe(...args,actual,!!(n%2),.12);
  assert.deepEqual(ground(actual),ground(expected));
 }
 let calls=0;const original=b.physics.raycast;
 b.physics.raycast=function(...args){calls++;return original.apply(this,args);};
 b.physics.groundProbe(0,3,0,1,3,.3,actual);assert.equal(calls,9,'custom ray owners retain sequential dispatch');
});

test('batch misses keep owned hit vectors and options/overrides retain scalar contracts',()=>{
 const w=new f.CurrentWorld(geometry());footprint(0,4,0,.3);
 w.rayDownBatch(points,8,{},outputs);const saved=outputs.map(h=>flatten(h));
 footprint(100,4,100,.3);w.rayDownBatch(points,8,{},outputs);
 assert(outputs.every(h=>!h.hit));assert.deepEqual(outputs.map(h=>flatten(h)),saved);
 let calls=0;const ray=w.ray;w.ray=function(...args){calls++;return ray.apply(this,args);};
 w.rayDownBatch(points,8,{},outputs);assert.equal(calls,9);
 assert.equal(w._queryDepth,0);
});
