import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';import {makeWaveData} from '../../../inkwave-public/src/world/wave-data.js';import {prewarmWaveTexture} from '../../../inkwave-public/src/world/wave-prewarm.js';import {geometryFixture} from './geometry-build-fixture.mjs';
const before=new Function('THREE',fs.readFileSync(new URL('./fixtures/world358/wave-before.js.txt',import.meta.url),'utf8')+'return makeWaveTexture;')(THREE);
test('pure worker bytes match original texture algorithm at every RGBA byte',()=>{
 for(const[size,seed]of[[256,11],[64,11],[16,0],[7,47],[32,999]]){const t=before(size,seed),data=makeWaveData(size,seed);assert.deepEqual(data,t.image.data);t.dispose();}
});
function fake(extra={}){const w={terminated:0,postMessage(message){this.request=message;},terminate(){this.terminated++;},...extra};return w;}
test('prewarm hands over exactly one owned buffer and terminates worker without retaining listeners',async()=>{
 const w=fake(),controller=new AbortController(),pending=prewarmWaveTexture({workerFactory:()=>w,signal:controller.signal}),buffer=new ArrayBuffer(256*256*4);new Uint8Array(buffer)[42]=91;assert.deepEqual(w.request,{size:256,seed:11});w.onmessage({data:{size:256,seed:11,buffer}});const bytes=await pending;assert.equal(bytes.buffer,buffer);assert.equal(bytes[42],91);assert.equal(w.terminated,1);assert.equal(w.onmessage,null);controller.abort();assert.equal(w.terminated,1);
});
test('unsupported, CSP, malformed, decode error, abort and timeout all settle to the one synchronous fallback',async()=>{
 assert.equal(await prewarmWaveTexture({workerFactory(){throw Error('CSP');}}),null);
 for(const data of [{},{size:256,seed:12,buffer:new ArrayBuffer(256*256*4)},{size:256,seed:11,buffer:new ArrayBuffer(4)}]){const w=fake(),p=prewarmWaveTexture({workerFactory:()=>w});w.onmessage({data});assert.equal(await p,null);assert.equal(w.terminated,1);}
 for(const event of ['onerror','onmessageerror']){const w=fake(),p=prewarmWaveTexture({workerFactory:()=>w});w[event]({preventDefault(){}});assert.equal(await p,null);assert.equal(w.terminated,1);}
 const controller=new AbortController(),w=fake(),p=prewarmWaveTexture({workerFactory:()=>w,signal:controller.signal});controller.abort();assert.equal(await p,null);assert.equal(w.terminated,1);
 const timed=fake();assert.equal(await prewarmWaveTexture({workerFactory:()=>timed,timeout:1}),null);assert.equal(timed.terminated,1);
 const early=new AbortController();early.abort();let starts=0;assert.equal(await prewarmWaveTexture({signal:early.signal,workerFactory(){starts++;}}),null);assert.equal(starts,0);
});
test('prepared and fallback _buildSea retain the complete texture contract and release staging reference',async()=>{
 const api=await geometryFixture({transform:(rel,s)=>rel==='src/world/environment.js'?s+'\nglobalThis.originalWave=makeWaveTexture;':s}),data=makeWaveData(),expected=before();for(const prepared of [null,data]){const t=api.context.originalWave(256,11,prepared);assert.deepEqual(Buffer.from(t.image.data),Buffer.from(expected.image.data));for(const key of ['wrapS','wrapT','magFilter','minFilter','generateMipmaps','anisotropy','colorSpace','type','format'])assert.equal(t[key],expected[key],key);t.dispose();}expected.dispose();const e=Object.create(api.Environment.prototype);e.footprint=[];e._initUniforms();e.root=new api.THREE.Group();e.renderer={};e._waveData=data;e._buildSea();assert.equal(e.U.uWaveTex.value.image.data,data);assert.equal(e._waveData,null);e.sea.geometry.dispose();e.seaMat.dispose();e.U.uWaveTex.value.dispose();
});
