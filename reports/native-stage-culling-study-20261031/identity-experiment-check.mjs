import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import * as work from '../../patches/native-stages/runtime/native-work.mjs';
async function load(){const c=vm.createContext({console}),m=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context:c});const d={three:m(THREE),'./native-work.mjs':m(work),'../../../src/world/levelMaterial.js':m({createLevelMaterial(){}}),'./native-paint-detail.mjs':m({enableNativePaintDetail(){}})};const x=new vm.SourceTextModule(fs.readFileSync(process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT,'utf8')+'\nexport {nativeSkipIdentity};',{context:c});await x.link(n=>d[n]);await x.evaluate();return x.namespace.nativeSkipIdentity;}
const skip=await load();
test('identity fast path preserves all finite ordinary and signed-zero results',()=>{
 let allowed=0,seed=9284;for(let n=0;n<10000;n++){const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/4294967296-.5)*1e6};const m=new THREE.Matrix4();for(let i=0;i<16;i++)m.elements[i]=n%9===0&&i%5===0?0:next();if(n%13===0)m.elements[n%16]=-0;const identity=new THREE.Matrix4(),want=m.clone().multiply(identity),fast=m.clone();if(skip(fast,identity))allowed++;else fast.multiply(identity);assert.deepEqual(fast.elements,want.elements);}
 assert.ok(allowed>5000,'fast path not exercised');
});
test('negative zeros, nonfinite matrices, changed hooks and nonidentity world fall back',()=>{
 const v=new THREE.Matrix4(),w=new THREE.Matrix4();assert.equal(skip(v,w),true);
 for(const value of [-0,NaN,Infinity,-Infinity]){const x=v.clone();x.elements[1]=value;assert.equal(skip(x,w),false);}
 const neg=w.clone();neg.elements[1]=-0;assert.equal(skip(v,neg),false);
 for(const x of [new THREE.Matrix4().makeScale(-1,1,1),new THREE.Matrix4().makeTranslation(1,2,3)])assert.equal(skip(v,x),false);
 for(const name of ['multiply','multiplyMatrices']){const saved=THREE.Matrix4.prototype[name];try{THREE.Matrix4.prototype[name]=function(...args){return saved.apply(this,args)};assert.equal(skip(v,w),false);}finally{THREE.Matrix4.prototype[name]=saved;}}
});
test('methods customized before import fail closed',async()=>{
 const name='multiplyMatrices',saved=THREE.Matrix4.prototype[name];try{THREE.Matrix4.prototype[name]=function(...args){return saved.apply(this,args)};const custom=await load();assert.equal(custom(new THREE.Matrix4(),new THREE.Matrix4()),false);}finally{THREE.Matrix4.prototype[name]=saved;}
});
test('ordinary native moving cameras exercise the shortcut',()=>{
 let eligible=0;for(let i=0;i<120;i++){const t=i/119,c=new THREE.PerspectiveCamera(65,1.5,.1,500);c.position.set(Math.sin(t*4)*8,16,-70+t*140);const yaw=Math.sin(t*8)*.7;c.lookAt(c.position.x+Math.sin(yaw)*20,14,c.position.z+Math.cos(yaw)*20);c.updateMatrixWorld();const v=new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);if(skip(v,new THREE.Matrix4()))eligible++;}console.log(JSON.stringify({eligible,cameras:120}));assert.ok(eligible>=90,'ordinary camera eligibility');
});
