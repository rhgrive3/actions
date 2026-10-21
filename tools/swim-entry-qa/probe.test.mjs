import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {collectSwimEntryFrames,FRAME_NAMES} from './probe.mjs';
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
// Introspection only: the installed source/emitted owner advances the state.
const snapshot=ch=>{const s=Object.getPrototypeOf(ch)[Symbol.for('inkwave.s3.swim-motion.install.v1')]?.states.get(ch);return s?{active:true,age:s.age,yaw:s.yaw}:{active:false};};
test('real mobile consumer removes initial/reentry mantle snap and restores the fixture after capture failure',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>Math.random(),transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted swim test cannot use authored-source adaptation');}:undefined});f.swimMotionSnapshot=snapshot;
 const saved=Object.fromEntries(KEYS.map(k=>[k,f.G[k]])),children=[...f.G.scene.children];const result=await collectSwimEntryFrames(f);
 assert.deepEqual(result.rows.map(r=>r.name),FRAME_NAMES);assert.equal(result.rows.length,4);assert.equal(result.sourceBankAwaited,true);assert(result.randomCalls>0);assert.match(result.canonicalTraceHash,/^[a-f0-9]{64}$/);
 for(const r of result.rows){assert.equal(r.sourceActive,true);assert.equal(r.active,true);assert(Math.abs(r.heading-r.skinned.heading)<1e-6);if(r.name.includes('follow'))assert(Math.abs(r.headingStep)<.01,'skinned owner-entry step '+r.headingStep);else{assert.equal(r.age,0);assert(Math.abs(r.swimYaw-r.skinned.heading)<1e-6);}}
 for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);
 await assert.rejects(()=>collectSwimEntryFrames(f,()=>{throw Error('capture fault');}),/capture fault/);for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);f.reset();
});
