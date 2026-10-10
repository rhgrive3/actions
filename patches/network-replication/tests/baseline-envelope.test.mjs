import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBaselineProjectileEvent} from '../../../scripts/check-inkwave-network-comparison.mjs';
test('native27 baseline removes only the known two empty Kit fields before timestamping',()=>{
 const e=['p',...Array.from({length:25},(_,i)=>i),0,0],before=[...e];
 const native=nativeBaselineProjectileEvent(e);
 assert.deepEqual(native,e.slice(0,26));assert.equal(native.length+1,27);assert.deepEqual(e,before);
 for(const value of [1,'trizooka',null,undefined]){const bad=[...e];bad[26]=value;assert.throws(()=>nativeBaselineProjectileEvent(bad));}
 const action=[...e];action[27]=.5;assert.throws(()=>nativeBaselineProjectileEvent(action));
 for(const bad of [e.slice(0,27),[...e,0],['b',...e.slice(1)]])assert.throws(()=>nativeBaselineProjectileEvent(bad));
});


test('current native baseline validates InkFlight metadata before constructing the frozen native27 control',()=>{
 const fields=['p',...Array(25).fill(0)];
 for(const meta of [null,['iw-ink-flight-1','shooter',2,.25,false]]){
  const current=[...fields,meta,0,0],native=nativeBaselineProjectileEvent(current);
  assert.equal(native.length,26);assert.deepEqual(native,fields);assert.equal(current[26],meta);
 }
 for(const meta of [0,{},['iw-ink-flight-1','foreign',0,.5,false],['iw-ink-flight-1','shooter',-1,.5,false]])
  assert.throws(()=>nativeBaselineProjectileEvent([...fields,meta,0,0]));
});
