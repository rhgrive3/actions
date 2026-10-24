import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{installDeterministicRollerRandom}from'../lib/inkwave-roller-qa-random.mjs';
test('pre-module QA reset rewinds the same random closure held by FX',()=>{
 const context=vm.createContext({});vm.runInContext('('+installDeterministicRollerRandom.toString()+')();globalThis.cachedRandom=Math.random',context);
 const sequence=()=>vm.runInContext('JSON.stringify(Array.from({length:16},()=>cachedRandom()))',context),a=sequence();sequence();vm.runInContext('__rollerQaRandom.reset()',context);assert.equal(sequence(),a);assert.equal(vm.runInContext('Math.random===cachedRandom',context),true);assert.equal(vm.runInContext('__rollerQaRandom.snapshot().draws',context),16);
});
