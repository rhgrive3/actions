// Pure contract tests only. These are NOT browser/gameplay execution evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DUALIES_PHASES,DUALIES_BASELINE_SHA,horizontalTravel,assertDualiesSample} from '../lib/reticle-next/dualies-recipe.mjs';
const sample=()=>({weaponId:'dualies',kind:'dualies',hudWeapon:'dualies',hudKind:'dualies',frozen:true,visible:true,
 position:[23,.05,6],charging:false,charge:0,sourceFrames:{startup:4,roll:12,gate:4,lock:32},
 twins:[{radius:6.2},{radius:6.2}],classes:['iw-ret--dualies'],mergedRadius:6.2,
 fire:false,dodge:null,s3Turret:false,lockT:0,shotGate:0,fireStartup:0,events:[],keys:{KeyA:false,KeyD:false,Space:false},observedKick:false});
test('immutable official baseline and nine native phases',()=>{
 assert.equal(DUALIES_BASELINE_SHA,'e0072a749df0ec8c2d368e383bdf337baa7b44ad');
 assert.equal(DUALIES_PHASES.length,9);assert.equal(new Set(DUALIES_PHASES).size,9);assert(Object.isFrozen(DUALIES_PHASES));
});
test('pure distance helper measures actual horizontal coordinates',()=>{
 assert.equal(horizontalTravel([23,0,6],[23,7,6]),0);
 assert.equal(horizontalTravel([23,0,6],[23.02,0,6])>.01,true);
});
test('idle read contract rejects wrong weapon, source timing or out-of-pad position',()=>{
 assertDualiesSample(sample(),'idle');
 for(const patch of [{weaponId:'s3-maneuver-normal'},{sourceFrames:{startup:4,roll:18,gate:4,lock:32}},{position:[0,0,6]}])
  assert.throws(()=>assertDualiesSample({...sample(),...patch},'idle'));
});
test('actual turret AND native is-lock gate candidate13; baseline stays6.2',()=>{
 const held={...sample(),fire:true,s3Turret:true,classes:['iw-ret--dualies','is-lock'],mergedRadius:13};
 assertDualiesSample(held,'held-after-lock');
 assertDualiesSample({...held,mergedRadius:6.2},'held-after-lock',{before:true});
 assert.throws(()=>assertDualiesSample({...held,s3Turret:false},'held-after-lock'));
 assert.throws(()=>assertDualiesSample({...held,twins:[{radius:13},{radius:6.2}]},'held-after-lock'));
});
test('held fire alone is not accepted fire evidence and startup emits nothing',()=>{
 const startup={...sample(),fire:true,fireStartup:4/60};assertDualiesSample(startup,'fire-startup');
 assert.throws(()=>assertDualiesSample({...startup,events:[{tick:1}]},'fire-startup'));
 assert.throws(()=>assertDualiesSample({...sample(),fire:true},'firing'));
 const fired={...sample(),fire:true,events:[{tick:5,hand:1}],observedKick:true};assertDualiesSample(fired,'firing');
 assert.throws(()=>assertDualiesSample({...fired,observedKick:false},'firing'));
});
test('native post-roll gate and released trigger have separate predicates',()=>{
 const gate={...sample(),fire:true,s3Turret:true,lockT:32/60,shotGate:4/60,classes:['is-lock'],mergedRadius:13};
 assertDualiesSample(gate,'post-roll-gate');assert.throws(()=>assertDualiesSample({...gate,shotGate:0},'post-roll-gate'));
 assertDualiesSample(sample(),'release');assert.throws(()=>assertDualiesSample({...sample(),fire:true},'release'));
});
