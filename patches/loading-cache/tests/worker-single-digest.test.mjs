import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {World,makeBuild,REV_A} from './worker-fixture.mjs';
const prefix='inkwave-startup-v2:/actions/:';
function countDigests(worker){const calls=[];worker.context.crypto={subtle:{digest:async(...args)=>{calls.push(args[1].byteLength);return crypto.webcrypto.subtle.digest(...args);}}};return calls;}
test('fresh install hashes HTML and each valid immutable asset exactly once',async()=>{
 const world=new World(),build=makeBuild();world.serve(build);const worker=world.worker(build),calls=countDigests(worker);
 await worker.install();assert.equal(calls.length,1+build.config.precache.length);
 assert.deepEqual(calls.sort((a,b)=>a-b),[build.index.length,...Object.values(build.bodies).map(x=>Buffer.byteLength(x))].sort((a,b)=>a-b));
});
test('concurrent runtime misses share one verified response and one digest',async()=>{
 const world=new World(),build=makeBuild();world.serve(build);const worker=world.worker(build);await worker.install();await worker.activate();
 const rel=`_versions/${REV_A}/src/main.js`;world.maps.get(prefix+REV_A).delete(world.url(rel));world.resetStats();const calls=countDigests(worker);
 const responses=await Promise.all([worker.request(rel),worker.request(rel)]);
 assert.equal(calls.length,1);assert.equal(world.fetches.length,1);assert.equal(world.puts.length,1);
 for(const {response}of responses)assert.equal(await response.text(),build.bodies['src/main.js']);
});
test('unverified non-200 success and permanent server errors are never cached',async()=>{
 for(const status of [201,500]){
  const world=new World(),build=makeBuild();world.serve(build);const worker=world.worker(build);await worker.install();await worker.activate();
  const rel=`_versions/${REV_A}/src/main.js`;world.maps.get(prefix+REV_A).delete(world.url(rel));world.route(rel,'wrong body',status);world.resetStats();
  if(status===201)await assert.rejects(worker.request(rel),/Uncacheable/);
  else assert.equal((await worker.request(rel)).response.status,status);
  assert.equal(world.puts.length,0);assert.equal(world.maps.get(prefix+REV_A).has(world.url(rel)),false);
 }
});
