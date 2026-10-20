import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {ROOT,REL,composedBefore,poseRotationFixture,poseSnapshot} from './pose-rotation-fixture.mjs';
// source-bank.js is directly authored. The former pose-rotation, fromRaw/fk,
// curve-kind and segment-scale build rewrites are part of the tracked source;
// the production composition immediately before that move is the oracle.
const live=fs.readFileSync(path.join(ROOT,'inkwave-public',REL),'utf8');
const rangeSnapshot=(p,n)=>{const s=poseSnapshot(p);for(const k of ['world','wp','wq'])s[k]=s[k].slice(0,n);return s;};
test('source bank is directly authored and the pre-migration oracle is frozen',()=>{
 assert.equal(createHash('sha256').update(composedBefore).digest('hex'),'cd5e1ed76ea15ebd31c1831e1b89525d112610393bebe03940c520d1c16bf1a9');
 assert.equal(adaptBuildSource(REL,live),live,'no build-time rewrite of source-bank.js');
 assert.ok(!fs.existsSync(path.join(ROOT,'patches/local-quality/pose-rotation-adapter.mjs')));
 assert.ok(![...BUILD_ONLY_PATCH_MODULES].some(m=>m.includes('pose-rotation-adapter')));
});
test('every shipped clip keeps exact raw, local and world poses through seeks, loops and alternating output poses',async()=>{
 const apis=await Promise.all([poseRotationFixture(true),poseRotationFixture()]);let poses=0,clips=0,ranged=0;
 for(const variant of ['Player00','Player01','Player_Squid']){
  const banks=apis.map(a=>a.bank(variant)),outputs=banks.map((b,i)=>[new apis[i].SourcePose(b),new apis[i].SourcePose(b)]);
  assert.deepEqual(poseSnapshot(banks[1].rest),poseSnapshot(banks[0].rest),variant+' rest');
  const range=banks[1].fkCount(['toe_L','toe_R','head',...banks[1].bones.filter(b=>/^Hair/.test(b.name)).map(b=>b.name)]);
  for(const clip of banks[0].meta.clips){
   // Seeks, loop wraps, clamped ends, forward playback and reverse scrubbing
   // all reuse each output pose's per-curve key segment.
   const frames=[0,clip.frames*.37,clip.frames,-1,clip.frames+1.25];
   for(let t=0;t<clip.frames*1.2;t+=1.7)frames.push(t);for(let t=clip.frames;t>0;t-=3.1)frames.push(t);
   for(const [k,frame]of frames.entries()){
    const slot=poses%2,loop=k%3===0?true:k%3===1?false:undefined;
    for(let j=0;j<2;j++){const p=outputs[j][slot];p.q[0].set(.3,.5,.7,.9);p.p[0].set(999,888,777);banks[j].sample(clip.name,frame,p,loop);}
    assert.deepEqual(poseSnapshot(outputs[1][slot]),poseSnapshot(outputs[0][slot]),`${variant}/${clip.name}/${frame}/${loop}`);poses++;
    if(typeof range==='number'&&k%5===0){
     const fresh=apis.map((a,j)=>new a.SourcePose(banks[j]));banks[0].sample(clip.name,frame,fresh[0],loop);banks[1].sample(clip.name,frame,fresh[1],loop,range);
     assert.deepEqual(rangeSnapshot(fresh[1],range),rangeSnapshot(fresh[0],range),`${variant}/${clip.name}/${frame} FK range`);ranged++;
    }
   }
   clips++;
  }
 }
 console.log(JSON.stringify({scope:'all original packed motion data, exact Float64 poses',variants:3,clips,poses,rangedPoses:ranged}));
});
test('rotation keys preserve negative zero, quaternion normalization, mode changes, FK ranges and overwritten outputs',async()=>{
 const apis=await Promise.all([poseRotationFixture(true),poseRotationFixture()]),banks=apis.map(a=>a.bank('Player00')),poses=banks.map((b,i)=>new apis[i].SourcePose(b));
 for(const mode of ['eulerXYZ','quaternion','eulerXYZ','quaternion'])for(const values of [[0,0,0,0],[-0,0,-0,1],[.25,-.5,.75,.9],[.25,-.5,.75,.9],[1e-20,2e-20,-1e-20,1]]){
  for(const p of poses){p.raw.set(values,6);p.q[0].set(1,2,3,4);p.fromRaw(mode);}
  assert.deepEqual(poseSnapshot(poses[1]),poseSnapshot(poses[0]),mode+'/'+values);
 }
 for(const p of poses)assert.throws(()=>p.fromRaw('unsupported'),/Unsupported rotation mode/);
 // Segment-scale compensation including zero, tiny and negative parent scales.
 for(const scale of [0,1e-13,-1e-13,-2,3,1]){
  poses.forEach(p=>{p.flags.fill(1<<23);p.s.forEach(s=>s.set(scale,-scale,scale));p.fk();});
  assert.deepEqual(poseSnapshot(poses[1]),poseSnapshot(poses[0]),'compensated scale '+scale);
 }
 // A range leaves later world values untouched; the full FK then matches.
 banks[1].sample('WalkHold_Nrml',3,poses[1],true);const before=poseSnapshot(poses[1]);
 banks[1].sample('RunHold_Nrml',7,poses[1],true,5);
 assert.deepEqual(poseSnapshot(poses[1]).world.slice(5),before.world.slice(5));
 banks[0].sample('RunHold_Nrml',7,poses[0],true);poses[1].fk();
 assert.deepEqual(poseSnapshot(poses[1]),poseSnapshot(poses[0]));
 assert.equal(banks[1].fkCount(['missing']),true,'unknown bones fall back to complete FK');
 // copy/mix ranges touch only the leading bones; non-numeric counts mean all.
 const a=new apis[1].SourcePose(banks[1]),b=new apis[1].SourcePose(banks[1]),c=new apis[1].SourcePose(banks[1]);
 banks[1].sample('WalkHold_Nrml',2,a,true);banks[1].sample('RunHold_Nrml',9,b,true);c.copy(a);
 c.mix(b,.35,7);const ref=new apis[1].SourcePose(banks[1]).copy(a).mix(b,.35);
 for(let i=0;i<a.p.length;i++)assert.deepEqual([c.p[i].toArray(),c.q[i].toArray()],i<7?[ref.p[i].toArray(),ref.q[i].toArray()]:[a.p[i].toArray(),a.q[i].toArray()]);
 c.copy(b,3);assert.deepEqual(c.q[2].toArray(),b.q[2].toArray());assert.deepEqual(c.q[3].toArray(),ref.q[3].toArray());
 c.copy(a).mix(b,.35,true);assert.deepEqual(poseSnapshot(c.fk()),poseSnapshot(ref.fk()));
});
test('unanimated rotations and coherent playback avoid exact trigonometry and key searches',async()=>{
 const results=[];
 for(const old of [true,false]){
  const api=await poseRotationFixture(old),bank=api.bank('Player00'),pose=new api.SourcePose(bank),math=api.VM_MATH,native=math.sin;let calls=0;
  math.sin=(...a)=>{calls++;return native(...a);};
  try{for(let i=0;i<360;i++)bank.sample('WalkHold_Nrml',i*.5,pose,true);}finally{math.sin=native;}
  results.push(calls);
 }
 assert.ok(results[1]<results[0]*.9,'avoid at least 10% of actual sine evaluations');
 console.log(JSON.stringify({scope:'Player00 WalkHold_Nrml, 360 sampled frames',sinBefore:results[0],sinAfter:results[1],reduction:1-results[1]/results[0]}));
});
