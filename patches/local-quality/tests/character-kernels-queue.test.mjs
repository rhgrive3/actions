import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';
const read=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function geometry(g){return Object.fromEntries([...Object.entries(g.attributes).map(([n,a])=>[n,bytes(a.array)]),['index',bytes(g.index.array)]]);}
function leaf(code,names,G){return new Function('THREE','G',code.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {'+names+'};')(THREE,G);}
const oldSmooth='    for (let pass = 0; pass < 2; pass++) { const c = rho.slice(); for (let i = 0; i < N; i++) rho[i] = (c[Math.max(0, i - 2)] + c[Math.max(0, i - 1)] + c[i] + c[Math.min(N - 1, i + 1)] + c[Math.min(N - 1, i + 2)]) / 5; }';
const newSmooth='    const temp = new Float64Array(N);\n    for (let pass = 0; pass < 2; pass++) { const c = pass === 0 ? rho : temp, dst = pass === 0 ? temp : rho; for (let i = 0; i < N; i++) dst[i] = (c[Math.max(0, i - 2)] + c[Math.max(0, i - 1)] + c[i] + c[Math.min(N - 1, i + 1)] + c[Math.min(N - 1, i + 2)]) / 5; }';
test('actual TentacleSurface and tubes retain exact ring parameters and mesh buffers with two smoothing buffers',()=>{
 const code=read('src/game/character-hair.js'),G={settings:{quality:'high'}};
 const kernels=[leaf(replaceOnce(code,newSmooth,oldSmooth,'baseline smoothing'),'TentacleSurface,tentacleTube',G),leaf(code,'TentacleSurface,tentacleTube',G)];
 let cases=0;
 for(const N of [1,2,3,12,48,240])for(const radial of [6,11])for(const section of [false,true]){
  const surfaces=kernels.map(k=>new k.TentacleSurface([[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],
   {samples:N,radius:t=>.09*(1-t*.8),flat:t=>.6+t*.2,twist:t=>t*.7,section:section?(c,s,t)=>[c*(1+t*.1),s*.8]:undefined}));
  for(const bias of [0,.5,1,2])assert.deepEqual(surfaces[1].ringParams(24,bias),surfaces[0].ringParams(24,bias));
  const tubes=kernels.map((k,i)=>k.tentacleTube(surfaces[i],{rings:16,radial,capStart:section,tipSteps:3}));
  assert.deepEqual(geometry(tubes[1].geo),geometry(tubes[0].geo));for(const key of ['t','cs','sn','thick'])assert.deepEqual(tubes[1][key],tubes[0][key]);
  tubes.forEach(t=>t.geo.dispose());cases++;
 }
 console.log(JSON.stringify({scope:'actual Three.js tube geometry',cases,scratchBuffersBefore:2,scratchBuffersAfter:1}));
});

test('full production face generation retains byte-identical AO and attributes across quality and LOD',()=>{
 const code=read('src/game/character-face.js'),G={settings:{quality:'high'}};
 const newMouth=`    const mouth = acc.part[i] === 4 && acc.uv[i][1] > 0;
    const dz = mouth || sub === 11 || sub === 12 ? v.copy(MF.C).sub(acc.P[i]).dot(MF.F) : 0;
    if (mouth) { a = lerp(a, lerp(0.85, 0.3, sstep(0.003, 0.022, dz)), acc.uv[i][1]); }
    if (sub === 11) { a = lerp(0.9, 0.55, sstep(0.004, 0.011, dz)); }
    if (sub === 12) { a = lerp(0.8, 0.4, sstep(0.006, 0.024, dz)); }`;
 const oldMouth=`    if (acc.part[i] === 4 && acc.uv[i][1] > 0) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(a, lerp(0.85, 0.3, sstep(0.003, 0.022, dz)), acc.uv[i][1]); }
    if (sub === 11) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(0.9, 0.55, sstep(0.004, 0.011, dz)); }
    if (sub === 12) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(0.8, 0.4, sstep(0.006, 0.024, dz)); }`;
 const kernels=[leaf(replaceOnce(code,newMouth,oldMouth,'baseline mouth'),'buildFaceSkin,bakeAO,MF',G),leaf(code,'buildFaceSkin,bakeAO,MF',G)];
 let vertices=0,baselineClones=0,newClones=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far']){
  G.settings.quality=quality;const faces=kernels.map(k=>k.buildFaceSkin(lod));
  assert.deepEqual(geometry(faces[1].geo),geometry(faces[0].geo),quality+'/'+lod);
  assert.deepEqual(bytes(faces[1].ao),bytes(faces[0].ao),quality+'/'+lod+' AO');
  // Exercise the branch overlap explicitly with actual generated positions.
  faces.forEach(f=>{for(let i=0;i<f.acc.P.length;i++)if(f.acc.sub[i]===11||f.acc.sub[i]===12){f.acc.part[i]=4;f.acc.uv[i][1]=1;}});
  const clones=[0,0],restores=kernels.map((k,i)=>{const old=k.MF.C.clone;k.MF.C.clone=function(){clones[i]++;return old.call(this);};return()=>k.MF.C.clone=old;});
  let ao;try{ao=kernels.map((k,i)=>k.bakeAO(faces[i].acc,faces[i].geo.attributes.normal));}finally{restores.forEach(f=>f());}
  baselineClones+=clones[0];newClones+=clones[1];assert.deepEqual(bytes(ao[1]),bytes(ao[0]),'overlapping mouth and teeth/tongue');
  assert.deepEqual(kernels[1].MF.C.toArray(),kernels[0].MF.C.toArray(),'frame origin remains immutable');
  vertices+=faces[1].geo.attributes.position.count;faces.forEach(f=>f.geo.dispose());
 }
 assert.ok(baselineClones>0);assert.equal(newClones,0);
 console.log(JSON.stringify({scope:'actual face buffers/AO; no GPU or physical-device claim',variants:12,vertices,baselineClones,newClones}));
});

test('sweep retains undeformed cs/sn and exact geometry with section, cap, flat, twist and transported frames',()=>{
 const source=read('src/game/character-geo.js');
 let next=source.slice(source.indexOf('export function sweep('),source.indexOf('\n/** Grid over',source.indexOf('export function sweep('))).replace('export ','');
 let old=replaceOnce(next,'const th = (k / radial) * Math.PI * 2, c0 = Math.cos(th), s0 = Math.sin(th); let c = c0, s = s0;','const th = (k / radial) * Math.PI * 2; let c = Math.cos(th), s = Math.sin(th);','baseline sweep trig');
 old=replaceOnce(old,'cs.push(c0); sn.push(s0);','cs.push(Math.cos(th)); sn.push(Math.sin(th));','baseline sweep attributes');
 const make=code=>new Function('THREE','V3','clamp',code+'\nreturn sweep;')(THREE,THREE.Vector3,(x,a,b)=>x<a?a:x>b?b:x),kernels=[make(old),make(next)];
 for(const radial of [3,6,11,24])for(const section of [false,true])for(const capStart of [false,true])for(const transport of [false,true]){
  const opts={seg:12,radial,capStart,capEnd:!capStart,transport,outward:(p,out)=>out.set(p.x,1,p.z),radius:t=>.08*(1-t*.7),flat:t=>.6+t*.2,twist:t=>t*.7,section:section?(c,s,t)=>[c*(1+t*.2),s*.75]:undefined};
  const outputs=kernels.map(k=>k([[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],opts));
  assert.deepEqual(geometry(outputs[1].geo),geometry(outputs[0].geo));for(const key of ['t','cs','sn'])assert.deepEqual(bytes(outputs[1][key]),bytes(outputs[0][key]));outputs.forEach(o=>o.geo.dispose());
 }
});

test('native IK shares yaw trig only when the existing production leg guard admits work',()=>{
 const code=read('src/game/character.js'),start=code.indexOf('    let pelvisSin,pelvisCos;'),end=code.indexOf('    // Actual source motion',start),next=code.slice(start,end);
 assert.ok(next.includes('if (!_sourceLegsOwnPose && (!this._oobPoseTailSkip || this.replant || !this.feetValid)) for'));
 const old=next.replace('    let pelvisSin,pelvisCos;\n','').replace('(pelvisSin??=Math.sin(hyw))','Math.sin(hyw)').replace('(pelvisCos??=Math.cos(hyw))','Math.cos(hyw)');
 const run=(body,yaw,skip,replant,valid,sourceOwns)=>{
  const math=Object.create(Math),calls={sin:0,cos:0},out=[];for(const name of ['sin','cos'])math[name]=x=>{calls[name]++;return Math[name](x);};
  const make=new Function('Math','THREE','return function(P,_sourceLegsOwnPose){const HIPS=0,KNEEL=2,KNEER=5,_v1=new THREE.Vector3(),_pN=new THREE.Vector3(),_pT=new THREE.Vector3();'+body+'}')(math,THREE);
  const obj={_oobPoseTailSkip:skip,replant,feetValid:valid,limbs:{legL:{},legR:{}},_fL:new THREE.Vector3(.2,0,.3),_fR:new THREE.Vector3(-.2,0,.4),_fLq:new THREE.Quaternion(.1,.2,.3,.9).normalize(),_fRq:new THREE.Quaternion(-.2,.3,.1,.9).normalize(),_solveLimb(limb,t,p,q,w,side){out.push([t.toArray(),p.toArray(),q.toArray(),w,side]);}};
  make.call(obj,[0,yaw,.1,.2,.3,-.1,-.2,-.3],sourceOwns);return{calls,out};
 };
 for(const yaw of [0,-0,1e-300,-3.1,1.4,NaN,Infinity])for(const skip of [false,true])for(const replant of [false,true])for(const valid of [false,true])for(const sourceOwns of [false,true]){
  const a=run(old,yaw,skip,replant,valid,sourceOwns),b=run(next,yaw,skip,replant,valid,sourceOwns);assert.deepEqual(b.out,a.out);
  const active=!sourceOwns&&(!skip||replant||!valid);assert.deepEqual(a.calls,{sin:active?2:0,cos:active?2:0});assert.deepEqual(b.calls,{sin:active?1:0,cos:active?1:0});
 }
});
