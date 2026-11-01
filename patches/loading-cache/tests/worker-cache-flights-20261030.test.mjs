import test from 'node:test';
import assert from 'node:assert/strict';
import {World,makeBuild,REV_A,REV_B} from './worker-fixture.mjs';
const prefix='inkwave-startup-v2:/actions/:';
const path=(revision,rel='src/main.js')=>`_versions/${revision}/${rel}`;
async function setup(){
 const world=new World(),build=makeBuild();world.serve(build);const worker=world.worker(build);await worker.install();await worker.activate();world.resetStats();
 const counts={open:0,match:0,keys:0},open=world.caches.open,keys=world.caches.keys;
 world.caches.open=async name=>{counts.open++;await new Promise(r=>setTimeout(r,2));const cache=await open(name),match=cache.match;return {...cache,match:async req=>{counts.match++;return match(req);}};};
 world.caches.keys=async()=>{counts.keys++;await new Promise(r=>setTimeout(r,2));return keys();};
 return{world,build,worker,counts};
}
for(const miss of [false,true])test(`current ${miss?'miss':'hit'} overlaps share open and same-URL match; streams remain independent`,async()=>{
 const {world,build,worker,counts}=await setup();const rel=path(REV_A);
 if(miss)world.maps.get(prefix+REV_A).delete(world.url(rel));
 const responses=await Promise.all(Array.from({length:20},()=>worker.request(rel)));
 assert.equal(counts.open,1);assert.equal(counts.match,1);assert.equal(world.fetches.length,miss?1:0);
 for(const {response}of responses)assert.equal(await response.text(),build.bodies['src/main.js']);
 await worker.request(rel);assert.equal(counts.open,2);assert.equal(counts.match,2,'a completed flight never caches a presence assertion');
});
test('different current URLs overlap only cache open; no URL or response cross-wiring',async()=>{
 const {worker,counts,build}=await setup();const keys=Object.keys(build.bodies);
 const results=await Promise.all(keys.map(rel=>worker.request(path(REV_A,rel))));
 assert.equal(counts.open,1);assert.equal(counts.match,2);
 for(let i=0;i<keys.length;i++)assert.equal(await results[i].response.text(),build.bodies[keys[i]]);
});
test('retained revision probe/open is shared only in flight and every URL retains independent lookup',async()=>{
 const {world,build,counts}=await setup();const next=makeBuild(REV_B);world.serve(next);const worker=world.worker(next);
 const responses=await Promise.all(Array.from({length:20},(_,i)=>worker.request(path(REV_A,i%2?'profile.json':'src/main.js'))));
 assert.equal(counts.keys,1);assert.equal(counts.open,1);assert.equal(counts.match,20);
 for(let i=0;i<responses.length;i++)assert.equal(await responses[i].response.text(),build.bodies[i%2?'profile.json':'src/main.js']);
 world.maps.delete(prefix+REV_A);await worker.request(path(REV_A));assert.equal(counts.keys,2);assert.equal(counts.open,1);assert.equal(world.fetches.length,1);
});
test('storage rejection, integrity rejection and quota failure release flights and permit fresh retries',async()=>{
 const {world,worker,build}=await setup();const rel=path(REV_A);world.failOpen=true;
 const responses=await Promise.all([worker.request(rel),worker.request(rel)]);for(const x of responses)assert.equal(await x.response.text(),build.bodies['src/main.js']);
 world.failOpen=false;world.maps.get(prefix+REV_A).delete(world.url(rel));world.route(rel,'corrupt');
 await assert.rejects(worker.request(rel),/integrity/);world.serve(build);world.failPut=()=>true;
 assert.equal(await(await worker.request(rel)).response.text(),build.bodies['src/main.js']);
 world.failPut=null;assert.equal(await(await worker.request(rel)).response.text(),build.bodies['src/main.js']);
 assert(world.maps.get(prefix+REV_A).has(world.url(rel)));
});
