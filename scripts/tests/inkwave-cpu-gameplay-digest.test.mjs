import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installCpuGameplayDigest} from '../lib/inkwave-cpu-gameplay-digest.mjs';
const fixture=()=>({actors:[{pos:{x:0,y:1,z:2},vel:{x:3,y:4,z:5},hp:100,ink:80,alive:true,grounded:true,yaw:.2,form:'kid',stats:{turf:12}}],paint:{counts:[4,5],version:2,growing:[],grid:[0,1,2],_paintOwnershipOrder:[2,1,0]}});
const factory=()=>{const realm=vm.createContext({});vm.runInContext('('+installCpuGameplayDigest.toString()+')()',realm);return realm.__iwCreateCpuGameplayDigest;};
const run=f=>{const d=factory()();d.step(f.actors,f.paint);return {frames:[...d.digests],final:d.finish(f.paint)};};
test('the actual renderer installer hashes reproducible finite gameplay and the real Actor.stats score',()=>{
 assert.deepEqual(run(fixture()),run(fixture()));
 for(const mutate of [f=>f.actors[0].stats.turf++,f=>f.actors[0].pos.x++,f=>f.actors[0].hp--,f=>f.actors[0].alive=false,f=>f.paint.counts[0]++,f=>f.paint.grid[0]++,f=>f.paint._paintOwnershipOrder[0]++]){
  const f=fixture();mutate(f);assert.notDeepEqual(run(f),run(fixture()));
 }
 const f=fixture();f.actors[0].pos.x=-0;assert.notDeepEqual(run(f),run(fixture()),'finite IEEE-754 state is retained without numeric normalization');
});
test('missing Actor.turf cannot stand in for the actual score, and nonfinite state fails closed',()=>{
 for(const mutate of [f=>{f.actors[0].turf=12;delete f.actors[0].stats;},f=>delete f.actors[0].stats.turf,f=>f.actors[0].pos.y=NaN,f=>f.actors[0].ink=Infinity,f=>f.paint.version=undefined]){
  const f=fixture();mutate(f);assert.throws(()=>run(f),/Non-finite gameplay digest value/);
 }
});
