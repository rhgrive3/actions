import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adaptPoseRotation} from '../pose-rotation-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {REL,baseline,poseRotationFixture,poseSnapshot} from './pose-rotation-fixture.mjs';
test('frozen source bank and guarded build-only rotation calculation',()=>{
 // Pin the actual unchanged fixture bytes: Pages run #39279657999 demonstrated
 // this digest while all 548 clip / 2740 pose-equivalence comparisons passed.
 assert.equal(createHash('sha256').update(baseline).digest('hex'),'e3a5d948780dba4a83624a76e1bf648ed1ab87ebb3800b6b3b983fba7c5f594b');
 assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/pose-rotation-adapter.mjs'));
 const next=adaptPoseRotation(REL,baseline,replaceOnce);
 assert.throws(()=>adaptPoseRotation(REL,next,replaceOnce),/conflict/);assert.throws(()=>adaptPoseRotation(REL,'',replaceOnce),/conflict/);
});
test('every shipped clip keeps exact raw, local and world poses through seeks, loops and alternating output poses',async()=>{
 const apis=await Promise.all([poseRotationFixture(true),poseRotationFixture()]);let poses=0,clips=0;
 for(const variant of ['Player00','Player01','Player_Squid']){
  const banks=apis.map(a=>a.bank(variant)),outputs=banks.map((b,i)=>[new apis[i].SourcePose(b),new apis[i].SourcePose(b)]);
  for(const clip of banks[0].meta.clips){
   for(const [frame,loop]of [[0,false],[clip.frames*.37,false],[clip.frames,false],[-1,true],[clip.frames+1.25,true]]){
    const slot=poses%2;
    for(let k=0;k<2;k++){const p=outputs[k][slot];p.q[0].set(.3,.5,.7,.9);p.p[0].set(999,888,777);banks[k].sample(clip.name,frame,p,loop);}
    assert.deepEqual(poseSnapshot(outputs[1][slot]),poseSnapshot(outputs[0][slot]),`${variant}/${clip.name}/${frame}/${loop}`);poses++;
   }
   clips++;
  }
  assert.equal(banks[1]._iwRotations,undefined,'no new pose cache storage');
 }
 console.log(JSON.stringify({scope:'all original packed motion data, exact Float64 poses',variants:3,clips,poses,cacheBytes:0}));
});
test('rotation keys preserve negative zero, quaternion normalization, mode changes and overwritten outputs',async()=>{
 const apis=await Promise.all([poseRotationFixture(true),poseRotationFixture()]),banks=apis.map(a=>a.bank('Player00')),poses=banks.map((b,i)=>new apis[i].SourcePose(b));
 for(const mode of ['eulerXYZ','quaternion','eulerXYZ','quaternion'])for(const values of [[0,0,0,0],[-0,0,-0,1],[.25,-.5,.75,.9],[.25,-.5,.75,.9],[1e-20,2e-20,-1e-20,1]]){
  for(const p of poses){p.raw.set(values,6);p.q[0].set(1,2,3,4);p.fromRaw(mode);}
  assert.deepEqual(poseSnapshot(poses[1]),poseSnapshot(poses[0]),mode+'/'+values);
 }
 for(const p of poses)assert.throws(()=>p.fromRaw('unsupported'),/Unsupported rotation mode/);
});
test('zero channels avoid exact sin/cos work across live animation frames',async()=>{
 const results=[];
 for(const old of [true,false]){
  const api=await poseRotationFixture(old),bank=api.bank('Player00'),pose=new api.SourcePose(bank),math=api.VM_MATH,native=math.sin;let calls=0;
  math.sin=(...a)=>{calls++;return native(...a);};
  try{for(let i=0;i<360;i++)bank.sample('WalkHold_Nrml',i*.5,pose,true);}finally{math.sin=native;}
  results.push(calls);
 }
 assert.ok(results[1]<results[0]*.75,'avoid at least 25% of actual sine evaluations');
 console.log(JSON.stringify({scope:'Player00 WalkHold_Nrml, 360 sampled frames',before:results[0],after:results[1],reduction:1-results[1]/results[0]}));
});
