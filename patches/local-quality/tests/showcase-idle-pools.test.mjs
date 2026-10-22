import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptShowcaseIdlePools} from '../showcase-idle-pools-adapter.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/idle-followup-baseline-c0938a3f.json',import.meta.url)));
const raw=frozen.files['inkwave-public/src/game/showcase.js'];
const once=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b)};
const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/showcase.js',import.meta.url),'utf8');
function classes(code){
 const helpers=code.slice(code.indexOf('const TAU ='),code.indexOf('// ================================================================================================ geometry'));
 const pools=code.slice(code.indexOf('const _m4 ='),code.indexOf('// Swim paths'));
 // Geometry is shared by both fixtures; this test observes pool matrices,
 // colors/counts and every state/RNG change, without claiming pixel output.
 return new Function('THREE','lerp',helpers+'\nfunction splatGeometry(){return new THREE.PlaneGeometry(1,1)}\nfunction confettiGeometry(){return new THREE.PlaneGeometry(1,1)}\n'+pools+'\nreturn {InkFX,Confetti,Sparkles,InkTrail};')(THREE,(a,b,t)=>a+(b-a)*t);
}
const before=classes(raw),after=classes(adaptShowcaseIdlePools('src/game/showcase.js',source,once));
function make(C,name){let state=17,draws=0;const random=()=>{draws++;return((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296)},root=new THREE.Group(),mat=new THREE.MeshBasicMaterial();return{pool:name==='Confetti'?new C(root,random):new C(root,mat,random),draws:()=>draws};}
function snapshot(p){const out={};for(const[k,v]of Object.entries(p)){if(ArrayBuffer.isView(v))out[k]=Buffer.from(v.buffer,v.byteOffset,v.byteLength);else if(typeof v==='number')out[k]=v;}
 for(const key of ['mesh','splats','rings','paper','foil'])if(p[key]){const m=p[key];out[key]={count:m.count,matrix:Buffer.from(m.instanceMatrix.array.buffer),matrixVersion:m.instanceMatrix.version,color:m.instanceColor&&Buffer.from(m.instanceColor.array.buffer),colorVersion:m.instanceColor?.version};}return out;}
const color=new THREE.Color(.2,.3,.5),decks=[{x:0,y:0,z:0,r:20}];
function spawn(p,name,n){for(let i=0;i<n;i++){const x=(i%7)*.03,z=(i%11)*.02;if(name==='InkFX')p.drop(x,.2+(i%9)*.1,z,.1,-.2,.1,.03,1+i%4,.1+i%5*.1);else if(name==='Confetti')p.spawn(x,1,z,.1,.2,.1,i%4===0);else if(name==='Sparkles')p.spawn(x,1,z,.1,color,.1+i%7*.1);else p.add(x,0,z,.1,.2,.3,color,.1+i%9*.1);}}
for(const hz of [30,60,120])for(const name of Object.keys(before))test(name+' exact active/overflow/expiry/clear parity at '+hz+'Hz',()=>{
 const pair=[make(before[name],name),make(after[name],name)];
 for(let frame=0;frame<hz*3;frame++){
  for(const {pool:p}of pair){if(frame===1||frame===hz)spawn(p,name,name==='InkTrail'?580:380);if(frame===Math.floor(hz*1.5)){p.clear();spawn(p,name,1);}if(frame===hz*2)p.clear();p.update(1/hz,decks);}
  assert.deepEqual(snapshot(pair[1].pool),snapshot(pair[0].pool),name+' frame '+frame);assert.equal(pair[1].draws(),pair[0].draws());
 }
});
for(const hz of [30,60,120])test('60 seconds of fully idle pools visits zero array slots at '+hz+'Hz',()=>{
 let reads=0;for(const name of Object.keys(after)){const {pool:p}=make(after[name],name);for(const key of ['K','SA','SL','RA','RL','ST','A','L'])if(p[key])p[key]=new Proxy(p[key],{get(target,key){if(/^\d+$/.test(String(key)))reads++;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});for(let i=0;i<hz*60;i++)p.update(1/hz,decks);for(const key of ['mesh','splats','rings','paper','foil'])if(p[key])assert.equal(p[key].count,0);}assert.equal(reads,0);
});
test('a final bomb may spawn behind the scan even when its draw pools all expire in that update',()=>{
 const pair=[make(before.InkFX,'InkFX'),make(after.InkFX,'InkFX')];for(const {pool:p}of pair){for(let i=0;i<150;i++)p.drop(0,1,0,0,-1,0,.03,i===149?2:3,i===149?6:0);p.update(5,decks);assert.equal(p.mesh.count,0);assert(p.K.slice(0,9).some(Boolean));p.update(1/60,decks);assert(p.mesh.count>0);}assert.deepEqual(snapshot(pair[1].pool),snapshot(pair[0].pool));assert.equal(pair[1].draws(),pair[0].draws());
});
