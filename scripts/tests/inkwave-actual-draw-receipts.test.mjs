import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import {installActualDrawReceipts} from '../lib/inkwave-actual-draw-receipts.mjs';

function fixture(){
  const values={gain:Float32Array.of(-0,1),image:2},program={},gpuTexture={},properties=new WeakMap();
  const material=new THREE.ShaderMaterial(),texture=new THREE.DataTexture(new Uint8Array(4),1,1);
  material.uniforms.image={value:texture};properties.set(texture,{__webglTexture:gpuTexture});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  let active=7,nativeCalls=0,fail=false;
  const methods={
    getParameter(key){if(key===gl.ACTIVE_TEXTURE)return active;if(key===gl.CURRENT_PROGRAM)return program;if(key===gl.DRAW_FRAMEBUFFER_BINDING)return null;if(key===gl.TEXTURE_BINDING_2D)return gpuTexture;return 0;},
    activeTexture(v){active=v;},getIndexedParameter(){throw Error('SAMPLER_BINDING is not an indexed WebGL query');},
    getProgramParameter(){return 2;},getActiveUniform(_,i){return i?{name:'image',size:1,type:gl.SAMPLER_2D}:{name:'gain',size:1,type:gl.FLOAT_VEC2};},
    getUniformLocation(_,name){return name;},getUniform(_,name){return values[name];},
    getAttachedShaders(){return [11,12];},getShaderParameter(s){return s;},getShaderSource(s){return 'shader '+s;},
    getTexParameter(){if(fail)throw Error('observation failed');return 1;},
    drawArrays(){nativeCalls++;},drawElements(){nativeCalls++;},drawArraysInstanced(){nativeCalls++;},drawElementsInstanced(){nativeCalls++;},
  };
  let nextConstant=100;
  const gl=new Proxy(methods,{get(o,k){if(!(k in o)&&typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))o[k]=nextConstant++;return o[k];}});
  const G={scene,env:{},game:{R:{composer:{passes:[]}}},renderer:{getContext:()=>gl,properties:{get:o=>properties.get(o)||{}},info:{programs:[{program,cacheKey:'probe'}]}}};
  return {G,gl,values,get active(){return active;},get nativeCalls(){return nativeCalls;},set fail(v){fail=v;}};
}

test('observe actual draw uniforms and sampler bindings without substituting draws or active texture state',()=>{
  const f=fixture(),original=f.gl.drawElements,probe=installActualDrawReceipts(f.G);
  f.gl.activeTexture(29);f.gl.drawElements(4,12,2,0);
  assert.equal(f.active,29);
  f.values.gain=Float32Array.of(0,1.0000001192092896);f.gl.activeTexture(33);f.gl.drawElements(4,12,2,0);
  const data=JSON.parse(JSON.stringify(probe.stop()));
  assert.equal(f.nativeCalls,2);assert.equal(f.active,33);assert.equal(f.gl.drawElements,original);
  assert.deepEqual(data.draws[0].uniforms.gain,[{negativeZero:true},1]);
  assert.deepEqual(data.draws[1].uniforms.gain,[0,1.0000001192092896]);
  assert.equal(data.draws[0].samplers[0].unit,2);
  assert.match(data.draws[0].samplers[0].texture.owners[0],/uniforms\/image\/value$/);
  assert.equal(data.unknownTextures.length,0);assert.equal(data.programs.length,1);
});

test('failed sampler observation restores active unit and allows all native methods to be restored',()=>{
  const f=fixture(),original=f.gl.drawArrays,probe=installActualDrawReceipts(f.G);
  f.gl.activeTexture(91);f.fail=true;
  assert.throws(()=>f.gl.drawArrays(4,0,3),/observation failed/);
  assert.equal(f.active,91);probe.stop();assert.equal(f.gl.drawArrays,original);
  f.gl.drawArrays(4,0,3);assert.equal(f.nativeCalls,1);
});
