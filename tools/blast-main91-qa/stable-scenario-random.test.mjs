import test from 'node:test';
import assert from 'node:assert/strict';
import {installStableScenarioRandom} from './stable-scenario-random.mjs';
const scenario=0x42535431;
function setup(){const env={Math:{random:()=>0.25}};new Function('globalThis','('+installStableScenarioRandom.toString()+')();')(env);return env;}
function expected(seed,n){const out=[];let state=seed;for(let i=0;i<n;i++){state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;out.push(state/4294967296);}return {out,state};}
test('boot preserves original xorshift sequence and reset preserves function identity',()=>{
 const e=setup(),alias=e.Math.random,old=expected(0x49574b33,8);
 assert.deepEqual(Array.from({length:8},()=>alias()),old.out);
 const handle=e.__iwResetScenarioRandom(scenario),want=expected(scenario,8);
 assert.equal(e.Math.random,alias);assert.deepEqual(Array.from({length:8},()=>alias()),want.out);
 assert.deepEqual(handle.snapshot(),{seed:scenario,draws:8,state:want.state});
 assert.deepEqual(Object.keys(handle.snapshot()).sort(),['draws','seed','state']);
 assert.equal(handle.diagnostics().callers.length,8);
});
test('pre-reset cached alias ignores warmup length 10 versus 100',()=>{
 const run=warm=>{const e=setup(),alias=e.Math.random;for(let i=0;i<warm;i++)alias();const h=e.__iwResetScenarioRandom(scenario);return {values:Array.from({length:16},()=>alias()),snapshot:h.snapshot()};};
 assert.deepEqual(run(10),run(100));
});
test('legacy replacement counterexample is detected',()=>{
 const broken=warm=>{const e=setup(),alias=e.Math.random;for(let i=0;i<warm;i++)alias();e.Math.random=()=>0.75;return Array.from({length:4},()=>alias());};
 assert.notDeepEqual(broken(10),broken(100));
});
test('multiple resets retain completed receipts and reset all scenario state',()=>{
 const e=setup(),alias=e.Math.random,first=e.__iwResetScenarioRandom(scenario);alias();const before=first.snapshot();
 const next=e.__iwResetScenarioRandom(scenario);assert.deepEqual(next.snapshot(),{seed:scenario,draws:0,state:scenario});alias();
 assert.deepEqual(next.snapshot(),before);assert.deepEqual(first.snapshot(),before);
 for(let i=0;i<20;i++)alias();assert.equal(next.diagnostics().callers.length,12);
 const diag=next.diagnostics();diag.callers[0].stack.length=0;assert.ok(next.diagnostics().callers[0].stack.length>0);
});
test('identity replacement rejects reset, observation and repeated installation',()=>{
 const e=setup(),h=e.__iwResetScenarioRandom(scenario);e.Math.random=()=>0.1;
 assert.throws(()=>e.__iwResetScenarioRandom(scenario),/identity replaced/);
 assert.throws(()=>h.snapshot(),/identity replaced/);
 assert.throws(()=>h.diagnostics(),/identity replaced/);
 assert.throws(()=>new Function('globalThis','('+installStableScenarioRandom.toString()+')();')(e),/identity replaced/);
});
test('invalid seeds rejected without altering active stream; uint32 boundaries accepted',()=>{
 const e=setup(),h=e.__iwResetScenarioRandom(scenario),before=h.snapshot();
 for(const seed of [NaN,Infinity,-Infinity,-1,0x100000000,1.5,'123',null,undefined])assert.throws(()=>e.__iwResetScenarioRandom(seed),/finite uint32/);
 assert.deepEqual(h.snapshot(),before);
 for(const seed of [0,0xffffffff]){const x=e.__iwResetScenarioRandom(seed);e.Math.random();assert.equal(x.snapshot().state,expected(seed,1).state);}
});
