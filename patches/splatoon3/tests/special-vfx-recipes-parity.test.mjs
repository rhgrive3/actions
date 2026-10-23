import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const original=fs.readFileSync(new URL('./fixtures/special-vfx-recipes-before-queue.txt',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
const candidate=source.slice(source.indexOf('  spark(kind,'),source.indexOf('  // retained shapes'));
function fixture(code,q){
 let word=23,calls=0;const random=()=>{calls++;return((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);};
 const rnd=(a=1,b=0)=>b+random()*(a-b),rows=[];
 const raw=(...v)=>{const [x,y,z,vx,vy,vz,life,s0,s1,r,g,b,a,kind=0,drag,grav,rot,spin,seed,stretch,fadeIn,buoy]=v;
  rows.push(Array.from(new Float32Array([x,y,z,vx,vy,vz,0,Math.max(.001,life),s0,s1,drag??1.5,grav??0,r,g,b,a,kind,rot??random()*Math.PI*2,spin??0,seed??random(),stretch??0,fadeIn??.06,buoy??0])));
 };
 const pool={spawnRaw:raw,spawn(...args){const o=args[14];return raw(...args.slice(0,14),o?.drag,o?.grav,o?.rot,o?.spin,o?.seed,o?.stretch,o?.fadeIn,o?.buoy);}};
 const C=new Function('rnd','vfxRandom','clamp','TAU','PUFF','SPARK','return class Recipes{'+code+'}')(rnd,random,(x,a,b)=>x<a?a:x>b?b:x,Math.PI*2,{CHUNK:2,PETAL:4,SMOKE:0},{STREAK:0,STAR:1});
 const self=new C();self.kit={puffs:pool,sparks:pool,q};self.v=Array.from({length:8},()=>new THREE.Vector3());
 return {self,rows,calls:()=>calls};
}
for(const q of [.35,1,1.5])test('every recipe retains exact 23 Float32 state slots and RNG order q='+q,()=>{
 for(const name of ['streaks','stars','chunks','petals','smoke'])for(const n of [1,12,26,60])for(const glow of [false,true]){
  const a=fixture(original,q),b=fixture(candidate,q),args=[new THREE.Vector3(1,2,3),n,7,[2.1,.4,.1],{glow,drag:0,grav:4,stretch:.03,life:.7,kind:2}];
  a.self[name](...args);b.self[name](...args);assert.deepEqual(b.rows,a.rows,name+' n='+n+' glow='+glow);assert.equal(b.calls(),a.calls());
 }
});
test('direct puff/drop defaults including explicit null stretch retain original values',()=>{
 for(const options of [undefined,{}, {stretch:null},{stretch:0,drag:0,seed:.8,rot:0},{shrink:.9,grav:0}]){
  const a=fixture(original,1),b=fixture(candidate,1),p=new THREE.Vector3(1,2,3);
  a.self.puff(2,p,1,2,3,.7,.2,.1,[2,.7,.3],.5,options);b.self.puff(2,p,1,2,3,.7,.2,.1,[2,.7,.3],.5,options);
  a.self.drop(p,1,2,3,.8,.4,[2,.7,.3],options);b.self.drop(p,1,2,3,.8,.4,[2,.7,.3],options);
  assert.deepEqual(b.rows,a.rows);assert.equal(b.calls(),a.calls());
 }
});
