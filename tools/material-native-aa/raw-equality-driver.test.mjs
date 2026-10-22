import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepare,inverse,OLD,NEW} from './raw-equality-driver.mjs';
import {retainedPaired as input} from './diagnostic-fixture.mjs';
const output=prepare(input);

const old=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
const cycle={};cycle.self=cycle;const cycle2={};cycle2.self=cycle2;
const cases=[[{a:1},{a:1}],[{a:1},{a:2}],[{uuid:'a'},{uuid:'b'}],[NaN,NaN],[-0,0],[undefined,null],[[1,2],[2,1]],[new Uint8Array([1]),new Uint8Array([2])],[new Float32Array([1]),new Uint32Array([1])],[{a:undefined},{}],[new Map([['a',1]]),new Map([['a',2]])],[cycle,cycle2],[Object.create(null),{}]];
for(const [i,[a,b]] of cases.entries())test('strict boolean parity '+i,()=>assert.equal(isDeepStrictEqual(a,b),old(a,b)));
test('exact inverse, one replacement, original semantic and pixel gates retained',()=>{
 assert.equal(inverse(output),input);assert.equal(input.split(OLD).length,2);assert.equal(output.split(NEW).length,2);
 for(const needle of ["assert.deepEqual(b.normalized,a.normalized", "assert.deepEqual(a,b,'strict non-identity",'requireReplayPixels(a2.images[i],a1.images[i])','aaPreflightSequentialAccepted'])assert.equal(output.includes(needle),true);
});
test('input drift rejected',()=>assert.throws(()=>prepare(input+'\n')));
test('actual extracted function keeps raw mismatch distinct from semantic acceptance',()=>{
 const extract=s=>s.slice(s.indexOf('function compareReplaySemanticCondition('),s.indexOf('\nfunction requireReplayIdentityCoverage('));
 // Isolate the raw comparison change; normalized comparison stub models verified semantic UUID remapping.
 const compareSemanticSnapshots=(a,b)=>({rawEqual:JSON.stringify(a)===JSON.stringify(b),rawIdsEqual:a.id===b.id,semanticEqual:a.value===b.value,before:{normalized:{value:a.value}},after:{normalized:{value:b.value}}});
 const run=(source,a,b)=>vm.runInNewContext('('+extract(source)+')(actual,expected)',{assert,isDeepStrictEqual,structuredClone,compareSemanticSnapshots,actual:a,expected:b});
 const make=id=>({clock:5,renderStates:Array.from({length:4},()=>Object.fromEntries(['before','afterRender','after'].map(p=>[p,{id,value:1}])))});
 for(const mutation of [x=>{},x=>{x.clock=6;},x=>{x.renderStates[2].after.value=2;}]){const a=make('a'),b=make('b');mutation(b);assert.equal(JSON.stringify(run(input,a,b)),JSON.stringify(run(output,a,b)));}
});
