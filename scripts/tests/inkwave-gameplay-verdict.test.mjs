import test from 'node:test';
import assert from 'node:assert/strict';
import {gameplayVerdict,validateLifecycleExpectation} from '../lib/inkwave-gameplay-verdict.mjs';

test('a valid measurement cannot pass a leaking or missing Crab retirement receipt by default',()=>{
 for(const lifecycleStatus of ['leak-observed',undefined,null])assert.equal(gameplayVerdict({errors:[],crabLifecycle:true,lifecycleStatus}),'failed');
 assert.equal(gameplayVerdict({errors:[],crabLifecycle:true,lifecycleStatus:'released'}),'passed');
});
test('a defect baseline must explicitly expect the observed leak and still rejects other failures',()=>{
 const baseline={errors:[],crabLifecycle:true,expectedLifecycle:'leak-observed'};
 assert.equal(gameplayVerdict({...baseline,lifecycleStatus:'leak-observed'}),'passed');
 assert.equal(gameplayVerdict({...baseline,lifecycleStatus:'released'}),'failed');
 assert.equal(gameplayVerdict({...baseline,lifecycleStatus:'leak-observed',errors:['WebGL context lost']}),'failed');
});
test('normal gameplay measurement errors remain fatal and invalid expectations cannot disable the gate',()=>{
 assert.equal(gameplayVerdict({errors:[]}), 'passed');
 assert.equal(gameplayVerdict({errors:['invalid combat window']}),'failed');
 for(const expectedLifecycle of ['',null,'any','passed'])assert.throws(()=>gameplayVerdict({errors:[],expectedLifecycle}),RangeError);
 assert.throws(()=>gameplayVerdict({errors:null}),TypeError);
});

test('a lifecycle expectation requires Crab mode and an explicit nonempty value',()=>{
 assert.equal(validateLifecycleExpectation('released',false),'released');
 for(const expected of ['released','leak-observed']){
  assert.equal(validateLifecycleExpectation(expected,true,true),expected);
  assert.throws(()=>validateLifecycleExpectation(expected,false,true),RangeError);
 }
 for(const expected of [undefined,null,'','--mobile'])assert.throws(()=>validateLifecycleExpectation(expected,true,true),RangeError);
 assert.throws(()=>gameplayVerdict({errors:[],expectedLifecycle:'leak-observed'}),RangeError);
});
