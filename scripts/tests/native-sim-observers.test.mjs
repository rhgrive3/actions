import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_SIM_PHYSICS_METHODS,NATIVE_SIM_BVH_METHODS} from '../lib/native-sim-observers.mjs';
import {setup,geometry} from '../../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';

const f=await setup();

test('simulation observers preserve native ground batching and Boolean LOS routes',()=>{
 const level=new f.NativeLevel(geometry()),physics=new f.NativePhysics(level),world=level.triangleWorld;
 const raycast=physics.raycast,ray=world.ray,calls={};
 for(const [owner,names]of [[physics,NATIVE_SIM_PHYSICS_METHODS],[world,NATIVE_SIM_BVH_METHODS]])for(const name of names){
  const native=owner[name];if(typeof native!=='function')continue;
  owner[name]=function(...args){calls[name]=(calls[name]||0)+1;return native.apply(this,args);};
 }
 assert.equal(physics.raycast,raycast);assert.equal(world.ray,ray);assert.equal(world.hasCanonicalRay(),true);
 physics.groundProbe(0,3,0,.35,.7,.28,new f.GroundHit());
 assert.equal(calls.rayDownBatch,1,'profiler keeps the real batched footprint path');
 assert.ok(physics._groundBatch);
 physics.los(f.V(0,3,0),f.V(0,-1,0));
 assert.equal(physics._nativeLosOptions?.anyHit,true,'profiler keeps native Boolean occlusion');
});

test('historical ray wrappers force the scalar path and are a detectable negative control',()=>{
 const level=new f.NativeLevel(geometry()),physics=new f.NativePhysics(level),world=level.triangleWorld;
 const native=physics.raycast;let scalarCalls=0,batchCalls=0;
 physics.raycast=function(...args){scalarCalls++;return native.apply(this,args);};
 const batch=world.rayDownBatch;world.rayDownBatch=function(...args){batchCalls++;return batch.apply(this,args);};
 physics.groundProbe(0,3,0,.35,.7,.28,new f.GroundHit());
 assert.equal(batchCalls,0);assert.equal(scalarCalls,9);
 physics.los(f.V(0,3,0),f.V(0,-1,0));
 assert.equal(physics._nativeLosOptions,undefined);
});
