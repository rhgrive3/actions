import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const source=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function loader(context,imports){const m=new vm.SourceTextModule(source+'\nexport const testInferenceSize=()=>CHANNEL_INFERENCE.size;',{context});await m.link(spec=>{const values=imports[spec];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context});});await m.evaluate();return m.namespace;}
async function pngFixture({failRead=false}={}){
 const names=['a.png','o.png','n.png','r.png'],requests=[],canvases=[],images=[];let reads=0;
 const files=new Map(names.map((name,i)=>{const bytes=new Uint8Array(26);bytes[8]=i+1;bytes[25]=6;return[name,bytes.buffer];}));
 const context=vm.createContext({console,Blob,DOMException,AbortController,TextDecoder,TextEncoder,
  createImageBitmap:async(input,options)=>{const image={width:options.resizeWidth||8,height:options.resizeHeight||8,close(){this.closed=true;this.width=this.height=0;}};images.push(image);return image;},
  OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h;canvases.push(this);}getContext(){return{drawImage(){},getImageData(_x,_y,w,h){reads++;if(failRead)throw Error('readback');return{data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>[17,0,99,255][i%4])};}};}}
 });
 const imports={'three':THREE,'./registry.mjs':{nativeStageURL:(_id,file)=>file},'./build-config.mjs':{nativeStageBuild:{mode:'browser-direct'}},'./source-data.mjs':{loadBrowserSource(){}},'./source-cache.mjs':{async sourceBytes(_id,url){requests.push(url);return files.get(url);}}},api=await loader(context,imports);
 const make=(salt=0)=>({integrity:Object.fromEntries(names.map((name,i)=>[name,{bytes:26,gitSha1:(i+1+salt*4).toString(16).padStart(40,'0')}])),manifest:{sourceMode:'browser-direct',materials:{m:{albedo:'a.png',maps:{opacity:'o.png',normal:'n.png',roughness:'r.png'},channels:{}}},objects:[{active:true,material:'m'}]}});
 return{make,requests,canvases,images,get reads(){return reads;},size:api.testInferenceSize,load(data,limit=8){return api.loadNativeTextures('fixture',data,{capabilities:{getMaxAnisotropy:()=>4}},'high',new AbortController().signal,limit);}};
}
const retire=textures=>{for(const t of new Set(textures.values())){t.image?.close?.();t.dispose();}};
test('verified channel summaries avoid repeat readback without avoiding any authenticated file request',async()=>{
 const f=await pngFixture(),a=f.make(),first=await f.load(a);assert.equal(f.reads,4);assert.equal(f.requests.length,4);assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));retire(first);
 const b=f.make(),second=await f.load(b);assert.equal(f.reads,4);assert.equal(f.requests.length,8);assert.deepEqual(b.manifest.materials,a.manifest.materials);retire(second);
 const smaller=await f.load(f.make(),4);assert.equal(f.reads,8);assert.equal(f.requests.length,12);retire(smaller);
 for(let i=1;i<=66;i++)retire(await f.load(f.make(i)));assert.equal(f.size(),256);assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));
 const before=f.reads;retire(await f.load(f.make()));assert.ok(f.reads>before,'old scalar entries are evicted at the bound');
});
test('failed channel inference still clears every canvas backing and closes partial images',async()=>{
 const f=await pngFixture({failRead:true});await assert.rejects(f.load(f.make()),/readback/);assert.ok(f.canvases.length>0);assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));assert.ok(f.images.every(i=>i.closed));assert.equal(f.size(),0);
});

async function preparedFixture({constrained=false,fail=false}={}){
 const sha=b=>createHash('sha256').update(b).digest('hex'),buffers=new Map(),pin={};let active=0,peak=0,bodyRequests=0;const signals=[];
 const arrays={vertices:new Float32Array(24),indices:new Uint32Array([0,1,2]),collision:new Float32Array(9),normals:new Float32Array(3),flags:new Uint32Array(1),objects:new Uint32Array(1),bvh:new Float32Array(8),order:new Uint32Array(1),triangleFace:new Int32Array(1),mask:new Uint8Array(1)};
 const manifest={schema:1,id:'fixture',geometry:{collisionTriangles:1},gridCells:1};buffers.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 for(const[k,v]of Object.entries(arrays))buffers.set(k+'.bin',Buffer.from(v.buffer));for(const[k,v]of buffers)pin[k]={bytes:v.length,sha256:sha(v)};buffers.set('integrity.json',Buffer.from(JSON.stringify(pin)));
 const error=Error('binary fetch failed'),context=vm.createContext({console,AbortController,DOMException,TextEncoder,TextDecoder,crypto:webcrypto,fetch:async(file,{signal}={})=>{
  const bytes=buffers.get(file);assert.ok(bytes,file);if(file.endsWith('.bin')){bodyRequests++;signals.push(signal);active++;peak=Math.max(peak,active);try{await tick();if(fail&&file==='vertices.bin')throw error;if(signal.aborted)throw new DOMException('Aborted','AbortError');}finally{active--;}}
  return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 }}),api=await loader(context,{'three':THREE,'./registry.mjs':{nativeStageURL:(_id,file)=>file},'./build-config.mjs':{nativeStageBuild:{mode:'local-prepared',stages:[{id:'fixture',integritySha256:sha(buffers.get('integrity.json'))}]}},'./source-data.mjs':{loadBrowserSource(){}},'./source-cache.mjs':{sourceBytes(){throw Error('unexpected source path');}}});
 const parent=new AbortController();return{error,parent,signals,get peak(){return peak;},get bodyRequests(){return bodyRequests;},load:()=>api.loadNativeData('fixture',parent.signal,{constrained})};
}
test('prepared binary payloads retain exact arrays with at most two constrained or three desktop requests',async()=>{
 for(const constrained of [false,true]){const f=await preparedFixture({constrained}),data=await f.load();assert.equal(f.peak,constrained?2:3);assert.equal(f.bodyRequests,10);assert.equal(data.triangles.length,9);assert.deepEqual([...data.indices],[0,1,2]);assert.equal(f.parent.signal.aborted,false);}
});
test('prepared binary failure stops admission and preserves the first error while cancelling siblings',async()=>{
 const f=await preparedFixture({fail:true});await assert.rejects(f.load(),e=>e===f.error);assert.equal(f.bodyRequests,3);assert.equal(f.parent.signal.aborted,false);assert.ok(f.signals.every(s=>s.aborted));
});

test('ink tile membership narrows at exactly 65536 tiles and keeps draw offsets Uint32',()=>{
 const text=fs.readFileSync(new URL('../runtime/native-ink-chunks.mjs',import.meta.url),'utf8'),{NativeInkMesh,partitionNativeInk}=new Function('THREE',text.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn {NativeInkMesh,partitionNativeInk};')(THREE);
 for(const count of [3,65536,65537]){
  const p=new Float32Array(count*9);for(let i=0;i<count;i++)p.set([i*32,0,0,i*32+1,0,0,i*32,0,1],i*9);const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(p,3)),mesh=new NativeInkMesh(geometry,new THREE.MeshBasicMaterial());
  assert.equal(mesh.chunks.length,count);assert.equal(mesh._triangleTile.constructor.name,count<=65536?'Uint16Array':'Uint32Array');assert.equal(mesh._runTiles.constructor,mesh._triangleTile.constructor);assert.equal(mesh._triangleTile[count-1],count-1);assert.ok(mesh._runStarts instanceof Uint32Array);assert.ok(mesh._runEnds instanceof Uint32Array);assert.equal(mesh._runEnds[count-1],count*3);
  if(count===3){const plain=new THREE.BufferGeometry().setAttribute('position',geometry.getAttribute('position')),mapping=new Uint32Array(count),chunks=partitionNativeInk(plain,16,mapping);assert.deepEqual([...mapping],[0,1,2]);assert.ok(chunks.every(g=>g.isBufferGeometry));chunks.forEach(g=>g.dispose());plain.dispose();}
  mesh.dispose();mesh.material.dispose();
 }
});
