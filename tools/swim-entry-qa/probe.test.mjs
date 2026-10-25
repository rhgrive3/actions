import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {collectSwimEntryFrames,FRAME_NAMES,verifyRandomObservation} from './probe.mjs';
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
// Introspection only: the installed source/emitted owner advances the state.
const snapshot=ch=>{const s=Object.getPrototypeOf(ch)[Symbol.for('inkwave.s3.swim-motion.install.v1')]?.states.get(ch);return s?{active:true,age:s.age,yaw:s.yaw}:{active:false};};
test('real mobile consumer removes initial/reentry mantle snap and restores the fixture after capture failure',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>Math.random(),transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted swim test cannot use authored-source adaptation');}:undefined});f.swimMotionSnapshot=snapshot;
 const saved=Object.fromEntries(KEYS.map(k=>[k,f.G[k]])),children=[...f.G.scene.children];const originalRandom=Math.random,result=await collectSwimEntryFrames(f);assert.equal(verifyRandomObservation(result),true);assert.equal(Math.random,originalRandom);
 assert.deepEqual(result.rows.map(r=>r.name),FRAME_NAMES);assert.equal(result.rows.length,4);assert.equal(result.sourceBankAwaited,true);assert.equal(result.randomCalls,0,'source-only movement and cosmetic RNG do not consume gameplay randomness');assert.match(result.canonicalTraceHash,/^[a-f0-9]{64}$/);
 for(const r of result.rows){assert.equal(r.sourceActive,true);assert.equal(r.active,true);assert(Math.abs(r.heading-r.skinned.heading)<1e-6);if(r.name.includes('follow'))assert(Math.abs(r.headingStep)<.01,'skinned owner-entry step '+r.headingStep);else{assert.equal(r.age,0);assert(Math.abs(r.swimYaw-r.skinned.heading)<1e-6);}}
 for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);
 await assert.rejects(()=>collectSwimEntryFrames(f,()=>{throw Error('capture fault');}),/capture fault/);for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);
 // A real observation-window substitution must fail even when no draws occur.
 await assert.rejects(()=>collectSwimEntryFrames(f,()=>{Math.random=()=>.5;}),/RNG instrumentation replaced at afterCapture/);assert.equal(Math.random,originalRandom);
 // Deliberately exercise one call in this test callback, outside the production
 // case, to independently prove the installed counter and seed implementation.
 let observed;const control=await collectSwimEntryFrames(f,()=>{if(observed===undefined)observed=Math.random();});
 const first=(Math.imul(913,1664525)+1013904223)>>>0;assert.equal(observed,first/2**32);assert.equal(control.randomCalls,1);assert.equal(control.randomObservation.finalState,first);assert.equal(control.randomValuesHash,createHash('sha256').update(JSON.stringify([first])).digest('hex'));assert.equal(verifyRandomObservation(control),true);assert.equal(Math.random,originalRandom);f.reset();
});
