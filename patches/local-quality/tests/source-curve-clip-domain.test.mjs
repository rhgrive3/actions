import test from 'node:test';
import assert from 'node:assert/strict';
import {poseRotationFixture,poseSnapshot} from './pose-rotation-fixture.mjs';

test('clip-domain fast path preserves every shipped clip at boundaries and fractional seeks',async()=>{
 const apis=await Promise.all([poseRotationFixture(true),poseRotationFixture()]);
 let clips=0,poses=0;
 for(const variant of ['Player00','Player01','Player_Squid']){
  const banks=apis.map(a=>a.bank(variant)),out=banks.map((b,i)=>new apis[i].SourcePose(b));
  for(const clip of banks[0].meta.clips){
   for(const [frame,loop] of [[-.25,true],[clip.frames*.371,false],[clip.frames+.25,false]]){
    for(let i=0;i<2;i++)banks[i].sample(clip.name,frame,out[i],loop);
    assert.deepEqual(poseSnapshot(out[1]),poseSnapshot(out[0]),`${variant}/${clip.name}/${frame}`);
    poses++;
   }
   assert.equal(banks[1].layouts.get(banks[1].clips.get(clip.name)).coversClip,true);
   clips++;
  }
 }
 console.log(JSON.stringify({scope:'all packed clips, exact raw/local/world poses',clips,poses}));
});

test('short, zero-length and unsorted custom domains retain the general curve clamp',async()=>{
 const api=await poseRotationFixture(),Float=api.bank('Player_Squid').data.constructor;
 const bone={name:'joint_root',parent:-1,flags:0,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
 for(const [first,last,frames,covered] of [[0,10,10,true],[-5,15,10,true],[2,8,10,false],[8,2,10,false],[0,0,0,false],[-0,-0,-0,false]]){
  const data=new Float(26);data.set([1,1,1,0,0,0,0,0,0,1]);
  data.set([3,16,0,0,1,0,0,20,2,22],10);data.set([first,last,2,3,7,0],20);
  const clip={name:'test',base:0,curves:10,curveCount:1,rotationMode:'eulerXYZ',frames,loop:true,boneFlags:[0]};
  const bank=new api.SourceBank({byteLength:data.byteLength,bones:[bone],clips:[clip]},data.buffer),out=new api.SourcePose(bank);
  for(const frame of [-20,-0,0,.3,5,10,30])for(const loop of [false,true]){
   bank.sample('test',frame,out,loop,false);
   const bounded=loop&&frames>0?api.mod(frame,frames):api.clamp(frame,0,frames);
   assert.ok(Object.is(out.raw[3],api.curveValue(bank.data,10,bounded)),`${first}/${last}/${frames}/${frame}/${loop}`);
  }
  assert.equal(bank.layouts.get(clip).coversClip,covered);
  assert.throws(()=>bank.sample('test',NaN,out),/Nonfinite source frame/);
 }
});

test('warmed WalkHold sampling removes exactly the redundant curve clamps',async()=>{
 const api=await poseRotationFixture(),bank=api.bank('Player00'),out=new api.SourcePose(bank);
 bank.sample('WalkHold_Nrml',3,out,false,false);
 const clip=bank.clips.get('WalkHold_Nrml'),layout=bank.layouts.get(clip),math=api.VM_MATH,min=math.min;
 const counts=[];
 for(const covered of [false,true]){
  layout.coversClip=covered;let calls=0;math.min=(...args)=>{calls++;return min(...args);};
  try{bank.sample(clip,3,out,false,false);}finally{math.min=min;}
  counts.push(calls);
 }
 const bound=Array.from(layout.dst).filter(i=>i>=0).length;
 assert.equal(counts[0]-counts[1],bound);
 assert.deepEqual(counts,[81,1]);
 console.log(JSON.stringify({scope:'one warmed Player00 WalkHold sample, no FK',curveClampsRemoved:bound,minCallsBefore:counts[0],minCallsAfter:counts[1]}));
});
