import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {collectHeadingFrames} from './probe.mjs';
const KEYS=['actors','level','physics','paint','match','rig','projectiles','time','camera','mode','settings','teamColors'];
test('native heading QA uses actual input and restores global state even when capture fails',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>Math.random(),transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined}),saved=Object.fromEntries(KEYS.map(k=>[k,f.G[k]])),children=[...f.G.scene.children],rows=[],originalUpdate=f.Character.prototype._updateSquid;
 const result=await collectHeadingFrames(f,({row})=>rows.push(row));
 assert.equal(result.simulationTicks,360);assert(result.randomCalls>0);assert.match(result.canonicalTraceHash,/^[a-f0-9]{64}$/);assert.match(result.sourceHeadingTraceHash,/^[a-f0-9]{64}$/);assert.equal(result.bankContract.status,'existing-bank-response-verified');assert.equal(result.bankContract.advances,152);assert.equal(result.bankContract.precision,1e-8);assert.equal(result.rows.length,4);assert.equal(result.sourceBankAwaited,true);assert.deepEqual(rows.map(r=>r.name),['dry-right-12','swim-right-12','swim-right-60','swim-stop-120']);
 // A bent Sqd_ToSquid surface is not the straight head-bone chord. Do not
 // assert their pitch equality; paired receipts preserve each surface measurement.
 for(const r of rows){assert(Math.abs(Math.atan2(Math.sin(r.skinned.heading-r.heading),Math.cos(r.skinned.heading-r.heading)))<1e-6,'actual drawn mantle follows full source axis');assert([...r.skinned.mantle,...r.skinned.width,r.skinned.pitch,r.skinned.roll].every(Number.isFinite));}
 for(const r of rows.slice(0,2)){assert(r.heading>0&&r.heading<=Math.PI/2,'normal-input first dive cannot pass its +X target');assert.deepEqual(r.inputKeys,['ShiftLeft','KeyA']);}
 for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.Character.prototype._updateSquid,originalUpdate);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);
 await assert.rejects(()=>collectHeadingFrames(f,()=>{throw Error('capture fault');}),/capture fault/);for(const k of KEYS)assert.equal(f.G[k],saved[k]);assert.equal(f.Character.prototype._updateSquid,originalUpdate);assert.equal(f.G.scene.children.length,children.length);for(let i=0;i<children.length;i++)assert.equal(f.G.scene.children[i],children[i]);f.reset();
});

test('actual Actor probe rejects a wrong bank coefficient and an extra drawn pivot tilt',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>Math.random(),transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined}),C=f.Character.prototype,original=C._updateSquid,INSTALL=Symbol.for('inkwave.s3.swim-motion.install.v1'),state=ch=>Object.getPrototypeOf(ch)[INSTALL]?.states.get(ch);
 try{for(const fault of ['bank coefficient','drawn pivot tilt']){let injected=0;C._updateSquid=function(dt,...rest){const before=state(this),yaw=before?.yaw,age=before?.age,result=original.call(this,dt,...rest),after=state(this);if(before===after&&after&&after.age>age&&dt>0){if(fault==='bank coefficient'){const turn=Math.atan2(Math.sin(after.yaw-yaw),Math.cos(after.yaw-yaw)),clamp=x=>Math.max(-.5,Math.min(.5,x)),delta=(clamp(-turn/dt*.09)-clamp(-turn/dt*.08))*-Math.expm1(-6*dt);if(Math.abs(delta)>1e-8){after.bank+=delta;injected++;}}else{this.squid.pivot.quaternion.multiply(new f.THREE.Quaternion().setFromAxisAngle(new f.THREE.Vector3(1,0,0),.001));injected++;}}return result;};
  const wrapped=C._updateSquid;await assert.rejects(()=>collectHeadingFrames(f),fault==='bank coefficient'?/existing bank response bank/:/existing bank response drawn pivot/);assert(injected>0,fault+' reached the actual consumer');assert.equal(C._updateSquid,wrapped,'observer restores the fault wrapper on rejection');C._updateSquid=original;}}
 finally{C._updateSquid=original;f.reset();}
});
