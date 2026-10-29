import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/bvh-query-fixture.mjs';
const f=await setup(),V=f.V;
let seed=4973;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const reference=(physics,a,b)=>f.Physics.prototype.los.call(physics,a,b);
function moving(stage){
 const id=stage.level.blocks.length;stage.level.blocks.push({id,solid:true,grate:false,center:V(0,4,0),half:V(.2,1,.2),aabbMin:V(-.2,3,-.2),aabbMax:V(.2,5,.2),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]});
}
test('native any-hit LOS exactly matches nearest-hit LOS across source/moving geometry and endpoint guards',()=>{
 const old=f.make(),current=f.make();moving(old);moving(current);
 const pairs=[];
 for(let i=0;i<12000;i++)pairs.push([V((random()-.5)*15,random()*8-1,(random()-.5)*15),V((random()-.5)*15,random()*8-1,(random()-.5)*15)]);
 for(const distance of [0,1e-6,1e-4,.049999,.05,.050001,.1,1,8,Infinity,NaN])pairs.push([V(),V(distance,0,0)]);
 // Dynamic-only horizontal hit, origin inside box, tiny segment, source edge,
 // grate pass-through, no source floor, and invalid input remain unchanged.
 pairs.push([V(-2,4,0),V(2,4,0)],[V(0,4,0),V(2,4,0)],[V(3,3,3),V(3,3,3)],[V(-4,8,-4),V(-4,-2,-4)],[V(NaN,3,0),V(2,3,0)]);
 for(const [a,b]of pairs)assert.equal(current.physics.los(a,b),reference(old.physics,a,b));
 assert(current.world.triangleTests<old.world.triangleTests,'Boolean occlusion skips nearest-hit triangle work');
 assert.equal(current.world._queryDepth,0);
 const allocated=current.physics._nativeLosOptions;current.physics.los(V(0,8,0),V(0,-2,0));assert.equal(current.physics._nativeLosOptions,allocated);
});

test('raycast and source-ray overrides retain inherited LOS dispatch and side effects',()=>{
 const {physics,world}=f.make();let calls=0;
 physics.raycast=(_a,_b,_d,out)=>{calls++;out.hit=true;return out;};
 assert.equal(physics.los(V(),V(2,0,0)),false);assert.equal(calls,1);
 const another=f.make();let sourceCalls=0;const ray=another.world.ray;
 another.world.ray=function(...args){sourceCalls++;assert.equal(args[3].anyHit,undefined);return ray.apply(this,args);};
 another.physics.los(V(0,8,0),V(0,-2,0));assert.equal(sourceCalls,1);
 let dynamicCalls=0;const dynamic=another.physics.dynamic.raycast;
 another.physics.dynamic.raycast=function(...args){dynamicCalls++;return dynamic.apply(this,args);};
 another.physics.los(V(0,8,0),V(0,-2,0));assert.equal(dynamicCalls,1);
});
