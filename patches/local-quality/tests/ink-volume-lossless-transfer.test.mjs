import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const prior=fs.readFileSync(new URL('./fixtures/ink-volume-before-lossless-transfer-b528.mjs.txt',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(prior).digest('hex'),'3165a9fc2007c974981a54963b2f7d942481c454019c52be937320453ad9ff24','complete independent pre-0dd b528 runtime');
const currentFile=path.join(process.env.INKWAVE_BUILT_SITE||root,'patches/local-quality/ink-volume/runtime.mjs');
const current=fs.readFileSync(currentFile,'utf8');
const renderer=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
function between(start,end) {
  const a=renderer.indexOf(start),b=renderer.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a&&renderer.indexOf(start,a+start.length)<0,'one exact native Three owner');
  return renderer.slice(a,b);
}
const Attributes=new Function(between('function WebGLAttributes( gl ) {','\nvar alphahash_fragment')+';return WebGLAttributes;')();
const Objects=new Function(between('function WebGLObjects( gl, geometries, attributes, bindingStates, info ) {','\nconst toneMappingMap')+';return WebGLObjects;')();
const set4=new Function(between('function setValueV4f( gl, v ) {','\n// Single matrix')+';return setValueV4f;')();
const consumeShaderFlag=new Function('material','WebGLUniforms','_gl','getUniformList','materialProperties','m_uniforms','textures',between('if ( material.isShaderMaterial && material.uniformsNeedUpdate === true ) {','\n\t\t\tif ( material.isSpriteMaterial )'));
async function load(source) {
  const context=vm.createContext({Uint8Array,Uint16Array,Uint32Array,Int16Array,Float32Array});
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const [name,value] of Object.entries(THREE))this.setExport(name,value);},{context});
  const module=new vm.SourceTextModule(source,{context});
  await module.link(spec=>{assert.ok(spec==='three'||spec.endsWith('/vendor/three/build/three.module.js'),'only actual Three dependency');return three;});
  await module.evaluate();return module.namespace.InkVolumes;
}
const [Before,After]=await Promise.all([load(prior),load(current)]);
function pack() {
  return {schema:'inkwave-volume-v1',patterns:[0,1].map(()=>({width:2,height:2,fps:30,frames:[0,1,2].map(()=>({
    rgba:new Uint8Array(16).fill(255),levels:[0,1].map(()=>({
      positions:new Float32Array([0,0,0,1,0,0,0,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),
      uvs:new Float32Array([0,0,1,0,0,1]),indices:new Uint16Array([0,1,2]),
    })),
  }))}))};
}
const color=(r,g,b)=>new THREE.Color().setRGB(r,g,b);
function source(c,age=0,x=0) {return {age,owner:{color:c},pos:new THREE.Vector3(x,0,-3),vel:new THREE.Vector3(0,0,-1)};}
function rig(Engine) {
  const root=new THREE.Group(),light={sunDir:new THREE.Vector3(0,1,0),sunCol:color(1,1,1),sky:color(1,1,1),ground:color(.2,.2,.2)};
  const engine=new Engine(root,light,{capacity:8}),asset=engine.register('fixture',pack());
  const calls=[],deleted=new Set();let bound,attributes,objects;
  const info={render:{frame:0}};
  const gl={ARRAY_BUFFER:34962,FLOAT:5126,
    createBuffer(){return {bytes:null};},bindBuffer(_type,buffer){bound=buffer;},
    bufferData(_type,array){bound.bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength).slice();calls.push({kind:'initial',bytes:array.byteLength});},
    bufferSubData(_type,offset,array,start=0,count=array.length-start){bound.bytes.set(new Uint8Array(array.buffer,array.byteOffset+start*array.BYTES_PER_ELEMENT,count*array.BYTES_PER_ELEMENT),offset);calls.push({kind:'update',bytes:count*array.BYTES_PER_ELEMENT,offset});},
    deleteBuffer(buffer){assert.ok(!deleted.has(buffer),'native shared instance buffer deleted once');deleted.add(buffer);},
  };
  function freshContext() {
    attributes=Attributes(gl);
    objects=Objects(gl,{get:(_object,geometry)=>geometry,update(){}},attributes,{releaseStatesOfObject(){}},info);
  }
  freshContext();
  function render(batches=engine.activeBatches) {
    info.render.frame++;
    for(const b of batches) {
      objects.update(b.mesh);objects.update(b.fringe);
      const attribute=b.mesh.instanceColor,gpu=attributes.get(attribute).buffer.bytes;
      assert.deepEqual(gpu.subarray(0,b.n*12),new Uint8Array(attribute.array.buffer,0,b.n*12),'every visible GPU color bit matches actual CPU source');
    }
  }
  function submit(colors,{age=0,draw=true}={}) {
    engine.begin();for(let i=0;i<colors.length;i++)assert.equal(engine.submit('fixture',source(colors[i],age,i),.1),true);engine.end();
    if(draw)render();
  }
  return {engine,asset,root,light,calls,deleted,render,submit,freshContext,
    buffer:attribute=>attributes.get(attribute)?.buffer,
    snapshot:()=>Array.from(asset.batches,b=>({n:b.n,matrix:Array.from(b.mesh.instanceMatrix.array),colors:Array.from(b.mesh.instanceColor.array),meshCount:b.mesh.count,fringeCount:b.fringe.count})),
  };
}

test('actual native first upload consumes ranges; stable colors omit transfer while matrix mutation remains visible',t=>{
  const old=rig(Before),now=rig(After);t.after(()=>{old.engine.dispose();now.engine.dispose();});
  for(const r of [old,now])r.submit([color(.25,.5,.75)]);
  const b=now.asset.batches[0],attribute=b.mesh.instanceColor;
  assert.equal(attribute,b.fringe.instanceColor);assert.equal(b.mesh.instanceMatrix,b.fringe.instanceMatrix);
  assert.equal(attribute.updateRanges.length,0,'native initial bufferData invokes the owned onUpload hook');
  const version=attribute.version,oldVersion=old.asset.batches[0].mesh.instanceColor.version;
  const transferCount=now.calls.length;
  for(const r of [old,now])r.submit([color(.25,.5,.75)]);
  assert.equal(attribute.version,version,'same stored color does not request another transfer');
  assert.ok(old.asset.batches[0].mesh.instanceColor.version>oldVersion,'independent old runtime exposes the redundant request');
  assert.equal(now.calls.length-transferCount,1,'matrix still uploads; color does not');
  const mutable=color(.25,.5,.75);mutable.g=.125;
  for(const r of [old,now])r.submit([mutable]);
  assert.deepEqual(now.snapshot(),old.snapshot());
  assert.equal(now.buffer(attribute).bytes.length,attribute.array.byteLength);
});

test('skipped render, shrinking counts and clear retain dirty hidden tails until native consumption',t=>{
  for(const Engine of [Before,After]) {
    const r=rig(Engine);t.after(()=>r.engine.dispose());
    const blue=Array.from({length:8},()=>color(0,0,1)),red=Array.from({length:8},()=>color(1,0,0));
    r.submit(blue);r.submit(red,{draw:false});
    const b=r.asset.batches[0],a=b.mesh.instanceColor;
    if(Engine===After)assert.deepEqual(Array.from(a.updateRanges,x=>[x.start,x.count]),[[0,24]]);
    r.engine.clear();assert.equal(b.mesh.visible,false);assert.equal(b.mesh.count,0);
    r.submit(red.slice(0,1));
    if(Engine===After)assert.deepEqual(r.buffer(a).bytes,new Uint8Array(a.array.buffer),'pending tail is not clipped to newly visible prefix');
    r.submit(red);
    assert.deepEqual(r.buffer(a).bytes,new Uint8Array(a.array.buffer));
    assert.equal(a.updateRanges.length,0);
  }
});

test('clipping an unconsumed dirty tail is a non-vacuous native upload negative control',t=>{
  const r=rig(After);t.after(()=>r.engine.dispose());
  const blue=Array.from({length:8},()=>color(0,0,1)),red=Array.from({length:8},()=>color(1,0,0));
  r.submit(blue);r.submit(red,{draw:false});
  const b=r.asset.batches[0],a=b.mesh.instanceColor;
  // Counterfactual unsafe queue truncation: the CPU tail is already red, so
  // recoloring it red later cannot discover the lost unconsumed GPU update.
  a.updateRanges[0].count=3;
  r.submit(red.slice(0,1));
  assert.notDeepEqual(r.buffer(a).bytes,new Uint8Array(a.array.buffer));
  assert.throws(()=>r.submit(red),/every visible GPU color bit/);
});

test('context owner reset rebuilds unchanged colors and native disposal releases shared GPU attributes exactly once',t=>{
  for(const Engine of [Before,After]) {
    const r=rig(Engine);t.after(()=>r.engine.dispose());
    const disposals=new Map();for(const resource of r.asset.resources)resource.addEventListener('dispose',()=>disposals.set(resource,(disposals.get(resource)||0)+1));
    r.submit([color(.5,.25,.125)]);const b=r.asset.batches[0],a=b.mesh.instanceColor,first=r.buffer(a);
    r.freshContext();r.submit([color(.5,.25,.125)]);
    assert.notEqual(r.buffer(a),first);assert.deepEqual(r.buffer(a).bytes,new Uint8Array(a.array.buffer));
    r.engine.unregister('fixture');assert.equal(r.root.children.length,0);assert.equal(r.engine.metrics.bytes,0);
    assert.equal(r.deleted.size,4,'each of the two native context owners releases its shared matrix/color buffers once');
    for(const resource of r.asset.resources)assert.equal(disposals.get(resource),1);
    const next=r.engine.register('fixture',pack());assert.notEqual(next,r.asset);r.engine.dispose();r.engine.dispose();
    assert.equal(r.root.children.length,0);assert.equal(r.engine.assets.size,0);
  }
});

test('200-frame old/new counterfactual preserves mutable colors, sparse batches, skipped renders and context boundaries',t=>{
  const old=rig(Before),now=rig(After);t.after(()=>{old.engine.dispose();now.engine.dispose();});
  let state=123456;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let frame=0;frame<200;frame++) {
    const colors=Array.from({length:frame%9},()=>color(frame%7===0?-0:Math.fround(random()),Math.fround(random()),Math.fround(random())));
    for(const r of [old,now]) {
      r.submit(colors,{age:(frame%3)/30,draw:frame%5!==0});
      if(frame===50||frame===135)r.freshContext();if(frame===75)r.engine.clear();
    }
    assert.deepEqual(now.snapshot(),old.snapshot());
    assert.equal(now.engine.metrics.active,old.engine.metrics.active);assert.equal(now.engine.metrics.triangles,old.engine.metrics.triangles);
  }
});

function uniformRig(Engine) {
  const r=rig(Engine),programs=new Map();let selected,currentId=-1,traversals=0,writes=0;
  const gl={uniform4f(_address,...values){selected.bounds=values;writes++;}};
  const upload=()=>{traversals++;set4.call(selected,gl,selected.material.uniforms.uFrameBounds.value);};
  return {...r,frame(){currentId=-1;},resetPrograms(){programs.clear();currentId=-1;},counts:()=>({traversals,writes}),draw(mesh){
    const material=mesh.material;mesh.onBeforeRender(null,null,null,mesh.geometry,material);
    const key=JSON.stringify(material.defines);if(!programs.has(key))programs.set(key,{cache:[],bounds:null,addr:0});selected=programs.get(key);selected.material=material;
    // Native setProgram refreshes on a material change and render resets the
    // current material ID. Consume its exact additional ShaderMaterial path.
    if(currentId!==material.id){currentId=material.id;upload();}
    consumeShaderFlag(material,{upload},gl,()=>[],{},material.uniforms,{});
    assert.deepEqual(selected.bounds,material.uniforms.uFrameBounds.value.toArray());return selected.bounds.slice();
  }};
}

test('shared opaque/fringe materials preserve native GPU frame bounds across frames, LODs, ordering and program reset',t=>{
  const old=uniformRig(Before),now=uniformRig(After);t.after(()=>{old.engine.dispose();now.engine.dispose();});
  for(let frame=0;frame<40;frame++) {
    const results=[];
    for(const r of [old,now]) {
      r.engine.begin();r.frame();const batches=frame%2?r.asset.batches.slice().reverse():r.asset.batches,rows=[];
      for(const pass of ['mesh','fringe'])for(const b of batches){rows.push(r.draw(b[pass]));rows.push(r.draw(b[pass]));}
      if(frame===17)r.resetPrograms();results.push(rows);
    }
    assert.deepEqual(results[1],results[0]);
  }
  assert.equal(now.counts().writes,old.counts().writes,'native vector uniform cache already avoids identical GPU calls');
  assert.ok(now.counts().traversals<old.counts().traversals,'optimization avoids redundant JS upload traversal, not required GPU values');
});

test('frame lighting/color mutation and explicit material dirty requests retain their native ownership',t=>{
  const old=uniformRig(Before),now=uniformRig(After);t.after(()=>{old.engine.dispose();now.engine.dispose();});
  const camera=new THREE.PerspectiveCamera(60,1,.1,100);
  for(let frame=0;frame<4;frame++) {
    camera.position.set(frame,0,0);camera.lookAt(0,0,-3);
    const uniforms=[];
    for(const r of [old,now]) {
      r.light.sunDir.set(1,1+frame,0).normalize();r.light.sunCol.setRGB(.1*frame,.5,.75);
      r.engine.begin(camera);assert.equal(r.engine.submit('fixture',source(color(.25,.5,.75)),.1),true);r.engine.end();r.frame();
      const b=r.asset.batches[0];b.mesh.material.uniformsNeedUpdate=true;r.draw(b.mesh);
      assert.equal(b.mesh.material.uniformsNeedUpdate,false,'actual native ShaderMaterial path consumes caller dirty request');
      uniforms.push(Object.fromEntries(['uSunDirV','uUpV','uSunCol','uSky','uGround'].map(name=>[name,r.asset.patterns[0].uniforms[name].value.toArray()])));
    }
    assert.deepEqual(uniforms[1],uniforms[0]);
  }
});
