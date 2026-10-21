import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {profileRangeAcceptanceSnapshot as observe} from '../inkwave-range-profile-acceptance.mjs';
function fixture(frames=24){
 const snapshot={mode:'practice',traceError:null,trace:{capturedFrames:frames,gpu:'unavailable',gpuSamples:0,latest:{id:24,stages:{paint:1,render:2}}}};
 const probe={snapshot:()=>snapshot,report:()=>JSON.stringify({schema:'inkwave-frame-trace-v1'})};
 return {env:{__inkwaveRangePerf:probe,__inkwave:{_rangeFrameProbe:probe},__G:{match:{range:{},state:'playing'}},performance:{now:()=>90001},document:{querySelector:()=>({})}},snapshot};
}
test('saved failure facts satisfy unchanged acceptance; legacy loop string is irrelevant',()=>{const {env}=fixture();env.__inkwave._loop=()=>{};const r=observe(env);assert.equal(r.collected,24);assert.equal(r.tracerRuntimeInstalled,true);assert.equal(env.__inkwaveRangeAcceptancePoll.reason,'snapshot-ready');assert.equal(env.__inkwaveRangeAcceptancePoll.probeMatchesFrameOwner,true);});
test('11 real frames remain pending; 12 pass without lowering threshold',()=>{const {env,snapshot}=fixture(11);assert.equal(observe(env),false);assert.equal(env.__inkwaveRangeAcceptancePoll.capturedFrames,11);snapshot.trace.capturedFrames=12;assert.equal(observe(env).collected,12);assert.equal(env.__inkwaveRangeAcceptancePoll.count,2);});
test('post-deadline frames do not rewrite the earlier predicate receipt',()=>{const {env,snapshot}=fixture(11);assert.equal(observe(env),false);const prior=structuredClone(env.__inkwaveRangeAcceptancePoll);snapshot.trace.capturedFrames=24;assert.equal(env.__inkwaveRangePerf.snapshot().trace.capturedFrames,24);assert.deepEqual(env.__inkwaveRangeAcceptancePoll,prior);});
test('intro with frames remains pending until playing',()=>{const {env}=fixture();env.__G.match.state='intro';assert.equal(observe(env),false);assert.equal(env.__inkwaveRangeAcceptancePoll.reason,'waiting-for-playing-range');env.__G.match.state='playing';assert.equal(observe(env).collected,24);});
test('no tracer never fabricates frames',()=>{const {env}=fixture();delete env.__inkwaveRangePerf;assert.equal(observe(env),false);assert.equal(env.__inkwaveRangeAcceptancePoll.capturedFrames,null);});
test('trace load errors remain explicit',()=>{const {env,snapshot}=fixture();snapshot.traceError='load failed';assert.deepEqual(observe(env),{traceError:'load failed'});assert.equal(env.__inkwaveRangeAcceptancePoll.reason,'trace-error');});
test('native owner mismatch is recorded rather than guessed from _loop source',()=>{const {env}=fixture();env.__inkwave._rangeFrameProbe={};observe(env);assert.equal(env.__inkwaveRangeAcceptancePoll.probeMatchesFrameOwner,false);});
test('serialized synchronous predicate works with Playwright null argument',()=>{const {env}=fixture();const ctx=vm.createContext(env);const r=vm.runInContext('('+observe.toString()+')(null)',ctx);assert.equal(r.collected,24);assert.equal(typeof r.then,'undefined');});
