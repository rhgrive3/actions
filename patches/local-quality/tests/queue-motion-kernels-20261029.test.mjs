import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {poseRotationFixture,poseSnapshot} from './pose-rotation-fixture.mjs';

const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/source-bank.js',import.meta.url),'utf8');
const baseline=fs.readFileSync(new URL('./fixtures/queue-source-bank-031426fc.mjs.txt',import.meta.url),'utf8');
// The experiment passed numerical parity but did not show a material gain on
// real shipped curves. Keep it as review evidence, outside production inputs.
const proposed=fs.readFileSync(new URL('./fixtures/queue-source-bank-candidate-20261029.mjs.txt',import.meta.url),'utf8');
assert.equal(crypto.createHash('sha256').update(proposed).digest('hex'),'9128df5c9a6e2471584f3bd6d1e55c2ff1f1062786d99f796bb00e184dd4fcca');
assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),'bab08f0596228dc4a3848988477caad35e78610f6d6f2f5359ae2e149690e04b');
function code(source,name){
  const row=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(x=>(x.declaration||x).type==='FunctionDeclaration'&&(x.declaration||x).id.name===name);
  assert.ok(row,name);const n=row.declaration||row;return source.slice(n.start,n.end);
}
const old=new Function('return ('+code(baseline,'segmentValue')+')')();
const candidate=new Function('return ('+code(proposed,'sampledSegmentValue')+')')();

test('known sample spans retain bit-exact coefficients, steps, special values and invalid-kind errors',()=>{
  let seed=103,comparisons=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const kind of [0,1,2,3,4,5,6,7])for(let curve=0;curve<160;curve++){
    const data=new Float32Array(128),n=1+curve%10,fo=16,ko=32;
    data[1]=kind<<4;data[4]=curve%9===0?-0:random()*4-2;data[5]=random()*2-1;data[7]=fo;data[8]=n;data[9]=ko;
    for(let j=0;j<n;j++)data[fo+j]=j+(curve%7===0&&j===2?-1:0);
    for(let j=ko;j<data.length;j++)data[j]=random()*6-3;
    if(curve<6)data[ko]=[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE][curve];
    for(const frame of [-Infinity,-1,-0,0,.23,1,3.9,n,n+2,Infinity,NaN])for(let i=0;i<n;i++){
      if(kind===3){assert.throws(()=>old(data,0,frame,i),{name:'RangeError',message:'Unsupported BFRES curve kind 3'});assert.throws(()=>candidate(data,0,frame,i,fo,n),{name:'RangeError',message:'Unsupported BFRES curve kind 3'});}
      else assert.ok(Object.is(candidate(data,0,frame,i,fo,n),old(data,0,frame,i)),kind+'/'+curve+'/'+frame+'/'+i);
      comparisons++;
    }
  }
  assert.ok(comparisons>70000);console.log(JSON.stringify({kernelComparisons:comparisons}));
});

test('public curveValue retains its exact implementation and dynamic reads',()=>{
  assert.doesNotMatch(raw,/sampledSegmentValue/,'unproven throughput experiment is not adopted into the shipped bank');
  assert.equal(code(raw,'curveValue'),code(baseline,'curveValue'));
  assert.equal(code(raw,'segmentValue'),code(baseline,'segmentValue'));
  const make=source=>new Function('clamp',code(source,'segmentValue')+';return ('+code(source,'curveValue')+')')((x,a,b)=>Math.max(a,Math.min(b,x)));
  const run=fn=>{const rows=[],data=Array(40).fill(0);data[1]=4<<4;data[4]=2;data[5]=3;data[7]=16;data[8]=2;data[9]=20;data[16]=0;data[17]=1;data[20]=7;data[21]=9;
    const proxy=new Proxy(data,{get(o,k){rows.push(k);return o[k];}});return {value:fn(proxy,0,.5),rows};};
  assert.deepEqual(run(make(raw)),run(make(baseline)));
});

test('all shipped source banks retain raw, local, FK and world poses and report real curve kinds',async()=>{
  const pair=await Promise.all([
    poseRotationFixture(false,{source:adaptBuildSource('src/game/motion/source-bank.js',baseline)}),
    poseRotationFixture(false,{source:adaptBuildSource('src/game/motion/source-bank.js',proposed)}),
  ]);
  let clips=0,poses=0;const kinds={};
  for(const name of ['Player00','Player01','Player_Squid']){
    const banks=pair.map(x=>x.bank(name)),out=banks.map((b,i)=>new pair[i].SourcePose(b));
    for(const clip of banks[0].meta.clips){
      for(let i=0;i<clip.curveCount;i++){const kind=(banks[0].data[clip.curves+i*10+1]>>4)&7;kinds[kind]=(kinds[kind]||0)+1;}
      for(const [frame,loop]of [[-.25,true],[0,false],[clip.frames*.371,false],[clip.frames,false],[clip.frames+.25,false]]){
        for(let i=0;i<2;i++)banks[i].sample(clip.name,frame,out[i],loop);
        assert.deepEqual(poseSnapshot(out[1]),poseSnapshot(out[0]),name+'/'+clip.name+'/'+frame);poses++;
      }
      clips++;
    }
  }
  assert.ok(clips>=500);console.log(JSON.stringify({clips,poses,curveKinds:kinds,scope:'all shipped banks; exact raw/local/world poses; not physical-device FPS'}));
});

test('naive squared plant threshold changes a real Three Vector3 boundary and is not adopted',()=>{
  const reach=.207,threshold=reach*.975,goal=new THREE.Vector3(.20182499999999998,2.634178031930877e-9,0),hip=new THREE.Vector3();
  assert.equal(goal.distanceTo(hip)>threshold,false);
  assert.equal(goal.distanceToSquared(hip)>threshold*threshold,true);
  const composed=adaptBuildSource('src/game/motion/retarget.js',fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/retarget.js',import.meta.url),'utf8'));
  assert.ok(composed.includes('f.goal.distanceTo(hip)>reach*.975||f.goal.distanceTo(f.free)>reach*.45'));
});
