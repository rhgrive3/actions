import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import {collectRenderInputReceipts} from '../lib/inkwave-render-input-receipts.mjs';
const sha=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function fixture(){
  const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();
  const padded=Float32Array.from([99,1,2,3,88]),position=new Float32Array(padded.buffer,4,3);
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setIndex([0]);
  const material=new THREE.ShaderMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1);mesh.name='probe';scene.add(mesh);
  const data=new Uint8Array([8,1,2,3,4,9]),texture=new THREE.DataTexture(new Uint8Array(data.buffer,1,4),1,1);
  material.uniforms.tNoise={value:texture};
  const G={scene,env:{},game:{R:{composer:{passes:[{uniforms:{tNoise:{value:texture}}}]}}}};
  return {G,mesh,position,texture};
}
test('hash exact geometry/index/instance and texture view bytes, including offsets',async()=>{
  const {G,mesh,position,texture}=fixture(),r=await collectRenderInputReceipts(G);
  assert.equal(r.buffers.find(b=>b.name==='position').sha256,sha(position));
  assert.equal(r.buffers.find(b=>b.name==='index').sha256,sha(mesh.geometry.index.array));
  assert.equal(r.buffers.find(b=>b.name==='instanceMatrix').sha256,sha(mesh.instanceMatrix.array));
  assert.equal(r.textures.length,1);assert.equal(r.textures[0].owners.length,2);
  assert.equal(r.textures[0].sources[0].sha256,sha(texture.image.data));
});
test('one source byte or matrix float changes its receipt even when dimensions match',async()=>{
  const {G,mesh,texture}=fixture(),a=await collectRenderInputReceipts(G);
  texture.image.data[3]++;mesh.instanceMatrix.array[12]=.0000001;
  const b=await collectRenderInputReceipts(G);
  assert.notEqual(a.textures[0].sources[0].sha256,b.textures[0].sources[0].sha256);
  assert.notEqual(a.buffers.find(b=>b.name==='instanceMatrix').sha256,b.buffers.find(b=>b.name==='instanceMatrix').sha256);
});
test('scalar observations retain signed zero and nonfinite values across JSON serialization',async()=>{
  const {G,mesh}=fixture();mesh.matrixWorld.elements[1]=-0;mesh.material.uniforms.special={value:[NaN,Infinity,-Infinity]};
  const r=JSON.parse(JSON.stringify(await collectRenderInputReceipts(G)));
  assert.deepEqual(r.meshStates[0].world[1],{negativeZero:true});
  assert.deepEqual(r.materialStates[0].uniforms.special,[{nonfinite:'NaN'},{nonfinite:'Infinity'},{nonfinite:'-Infinity'}]);
});
test('GPU-only textures remain explicitly unobserved rather than accepted as equal bytes',async()=>{
  const {G}=fixture();G.scene.environment=new THREE.WebGLRenderTarget(2,2).texture;
  const r=await collectRenderInputReceipts(G),e=r.textures.find(t=>t.owners.includes('scene/environment'));
  assert.equal(e.sources[0].kind,'gpu-only-or-unavailable');assert.equal(e.sources[0].sha256,undefined);
});
test('optional GPU observation restores native read binding and pack alignment after a failed read',async()=>{
  const {G}=fixture(),prior={old:true},target={target:true};let binding=prior,alignment=8;
  const gl={READ_FRAMEBUFFER_BINDING:1,PACK_ALIGNMENT:2,READ_FRAMEBUFFER:3,IMPLEMENTATION_COLOR_READ_FORMAT:4,IMPLEMENTATION_COLOR_READ_TYPE:5,RGBA:6,UNSIGNED_BYTE:7,NO_ERROR:0,
    getParameter(key){return key===1?binding:key===2?alignment:key===4?this.RGBA:this.UNSIGNED_BYTE;},getError:()=>0,
    bindFramebuffer(_,value){binding=value;},pixelStorei(_,value){alignment=value;},readPixels(){throw Error('deliberate read failure');}};
  G.renderer={getContext:()=>gl,info:{programs:[]},properties:{get:()=>({__webglFramebuffer:target})}};
  G.game.R.composer.renderTarget1=new THREE.WebGLRenderTarget(2,2);
  await assert.rejects(collectRenderInputReceipts(G,{gpuColors:true}),/deliberate read failure/);
  assert.equal(binding,prior);assert.equal(alignment,8);
});
