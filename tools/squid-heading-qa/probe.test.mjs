import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {collectHeadingFrames} from './probe.mjs';
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
test('native heading QA uses actual input and restores global state even when capture fails',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4,transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined}),saved=Object.fromEntries(KEYS.map(k=>[k,f.G[k]])),children=[...f.G.scene.children],rows=[];
 const result=await collectHeadingFrames(f,({row})=>rows.push(row));
 assert.equal(result.rows.length,4);assert.equal(result.sourceBankAwaited,true);assert.deepEqual(rows.map(r=>r.name),['dry-right-12','swim-right-12','swim-right-60','swim-stop-120']);
 // A bent Sqd_ToSquid surface is not the straight head-bone chord. Do not
 // assert their pitch equality; paired receipts preserve each surface measurement.
 for(const r of rows){assert(Math.abs(Math.atan2(Math.sin(r.skinned.heading-r.heading),Math.cos(r.skinned.heading-r.heading)))<1e-6,'actual drawn mantle follows full source axis');assert([...r.skinned.mantle,...r.skinned.width,r.skinned.pitch,r.skinned.roll].every(Number.isFinite));}
 for(const r of rows.slice(0,2)){assert(r.heading>0&&r.heading<=Math.PI/2,'normal-input first dive cannot pass its +X target');assert.deepEqual(r.inputKeys,['ShiftLeft','KeyA']);}
 for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);
 await assert.rejects(()=>collectHeadingFrames(f,()=>{throw Error('capture fault');}),/capture fault/);for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);f.reset();
});
